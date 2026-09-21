import type {
  CatalogDatabase,
  PriceMatrices,
  SottoModello,
  VarianteMontaggio,
  MatriceRiga,
} from "../schema/catalog.js";
import { ConfiguratoreError, pyListRepr } from "./errors.js";
import type { ConfigurazionePergola, ConfiguraInput, VoceCosto } from "./types.js";

/**
 * TypeScript port of prototype/pergola_engine.py's PergolaEngine.configura.
 * The algorithm (including its known quirks, e.g. auto-selecting
 * opzione_tecnica against the TOTAL L rather than per-module L when growth
 * is on "L") is ported as-is: this is a validated, already-in-use pricing
 * engine, not a redesign. See packages/pricing-engine/src/engine.test.ts
 * for the golden-output regression tests that pin this behavior.
 */
export class PergolaEngine {
  constructor(
    private readonly db: CatalogDatabase,
    private readonly priceMatrices: PriceMatrices,
    private readonly prodottoNome: string,
  ) {}

  static fromDatabase(
    db: CatalogDatabase,
    priceMatrices: PriceMatrices,
    prodottoNome?: string,
  ): PergolaEngine {
    return new PergolaEngine(db, priceMatrices, prodottoNome ?? db.prodotto.nome);
  }

  private sottoModello(nome: string): SottoModello {
    const sm = this.db.sotto_modelli[nome];
    if (!sm) {
      throw new ConfiguratoreError(
        `Sotto-modello '${nome}' non trovato. Disponibili: ${pyListRepr(Object.keys(this.db.sotto_modelli))}`,
      );
    }
    return sm;
  }

  private variante(sm: SottoModello, nome: string): VarianteMontaggio {
    const v = sm.varianti_montaggio[nome];
    if (!v) {
      throw new ConfiguratoreError(
        `Variante di montaggio '${nome}' non trovata. Disponibili: ${pyListRepr(Object.keys(sm.varianti_montaggio))}`,
      );
    }
    return v;
  }

  private opzioniDisponibili(sm: SottoModello): Record<string, { nome: string; L_max_cm: number }> {
    const opzioni = sm.opzioni_tecniche_lama ?? sm.opzioni_tecniche;
    if (!opzioni) {
      throw new ConfiguratoreError("Nessuna opzione tecnica definita per questo sotto-modello.");
    }
    return opzioni;
  }

  private opzione(sm: SottoModello, nome: string): { nome: string; L_max_cm: number } {
    const opzioni = this.opzioniDisponibili(sm);
    const opz = opzioni[nome];
    if (!opz) {
      throw new ConfiguratoreError(
        `Opzione tecnica '${nome}' non trovata. Disponibili: ${pyListRepr(Object.keys(opzioni))}`,
      );
    }
    return opz;
  }

  private validaColori(coloreStruttura: string, colorePlastica: string, avvisi: string[]): void {
    const colori = this.db.prodotto.colori;

    const nomeCompleto = (c: { ral?: string | null; nome_it: string }): string =>
      c.ral ? `${c.ral} ${c.nome_it}` : c.nome_it;

    const validiStruttura = new Set(colori.struttura_e_lame.standard.map(nomeCompleto));
    const supplementoStruttura = new Set(colori.struttura_e_lame.con_supplemento.map(nomeCompleto));
    const validiPlastica = new Set(colori.parti_plastiche.opzioni.map((c) => c.nome_it));

    const tuttiStruttura = new Set([...validiStruttura, ...supplementoStruttura]);
    if (!tuttiStruttura.has(coloreStruttura)) {
      throw new ConfiguratoreError(
        `Colore struttura '${coloreStruttura}' non valido. Disponibili: ${pyListRepr([...tuttiStruttura].sort())}`,
      );
    }
    if (!validiPlastica.has(colorePlastica)) {
      throw new ConfiguratoreError(
        `Colore parti plastiche '${colorePlastica}' non valido. Disponibili: ${pyListRepr([...validiPlastica].sort())}`,
      );
    }
    if (supplementoStruttura.has(coloreStruttura)) {
      avvisi.push(
        `Il colore struttura '${coloreStruttura}' richiede supplemento (non incluso nel calcolo automatico).`,
      );
    }
  }

  private matrice(ref: string): MatriceRiga[] {
    const m = this.priceMatrices[ref];
    if (!m) {
      throw new ConfiguratoreError(`Matrice prezzi '${ref}' non trovata.`);
    }
    return m;
  }

  private rigaPerProfondita(matrice: MatriceRiga[], pRichiesta: number): MatriceRiga {
    const ordinata = [...matrice].sort((a, b) => a.P_riferimento - b.P_riferimento);
    const riga = ordinata.find((r) => r.P_riferimento >= pRichiesta);
    if (!riga) {
      const max = ordinata[ordinata.length - 1]!.P_riferimento;
      throw new ConfiguratoreError(
        `Profondità richiesta (${pRichiesta} cm) supera il massimo di matrice (${max} cm).`,
      );
    }
    return riga;
  }

  private colonnaPerLarghezza(riga: MatriceRiga, lRichiesta: number): number {
    const colonne = Object.keys(riga.prezzi_per_L)
      .map(Number)
      .sort((a, b) => a - b);
    const colonna = colonne.find((c) => c >= lRichiesta);
    if (colonna === undefined) {
      const max = colonne[colonne.length - 1];
      throw new ConfiguratoreError(
        `Larghezza richiesta (${lRichiesta.toFixed(1)} cm) supera il massimo di matrice (${max} cm) per questa opzione tecnica.`,
      );
    }
    return colonna;
  }

  configura(input: ConfiguraInput): ConfigurazionePergola {
    const avvisi: string[] = [];

    const sm = this.sottoModello(input.sottoModello);
    const variante = this.variante(sm, input.varianteMontaggio);
    const vincoli = sm.vincoli_dimensionali;

    this.validaColori(input.coloreStruttura, input.colorePlastica, avvisi);

    if (input.altezzaMontantiCm > vincoli.H_max_cm) {
      throw new ConfiguratoreError(
        `Altezza richiesta (${input.altezzaMontantiCm} cm) supera il massimo per ${sm.nome} (${vincoli.H_max_cm} cm).`,
      );
    }

    const orientamento = variante.orientamento_crescita;

    // -- scelta opzione tecnica (es. altezza lama) --------------------------
    const opzioniDisp = this.opzioniDisponibili(sm);
    let opzioneTecnica = input.opzioneTecnica;
    if (opzioneTecnica === undefined) {
      const lModuloRichiesta = orientamento === "P" ? input.lRichiestaCm : undefined;
      const candidati = Object.entries(opzioniDisp).sort(
        (a, b) => a[1].L_max_cm - b[1].L_max_cm,
      );
      let selezionata: string | undefined;
      for (const [nomeOpz, datiOpz] of candidati) {
        const riferimentoL = lModuloRichiesta ?? input.lRichiestaCm;
        if (riferimentoL <= datiOpz.L_max_cm) {
          selezionata = nomeOpz;
          break;
        }
      }
      opzioneTecnica = selezionata ?? candidati[candidati.length - 1]![0];
    }

    const opz = this.opzione(sm, opzioneTecnica);
    const lMaxModuloOpzione = opz.L_max_cm;

    // -- scelta n_moduli e dimensioni effettive ------------------------------
    let nModuli = input.nModuli;
    let lModuloRichiesta: number;
    let pModuloRichiesta: number;

    if (orientamento === "L") {
      const tabellaMax = variante.L_max_per_n_moduli;
      if (!tabellaMax) {
        throw new ConfiguratoreError(
          `Variante '${variante.nome}' non definisce L_max_per_n_moduli per orientamento L.`,
        );
      }
      const moduliDisponibili = Object.keys(tabellaMax)
        .map(Number)
        .sort((a, b) => a - b);
      if (nModuli === undefined) {
        nModuli =
          moduliDisponibili.find((m) => input.lRichiestaCm <= tabellaMax[String(m)]!) ??
          moduliDisponibili[moduliDisponibili.length - 1]!;
      }
      if (!(String(nModuli) in tabellaMax)) {
        throw new ConfiguratoreError(
          `Numero moduli ${nModuli} non disponibile per ${variante.nome}. Disponibili: [${moduliDisponibili.join(", ")}]`,
        );
      }
      if (input.lRichiestaCm > tabellaMax[String(nModuli)]!) {
        throw new ConfiguratoreError(
          `L richiesta (${input.lRichiestaCm} cm) supera il massimo per ${nModuli} moduli (${tabellaMax[String(nModuli)]} cm).`,
        );
      }
      lModuloRichiesta = input.lRichiestaCm / nModuli;
      pModuloRichiesta = input.pRichiestaCm;
    } else if (orientamento === "P") {
      const tabellaMax = variante.P_max_per_n_moduli;
      if (!tabellaMax) {
        throw new ConfiguratoreError(
          `Variante '${variante.nome}' non definisce P_max_per_n_moduli per orientamento P.`,
        );
      }
      const moduliDisponibili = Object.keys(tabellaMax)
        .map(Number)
        .sort((a, b) => a - b);
      if (nModuli === undefined) {
        nModuli =
          moduliDisponibili.find((m) => input.pRichiestaCm <= tabellaMax[String(m)]!) ??
          moduliDisponibili[moduliDisponibili.length - 1]!;
      }
      if (!(String(nModuli) in tabellaMax)) {
        throw new ConfiguratoreError(
          `Numero moduli ${nModuli} non disponibile per ${variante.nome}. Disponibili: [${moduliDisponibili.join(", ")}]`,
        );
      }
      if (input.pRichiestaCm > tabellaMax[String(nModuli)]!) {
        throw new ConfiguratoreError(
          `P richiesta (${input.pRichiestaCm} cm) supera il massimo per ${nModuli} moduli (${tabellaMax[String(nModuli)]} cm).`,
        );
      }
      pModuloRichiesta = input.pRichiestaCm / nModuli;
      lModuloRichiesta = input.lRichiestaCm;
    } else {
      throw new ConfiguratoreError(`Orientamento di crescita '${orientamento}' non riconosciuto.`);
    }

    if (lModuloRichiesta > lMaxModuloOpzione) {
      throw new ConfiguratoreError(
        `Larghezza per modulo (${lModuloRichiesta.toFixed(1)} cm) supera il massimo consentito dall'opzione tecnica '${opzioneTecnica}' (${lMaxModuloOpzione} cm).`,
      );
    }

    // -- lookup matrice prezzi ------------------------------------------------
    const matriceRef = variante.matrice_prezzi_ref[opzioneTecnica];
    if (!matriceRef) {
      throw new ConfiguratoreError(
        `Nessuna matrice prezzi associata all'opzione tecnica '${opzioneTecnica}' per ${variante.nome}.`,
      );
    }
    const matrice = this.matrice(matriceRef);
    const riga = this.rigaPerProfondita(matrice, pModuloRichiesta);
    const colonnaL = this.colonnaPerLarghezza(riga, lModuloRichiesta);
    const prezzoUnitarioModulo = riga.prezzi_per_L[String(colonnaL)]!;

    const pEffettiva = riga.P_riferimento;
    const lEffettivaModulo = colonnaL;

    if (riga.montante_intermedio) {
      avvisi.push(
        `Configurazione con ${riga.n_lame} lame: richiede montante intermedio obbligatorio (già incluso nel prezzo di listino per questa riga).`,
      );
    }

    let lTotaleEffettiva: number;
    let pTotaleEffettiva: number;
    if (orientamento === "L") {
      lTotaleEffettiva = lEffettivaModulo * nModuli;
      pTotaleEffettiva = pEffettiva;
    } else {
      pTotaleEffettiva = pEffettiva * nModuli;
      lTotaleEffettiva = lEffettivaModulo;
    }

    // -- voci di costo ----------------------------------------------------------
    const voci: VoceCosto[] = [];
    voci.push({
      descrizione: `${nModuli} x modulo ${lEffettivaModulo}cm x ${pEffettiva}cm (${prezzoUnitarioModulo.toFixed(2)} EUR/modulo)`,
      importo_eur: prezzoUnitarioModulo * nModuli,
    });

    const detrazione = variante.detrazione_accoppiamento_eur[String(nModuli)] ?? 0;
    if (detrazione) {
      voci.push({
        descrizione: `Detrazione/adeguamento per accoppiamento (${nModuli} moduli)`,
        importo_eur: -detrazione,
      });
    }

    const supp = sm.supplementi;
    if (input.altezzaMontantiCm > supp.montante_h_soglia_cm) {
      const extraM = (input.altezzaMontantiCm - supp.montante_h_soglia_cm) / 100;
      const nMontantiStimati = nModuli + 1;
      const importo = round2(supp.montante_eur_per_m * extraM * nMontantiStimati);
      voci.push({
        descrizione: `Supplemento montante H=${input.altezzaMontantiCm}cm (>${supp.montante_h_soglia_cm}cm)`,
        importo_eur: importo,
      });
      avvisi.push(
        `Supplemento montante calcolato con ipotesi non esplicitata a listino (${supp.montante_eur_per_m} EUR/m per montante oltre la soglia, stimati ${nMontantiStimati} montanti) — verificare con l'azienda.`,
      );
    }

    if (sm.motore_incluso_nel_prezzo === false) {
      avvisi.push(
        "Prezzo motorizzazione non incluso: il listino esclude esplicitamente motore/centralina dal prezzo a matrice. Aggiungere il costo di Automatismi separatamente.",
      );
    }

    for (const key of input.opzioniPrezzoFisso ?? []) {
      const opzione = sm.opzioni_prezzo_fisso?.[key];
      if (!opzione) {
        throw new ConfiguratoreError(
          `Opzione a prezzo fisso '${key}' non trovata. Disponibili: ${pyListRepr(Object.keys(sm.opzioni_prezzo_fisso ?? {}))}`,
        );
      }
      voci.push({ descrizione: opzione.nome, importo_eur: opzione.prezzo_eur });
      if (opzione.vincolo) {
        avvisi.push(`'${opzione.nome}': ${opzione.vincolo} — verificare che la configurazione rispetti questo vincolo.`);
      }
    }

    // Priced against the SAME P_riferimento row / L column already matched
    // for the base structure price — never re-resolved independently, so an
    // accessory can never end up priced for a different bucket than the
    // structure itself.
    for (const key of input.accessoriSelezionati ?? []) {
      const accessorio = sm.accessori?.[key];
      if (!accessorio) {
        throw new ConfiguratoreError(
          `Accessorio '${key}' non trovato. Disponibili: ${pyListRepr(Object.keys(sm.accessori ?? {}))}`,
        );
      }
      const lookupKey =
        accessorio.indicizzato_per === "sporgenza" ? String(pEffettiva) : String(lEffettivaModulo);
      const prezzo = accessorio.prezzi[lookupKey];
      if (prezzo === undefined) {
        throw new ConfiguratoreError(
          `Prezzo per l'accessorio '${accessorio.nome}' non disponibile per questa configurazione (${accessorio.indicizzato_per} ${lookupKey}cm).`,
        );
      }
      voci.push({ descrizione: accessorio.nome, importo_eur: prezzo });
    }

    const prezzoTotaleEur = round2(voci.reduce((sum, v) => sum + v.importo_eur, 0));

    return {
      prodotto: this.prodottoNome,
      sotto_modello: sm.nome,
      variante_montaggio: variante.nome,
      opzione_tecnica: opzioneTecnica,
      P_richiesta_cm: input.pRichiestaCm,
      L_richiesta_cm: input.lRichiestaCm,
      orientamento_crescita: orientamento,
      n_moduli: nModuli,
      L_modulo_cm: lEffettivaModulo,
      P_modulo_cm: pEffettiva,
      L_totale_effettiva_cm: lTotaleEffettiva,
      P_totale_effettiva_cm: pTotaleEffettiva,
      n_lame: riga.n_lame,
      colore_struttura: input.coloreStruttura,
      colore_plastica: input.colorePlastica,
      altezza_montanti_cm: input.altezzaMontantiCm,
      voci_costo: voci,
      avvisi,
      prezzo_totale_eur: prezzoTotaleEur,
    };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

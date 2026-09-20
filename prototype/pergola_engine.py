"""
Motore generico di composizione/pricing per pergole a catalogo Pratic
(schema generalizzato prodotto -> sotto_modello -> variante_montaggio ->
opzione_tecnica -> matrice_prezzi).

Nato per risolvere Brera (il caso complesso: 2 sotto-modelli x 6 varianti
di montaggio x 2 opzioni lama x crescita modulare su L o su P), risolve
anche Vision come caso degenere a un solo sotto-modello / una sola
variante / una sola opzione tecnica: vedi vision_adapter.py per il
wrapper che espone lo schema di Vision in questo stesso formato.

Concetti chiave dello schema generalizzato:
- un "sotto_modello" (es. Brera P, Brera S; per Vision: "standard") ha
  propri vincoli dimensionali, supplementi e opzioni tecniche
- una "variante_montaggio" (es. 01L autoportante, 02L a muro...) indica
  la direzione di crescita modulare ("L" o "P"), il tipo di fissaggio,
  la tabella dimensionale massima per numero di moduli e la detrazione
  per accoppiamento; punta a UNA matrice prezzi per ciascuna opzione
  tecnica disponibile
- una "opzione_tecnica" (es. lama H20/H30; per Vision: unica opzione
  "standard") può limitare la L massima per modulo e seleziona quale
  matrice prezzi usare
- una "matrice_prezzi" resta concettualmente identica a quella di
  Vision: righe indicizzate per profondità (per modulo), colonne per
  larghezza (per modulo), più numero di lame calcolato per riga
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


class ConfiguratoreError(Exception):
    """Errore di validazione che impedisce di generare una configurazione."""


@dataclass
class VoceCosto:
    descrizione: str
    importo_eur: float


@dataclass
class ConfigurazionePergola:
    prodotto: str
    sotto_modello: str
    variante_montaggio: str
    opzione_tecnica: str

    P_richiesta_cm: float
    L_richiesta_cm: float

    orientamento_crescita: str  # "L" o "P": asse lungo cui crescono i moduli
    n_moduli: int
    L_modulo_cm: int
    P_modulo_cm: int
    L_totale_effettiva_cm: int
    P_totale_effettiva_cm: int
    n_lame: int

    colore_struttura: str
    colore_plastica: str
    altezza_montanti_cm: float

    voci_costo: list[VoceCosto] = field(default_factory=list)
    avvisi: list[str] = field(default_factory=list)

    @property
    def prezzo_totale_eur(self) -> float:
        return round(sum(v.importo_eur for v in self.voci_costo), 2)

    def riassunto(self) -> str:
        righe = [
            f"{self.prodotto} {self.sotto_modello} — {self.variante_montaggio} "
            f"({self.opzione_tecnica})",
            f"  Crescita modulare su: {self.orientamento_crescita}  ·  Moduli: {self.n_moduli}",
            f"  Dimensioni effettive: L {self.L_totale_effettiva_cm} cm x "
            f"P {self.P_totale_effettiva_cm} cm"
            + (
                f"  [richiesto: L {self.L_richiesta_cm} x P {self.P_richiesta_cm}]"
                if (self.L_totale_effettiva_cm != self.L_richiesta_cm
                    or self.P_totale_effettiva_cm != self.P_richiesta_cm)
                else ""
            ),
            f"  Modulo singolo: L {self.L_modulo_cm} cm x P {self.P_modulo_cm} cm",
            f"  Lame: {self.n_lame}",
            f"  Colore struttura/lame: {self.colore_struttura}",
            f"  Colore parti plastiche: {self.colore_plastica}",
            f"  Altezza montanti: {self.altezza_montanti_cm} cm",
            "  Preventivo:",
        ]
        for v in self.voci_costo:
            righe.append(f"    {v.descrizione:<58} {v.importo_eur:>10.2f} EUR")
        righe.append(f"  {'TOTALE':<58} {self.prezzo_totale_eur:>10.2f} EUR")
        if self.avvisi:
            righe.append("  Avvisi:")
            for a in self.avvisi:
                righe.append(f"    - {a}")
        return "\n".join(righe)


class PergolaEngine:
    def __init__(self, db: dict, price_matrices: dict, prodotto_nome: str):
        self.db = db
        self.price_matrices = price_matrices
        self.prodotto_nome = prodotto_nome

    @classmethod
    def from_files(cls, db_path: str | Path, price_matrices_path: str | Path,
                    prodotto_nome: Optional[str] = None) -> "PergolaEngine":
        db = json.loads(Path(db_path).read_text(encoding="utf-8"))
        price_matrices = json.loads(Path(price_matrices_path).read_text(encoding="utf-8"))
        nome = prodotto_nome or db.get("prodotto", {}).get("nome", "Prodotto")
        return cls(db, price_matrices, nome)

    # -- helper interni -------------------------------------------------

    def _sotto_modello(self, nome: str) -> dict:
        try:
            return self.db["sotto_modelli"][nome]
        except KeyError:
            raise ConfiguratoreError(
                f"Sotto-modello '{nome}' non trovato. Disponibili: "
                f"{list(self.db['sotto_modelli'].keys())}"
            )

    def _variante(self, sm: dict, nome: str) -> dict:
        try:
            return sm["varianti_montaggio"][nome]
        except KeyError:
            raise ConfiguratoreError(
                f"Variante di montaggio '{nome}' non trovata. Disponibili: "
                f"{list(sm['varianti_montaggio'].keys())}"
            )

    def _opzione(self, sm: dict, nome: str) -> dict:
        opzioni = sm.get("opzioni_tecniche_lama") or sm.get("opzioni_tecniche")
        try:
            return opzioni[nome]
        except KeyError:
            raise ConfiguratoreError(
                f"Opzione tecnica '{nome}' non trovata. Disponibili: {list(opzioni.keys())}"
            )

    def _valida_colori(self, colore_struttura: str, colore_plastica: str, avvisi: list[str]):
        colori = self.db["prodotto"]["colori"]

        def nome_completo(c):
            return f"{c['ral']} {c['nome_it']}" if c.get("ral") else c["nome_it"]

        validi_struttura = {nome_completo(c) for c in colori["struttura_e_lame"]["standard"]}
        supplemento_struttura = {nome_completo(c) for c in colori["struttura_e_lame"]["con_supplemento"]}
        validi_plastica = {c["nome_it"] for c in colori["parti_plastiche"]["opzioni"]}

        if colore_struttura not in validi_struttura | supplemento_struttura:
            raise ConfiguratoreError(
                f"Colore struttura '{colore_struttura}' non valido. "
                f"Disponibili: {sorted(validi_struttura | supplemento_struttura)}"
            )
        if colore_plastica not in validi_plastica:
            raise ConfiguratoreError(
                f"Colore parti plastiche '{colore_plastica}' non valido. "
                f"Disponibili: {sorted(validi_plastica)}"
            )
        if colore_struttura in supplemento_struttura:
            avvisi.append(
                f"Il colore struttura '{colore_struttura}' richiede supplemento "
                f"(non incluso nel calcolo automatico)."
            )

    def _matrice(self, ref: str) -> list[dict]:
        try:
            return self.price_matrices[ref]
        except KeyError:
            raise ConfiguratoreError(f"Matrice prezzi '{ref}' non trovata.")

    def _riga_per_profondita(self, matrice: list[dict], P_richiesta: float) -> dict:
        matrice = sorted(matrice, key=lambda r: r["P_riferimento"])
        for riga in matrice:
            if riga["P_riferimento"] >= P_richiesta:
                return riga
        raise ConfiguratoreError(
            f"Profondità richiesta ({P_richiesta} cm) supera il massimo di matrice "
            f"({matrice[-1]['P_riferimento']} cm)."
        )

    def _colonna_per_larghezza(self, riga: dict, L_richiesta: float) -> int:
        colonne = sorted(int(c) for c in riga["prezzi_per_L"].keys())
        for c in colonne:
            if c >= L_richiesta:
                return c
        raise ConfiguratoreError(
            f"Larghezza richiesta ({L_richiesta:.1f} cm) supera il massimo di matrice "
            f"({colonne[-1]} cm) per questa opzione tecnica."
        )

    # -- entry point pubblico --------------------------------------------

    def configura(
        self,
        sotto_modello: str,
        variante_montaggio: str,
        P_richiesta_cm: float,
        L_richiesta_cm: float,
        colore_struttura: str,
        colore_plastica: str,
        altezza_montanti_cm: float,
        opzione_tecnica: Optional[str] = None,
        n_moduli: Optional[int] = None,
    ) -> ConfigurazionePergola:
        avvisi: list[str] = []

        sm = self._sotto_modello(sotto_modello)
        variante = self._variante(sm, variante_montaggio)
        vincoli = sm["vincoli_dimensionali"]

        self._valida_colori(colore_struttura, colore_plastica, avvisi)

        if altezza_montanti_cm > vincoli["H_max_cm"]:
            raise ConfiguratoreError(
                f"Altezza richiesta ({altezza_montanti_cm} cm) supera il massimo "
                f"per {sm['nome']} ({vincoli['H_max_cm']} cm)."
            )

        orientamento = variante["orientamento_crescita"]

        # -- scelta opzione tecnica (es. altezza lama) ------------------
        opzioni_disp = sm.get("opzioni_tecniche_lama") or sm.get("opzioni_tecniche")
        if opzione_tecnica is None:
            # L per modulo dipende dall'orientamento: se la crescita è su P,
            # la L richiesta è già quella del singolo modulo (non si somma).
            L_modulo_richiesta = L_richiesta_cm if orientamento == "P" else None
            candidate = sorted(opzioni_disp.items(), key=lambda kv: kv[1].get("L_max_cm", 10**9))
            opzione_tecnica = candidate[0][0]
            for nome_opz, dati_opz in candidate:
                l_max_opz = dati_opz.get("L_max_cm", 10**9)
                riferimento_L = L_modulo_richiesta if L_modulo_richiesta is not None else L_richiesta_cm
                # per orientamento L, la L per modulo è minore o uguale alla L totale;
                # una stima prudente usa comunque la L totale come limite superiore
                # quando n_moduli non è ancora noto.
                if riferimento_L <= l_max_opz:
                    opzione_tecnica = nome_opz
                    break
            else:
                opzione_tecnica = candidate[-1][0]

        opz = self._opzione(sm, opzione_tecnica)
        L_max_modulo_opzione = opz.get("L_max_cm", vincoli["L_max_modulo_cm"])

        # -- scelta n_moduli e dimensioni effettive ---------------------
        if orientamento == "L":
            tabella_max = variante["L_max_per_n_moduli"]
            moduli_disponibili = sorted(int(k) for k in tabella_max.keys())
            if n_moduli is None:
                n_moduli = next(
                    (m for m in moduli_disponibili if L_richiesta_cm <= tabella_max[str(m)]),
                    moduli_disponibili[-1],
                )
            if str(n_moduli) not in tabella_max:
                raise ConfiguratoreError(
                    f"Numero moduli {n_moduli} non disponibile per {variante['nome']}. "
                    f"Disponibili: {moduli_disponibili}"
                )
            if L_richiesta_cm > tabella_max[str(n_moduli)]:
                raise ConfiguratoreError(
                    f"L richiesta ({L_richiesta_cm} cm) supera il massimo per "
                    f"{n_moduli} moduli ({tabella_max[str(n_moduli)]} cm)."
                )
            L_modulo_richiesta = L_richiesta_cm / n_moduli
            P_modulo_richiesta = P_richiesta_cm
        elif orientamento == "P":
            tabella_max = variante["P_max_per_n_moduli"]
            moduli_disponibili = sorted(int(k) for k in tabella_max.keys())
            if n_moduli is None:
                n_moduli = next(
                    (m for m in moduli_disponibili if P_richiesta_cm <= tabella_max[str(m)]),
                    moduli_disponibili[-1],
                )
            if str(n_moduli) not in tabella_max:
                raise ConfiguratoreError(
                    f"Numero moduli {n_moduli} non disponibile per {variante['nome']}. "
                    f"Disponibili: {moduli_disponibili}"
                )
            if P_richiesta_cm > tabella_max[str(n_moduli)]:
                raise ConfiguratoreError(
                    f"P richiesta ({P_richiesta_cm} cm) supera il massimo per "
                    f"{n_moduli} moduli ({tabella_max[str(n_moduli)]} cm)."
                )
            P_modulo_richiesta = P_richiesta_cm / n_moduli
            L_modulo_richiesta = L_richiesta_cm
        else:
            raise ConfiguratoreError(f"Orientamento di crescita '{orientamento}' non riconosciuto.")

        if L_modulo_richiesta > L_max_modulo_opzione:
            raise ConfiguratoreError(
                f"Larghezza per modulo ({L_modulo_richiesta:.1f} cm) supera il massimo "
                f"consentito dall'opzione tecnica '{opzione_tecnica}' "
                f"({L_max_modulo_opzione} cm)."
            )

        # -- lookup matrice prezzi ---------------------------------------
        matrice_ref = variante["matrice_prezzi_ref"][opzione_tecnica]
        matrice = self._matrice(matrice_ref)
        riga = self._riga_per_profondita(matrice, P_modulo_richiesta)
        colonna_L = self._colonna_per_larghezza(riga, L_modulo_richiesta)
        prezzo_unitario_modulo = riga["prezzi_per_L"][str(colonna_L)] \
            if str(colonna_L) in riga["prezzi_per_L"] else riga["prezzi_per_L"][colonna_L]

        P_effettiva = riga["P_riferimento"]
        L_effettiva_modulo = colonna_L

        if riga.get("montante_intermedio"):
            avvisi.append(
                f"Configurazione con {riga['n_lame']} lame: richiede montante "
                f"intermedio obbligatorio (già incluso nel prezzo di listino per "
                f"questa riga)."
            )

        if orientamento == "L":
            L_totale_effettiva = L_effettiva_modulo * n_moduli
            P_totale_effettiva = P_effettiva
        else:
            P_totale_effettiva = P_effettiva * n_moduli
            L_totale_effettiva = L_effettiva_modulo

        # -- voci di costo -------------------------------------------------
        voci: list[VoceCosto] = []
        voci.append(VoceCosto(
            f"{n_moduli} x modulo {L_effettiva_modulo}cm x {P_effettiva}cm "
            f"({prezzo_unitario_modulo:.2f} EUR/modulo)",
            prezzo_unitario_modulo * n_moduli,
        ))

        detrazione = variante["detrazione_accoppiamento_eur"].get(str(n_moduli), 0)
        if detrazione:
            voci.append(VoceCosto(
                f"Detrazione/adeguamento per accoppiamento ({n_moduli} moduli)", -detrazione
            ))

        supp = sm["supplementi"]
        if altezza_montanti_cm > supp["montante_h_soglia_cm"]:
            extra_m = (altezza_montanti_cm - supp["montante_h_soglia_cm"]) / 100
            n_montanti_stimati = n_moduli + 1
            importo = round(supp["montante_eur_per_m"] * extra_m * n_montanti_stimati, 2)
            voci.append(VoceCosto(
                f"Supplemento montante H={altezza_montanti_cm}cm "
                f"(>{supp['montante_h_soglia_cm']}cm)", importo
            ))
            avvisi.append(
                f"Supplemento montante calcolato con ipotesi non esplicitata a listino "
                f"({supp['montante_eur_per_m']} EUR/m per montante oltre la soglia, "
                f"stimati {n_montanti_stimati} montanti) — verificare con l'azienda."
            )

        if not sm.get("motore_incluso_nel_prezzo", True):
            avvisi.append(
                "Prezzo motorizzazione non incluso: il listino esclude esplicitamente "
                "motore/centralina dal prezzo a matrice. Aggiungere il costo di "
                "Automatismi separatamente."
            )

        return ConfigurazionePergola(
            prodotto=self.prodotto_nome,
            sotto_modello=sm["nome"],
            variante_montaggio=variante["nome"],
            opzione_tecnica=opzione_tecnica,
            P_richiesta_cm=P_richiesta_cm,
            L_richiesta_cm=L_richiesta_cm,
            orientamento_crescita=orientamento,
            n_moduli=n_moduli,
            L_modulo_cm=L_effettiva_modulo,
            P_modulo_cm=P_effettiva,
            L_totale_effettiva_cm=L_totale_effettiva,
            P_totale_effettiva_cm=P_totale_effettiva,
            n_lame=riga["n_lame"],
            colore_struttura=colore_struttura,
            colore_plastica=colore_plastica,
            altezza_montanti_cm=altezza_montanti_cm,
            voci_costo=voci,
            avvisi=avvisi,
        )

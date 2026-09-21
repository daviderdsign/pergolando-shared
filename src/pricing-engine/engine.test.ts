import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { catalogDatabaseSchema, priceMatricesSchema } from "../schema/catalog.js";
import { PergolaEngine } from "./engine.js";
import { ConfiguratoreError } from "./errors.js";
import type { ConfiguraInput } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../../fixtures");

function loadJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, relativePath), "utf-8"));
}

interface GoldenCase {
  name: string;
  input: {
    sotto_modello: string;
    variante_montaggio: string;
    P_richiesta_cm: number;
    L_richiesta_cm: number;
    colore_struttura: string;
    colore_plastica: string;
    altezza_montanti_cm: number;
    opzione_tecnica?: string;
    n_moduli?: number;
  };
  expected:
    | {
        success: true;
        output: {
          sotto_modello: string;
          variante_montaggio: string;
          opzione_tecnica: string;
          orientamento_crescita: "L" | "P";
          n_moduli: number;
          L_modulo_cm: number;
          P_modulo_cm: number;
          L_totale_effettiva_cm: number;
          P_totale_effettiva_cm: number;
          n_lame: number;
          voci_costo: { descrizione: string; importo_eur: number }[];
          avvisi_count: number;
          prezzo_totale_eur: number;
        };
      }
    | { success: false; error_message: string };
}

function toEngineInput(gc: GoldenCase["input"]): ConfiguraInput {
  return {
    sottoModello: gc.sotto_modello,
    varianteMontaggio: gc.variante_montaggio,
    pRichiestaCm: gc.P_richiesta_cm,
    lRichiestaCm: gc.L_richiesta_cm,
    coloreStruttura: gc.colore_struttura,
    colorePlastica: gc.colore_plastica,
    altezzaMontantiCm: gc.altezza_montanti_cm,
    opzioneTecnica: gc.opzione_tecnica,
    nModuli: gc.n_moduli,
  };
}

/**
 * Golden output source: packages/pricing-engine/scripts/generate_golden_fixtures.py,
 * which runs the ALREADY-VALIDATED prototype/pergola_engine.py. Numeric outputs
 * (prices, dimensions, counts) are compared exactly. Cost-line descriptions are
 * checked by count only, not by exact string, since formatted-text equality
 * across Python/TS isn't load-bearing for pricing correctness.
 */
function runSuite(productLabel: string, catalogDir: string) {
  describe(`PergolaEngine — ${productLabel}`, () => {
    const db = catalogDatabaseSchema.parse(loadJson(`${catalogDir}/database.json`));
    const priceMatrices = priceMatricesSchema.parse(loadJson(`${catalogDir}/price_matrices.json`));
    const engine = PergolaEngine.fromDatabase(db, priceMatrices);
    const goldenCases = loadJson(`${catalogDir}/golden_cases.json`) as GoldenCase[];

    for (const gc of goldenCases) {
      it(gc.name, () => {
        if (gc.expected.success) {
          const expected = gc.expected.output;
          const result = engine.configura(toEngineInput(gc.input));

          expect(result.sotto_modello).toBe(expected.sotto_modello);
          expect(result.variante_montaggio).toBe(expected.variante_montaggio);
          expect(result.opzione_tecnica).toBe(expected.opzione_tecnica);
          expect(result.orientamento_crescita).toBe(expected.orientamento_crescita);
          expect(result.n_moduli).toBe(expected.n_moduli);
          expect(result.L_modulo_cm).toBe(expected.L_modulo_cm);
          expect(result.P_modulo_cm).toBe(expected.P_modulo_cm);
          expect(result.L_totale_effettiva_cm).toBe(expected.L_totale_effettiva_cm);
          expect(result.P_totale_effettiva_cm).toBe(expected.P_totale_effettiva_cm);
          expect(result.n_lame).toBe(expected.n_lame);
          expect(result.voci_costo).toHaveLength(expected.voci_costo.length);
          expect(result.voci_costo.map((v) => v.importo_eur)).toEqual(
            expected.voci_costo.map((v) => v.importo_eur),
          );
          expect(result.avvisi).toHaveLength(expected.avvisi_count);
          expect(result.prezzo_totale_eur).toBe(expected.prezzo_totale_eur);
        } else {
          expect(() => engine.configura(toEngineInput(gc.input))).toThrow(ConfiguratoreError);
          try {
            engine.configura(toEngineInput(gc.input));
            expect.unreachable();
          } catch (err) {
            expect(err).toBeInstanceOf(ConfiguratoreError);
            expect((err as ConfiguratoreError).message).toBe(gc.expected.error_message);
          }
        }
      });
    }
  });
}

runSuite("Vision (single sotto-modello, single variante)", "vision");
runSuite("Brera (2 sotto-modelli x 6 varianti x 2 opzioni)", "brera");

/**
 * opzioni_prezzo_fisso has no Python-prototype golden fixture (it's a new
 * field, not in prototype/pergola_engine.py) — hand-written instead, layered
 * on top of a known-good Brera baseline case so the base price is trusted.
 */
describe("PergolaEngine — opzioni_prezzo_fisso (flat-priced add-ons)", () => {
  const db = catalogDatabaseSchema.parse(loadJson("brera/database.json"));
  const priceMatrices = priceMatricesSchema.parse(loadJson("brera/price_matrices.json"));
  db.sotto_modelli.P!.opzioni_prezzo_fisso = {
    telis1io: { nome: "Telis 1 io", prezzo_eur: 180 },
    comandoManuale: {
      nome: "Detrazione comando manuale",
      prezzo_eur: -555,
      vincolo: "sporgenza massima 350cm",
    },
  };
  const engine = PergolaEngine.fromDatabase(db, priceMatrices);

  const baseInput: ConfiguraInput = {
    sottoModello: "P",
    varianteMontaggio: "01L",
    pRichiestaCm: 300,
    lRichiestaCm: 200,
    coloreStruttura: "RAL 9016 Bianco sablé",
    colorePlastica: "Bianco",
    altezzaMontantiCm: 200,
    opzioneTecnica: "H20",
  };

  it("adds a voce_costo and the price for a selected option", () => {
    const result = engine.configura({ ...baseInput, opzioniPrezzoFisso: ["telis1io"] });
    expect(result.voci_costo).toHaveLength(2);
    expect(result.voci_costo[1]).toEqual({ descrizione: "Telis 1 io", importo_eur: 180 });
    expect(result.prezzo_totale_eur).toBe(9290 + 180);
  });

  it("supports a negative price (detrazione) and surfaces its vincolo as an avviso", () => {
    const result = engine.configura({ ...baseInput, opzioniPrezzoFisso: ["comandoManuale"] });
    expect(result.prezzo_totale_eur).toBe(9290 - 555);
    expect(result.avvisi.some((a) => a.includes("sporgenza massima 350cm"))).toBe(true);
  });

  it("stacks multiple selected options", () => {
    const result = engine.configura({
      ...baseInput,
      opzioniPrezzoFisso: ["telis1io", "comandoManuale"],
    });
    expect(result.prezzo_totale_eur).toBe(9290 + 180 - 555);
  });

  it("throws for an unknown option key", () => {
    expect(() =>
      engine.configura({ ...baseInput, opzioniPrezzoFisso: ["nonEsiste"] }),
    ).toThrow(ConfiguratoreError);
  });

  it("leaves existing behavior untouched when omitted", () => {
    const result = engine.configura(baseInput);
    expect(result.voci_costo).toHaveLength(1);
    expect(result.prezzo_totale_eur).toBe(9290);
  });
});

/**
 * Same treatment as opzioni_prezzo_fisso above — no Python-prototype golden
 * fixture, hand-written on top of the same trusted Brera baseline (P=300 ->
 * resolves to P_riferimento 310, L=200 -> resolves to column 200).
 */
describe("PergolaEngine — accessori (P/L-indexed add-ons)", () => {
  const db = catalogDatabaseSchema.parse(loadJson("brera/database.json"));
  const priceMatrices = priceMatricesSchema.parse(loadJson("brera/price_matrices.json"));
  db.sotto_modelli.P!.accessori = {
    traveLaterale: {
      nome: "Trave Laterale",
      indicizzato_per: "sporgenza",
      prezzi: { "310": 168 },
    },
    frangiventoIntermedio: {
      nome: "Frangivento intermedio aggiuntivo",
      indicizzato_per: "larghezza",
      prezzi: { "200": 48 },
    },
  };
  const engine = PergolaEngine.fromDatabase(db, priceMatrices);

  const baseInput: ConfiguraInput = {
    sottoModello: "P",
    varianteMontaggio: "01L",
    pRichiestaCm: 300,
    lRichiestaCm: 200,
    coloreStruttura: "RAL 9016 Bianco sablé",
    colorePlastica: "Bianco",
    altezzaMontantiCm: 200,
    opzioneTecnica: "H20",
  };

  it("prices a sporgenza-indexed accessory against the already-matched P_riferimento row", () => {
    const result = engine.configura({ ...baseInput, accessoriSelezionati: ["traveLaterale"] });
    expect(result.voci_costo[1]).toEqual({ descrizione: "Trave Laterale", importo_eur: 168 });
    expect(result.prezzo_totale_eur).toBe(9290 + 168);
  });

  it("prices a larghezza-indexed accessory against the already-matched L column", () => {
    const result = engine.configura({ ...baseInput, accessoriSelezionati: ["frangiventoIntermedio"] });
    expect(result.voci_costo[1]).toEqual({
      descrizione: "Frangivento intermedio aggiuntivo",
      importo_eur: 48,
    });
    expect(result.prezzo_totale_eur).toBe(9290 + 48);
  });

  it("stacks multiple accessories", () => {
    const result = engine.configura({
      ...baseInput,
      accessoriSelezionati: ["traveLaterale", "frangiventoIntermedio"],
    });
    expect(result.prezzo_totale_eur).toBe(9290 + 168 + 48);
  });

  it("throws for an unknown accessory key", () => {
    expect(() => engine.configura({ ...baseInput, accessoriSelezionati: ["nonEsiste"] })).toThrow(
      ConfiguratoreError,
    );
  });

  it("throws when the accessory has no price for the matched bucket", () => {
    const dbNoPrice = catalogDatabaseSchema.parse(loadJson("brera/database.json"));
    dbNoPrice.sotto_modelli.P!.accessori = {
      traveLaterale: { nome: "Trave Laterale", indicizzato_per: "sporgenza", prezzi: { "999": 1 } },
    };
    const engineNoPrice = PergolaEngine.fromDatabase(dbNoPrice, priceMatrices);
    expect(() =>
      engineNoPrice.configura({ ...baseInput, accessoriSelezionati: ["traveLaterale"] }),
    ).toThrow(ConfiguratoreError);
  });
});

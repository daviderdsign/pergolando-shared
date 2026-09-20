import { z } from "zod";

/**
 * Schema generalizzato: prodotto -> sotto_modello -> variante_montaggio ->
 * opzione_tecnica -> matrice_prezzi.
 *
 * Modeled directly on the already-validated Vision and Brera catalogs
 * (see fixtures/), not redesigned from scratch. Keys that only appear on
 * one of the two products (e.g. Brera's `motorizzazione`) are optional
 * rather than assumed universal.
 */

const coloreStrutturaStandardSchema = z.object({
  ral: z.string().nullable(),
  nome_it: z.string(),
  nome_en: z.string(),
  finitura: z.string().nullable().optional(),
  supplemento: z.boolean().optional(),
  disponibile_a_magazzino: z.boolean().optional(),
});

const coloreStrutturaSupplementoSchema = z.object({
  nome_it: z.string(),
  nome_en: z.string(),
  // present on Vision's con_supplemento entries, absent on Brera's — both are
  // already-implied by being in this array, so it's informational only.
  supplemento: z.boolean().optional(),
});

const colorePlasticaSchema = z.object({
  nome_it: z.string(),
  nome_en: z.string(),
});

const coloriSchema = z.object({
  struttura_e_lame: z.object({
    standard: z.array(coloreStrutturaStandardSchema),
    con_supplemento: z.array(coloreStrutturaSupplementoSchema),
    nota: z.string().optional(),
  }),
  parti_plastiche: z.object({
    tag: z.string().optional(),
    opzioni: z.array(colorePlasticaSchema),
    vincolo: z.string().optional(),
  }),
});

const prodottoComplementareSchema = z.object({
  nome: z.string(),
  descrizione: z.string(),
  pagina_riferimento_catalogo_originale: z.number().optional(),
});

export const prodottoSchema = z.object({
  nome: z.string(),
  categoria: z.string(),
  categoria_en: z.string(),
  descrizione_it: z.string().optional(),
  descrizione_en: z.string().optional(),
  nota_tipologia: z.string().optional(),
  brevetti: z.array(z.string()),
  made_in: z.string(),
  colori: coloriSchema,
  motorizzazione: z
    .object({
      modelli: z.array(z.string()),
      centralina: z.object({
        modello: z.string(),
        obbligatoria_per: z.string(),
        moduli_max_per_centralina: z.number(),
        nota: z.string().optional(),
      }),
      nota_prezzi: z.string().optional(),
    })
    .optional(),
  prodotti_complementari_non_modellati: z.array(prodottoComplementareSchema).optional(),
  nota_scope: z.string().optional(),
});

const vincoliDimensionaliSchema = z.object({
  L_max_modulo_cm: z.number(),
  P_min_cm: z.number(),
  P_max_cm: z.number(),
  H_max_cm: z.number(),
  passo_lama_cm: z.number(),
  moduli_max: z.number(),
});

const opzioneTecnicaSchema = z.object({
  nome: z.string(),
  L_max_cm: z.number(),
});

const supplementiSchema = z.object({
  montante_h_soglia_cm: z.number(),
  montante_eur_per_m: z.number(),
  staffe_slide_glass_eur: z.number().optional(),
});

/** Keys are numeric strings ("1", "2", ...) — the number of moduli. */
const perModuliMapSchema = z.record(z.string(), z.number());

const varianteMontaggioSchema = z
  .object({
    nome: z.string(),
    orientamento_crescita: z.enum(["L", "P"]),
    fissaggio: z.string(),
    moduli_min: z.number().optional(),
    L_max_per_n_moduli: perModuliMapSchema.optional(),
    P_max_per_n_moduli: perModuliMapSchema.optional(),
    detrazione_accoppiamento_eur: perModuliMapSchema,
    /** opzione_tecnica key -> price matrix key */
    matrice_prezzi_ref: z.record(z.string(), z.string()),
    nota: z.string().optional(),
  })
  .refine((v) => Boolean(v.L_max_per_n_moduli) || Boolean(v.P_max_per_n_moduli), {
    message:
      "varianteMontaggio must define L_max_per_n_moduli (orientamento L) or P_max_per_n_moduli (orientamento P)",
  });

const sottoModelloSchema = z
  .object({
    nome: z.string(),
    descrizione_it: z.string().optional(),
    vincoli_dimensionali: vincoliDimensionaliSchema,
    opzioni_tecniche_lama: z.record(z.string(), opzioneTecnicaSchema).optional(),
    opzioni_tecniche: z.record(z.string(), opzioneTecnicaSchema).optional(),
    supplementi: supplementiSchema,
    varianti_montaggio: z.record(z.string(), varianteMontaggioSchema),
    motore_incluso_nel_prezzo: z.boolean(),
  })
  .refine((v) => Boolean(v.opzioni_tecniche_lama) || Boolean(v.opzioni_tecniche), {
    message: "sottoModello must define opzioni_tecniche_lama or opzioni_tecniche",
  });

const matriceRigaSchema = z.object({
  P_riferimento: z.number(),
  lead_completo: z.array(z.number()).optional(),
  n_lame: z.number(),
  /** keys are numeric strings (L cm) */
  prezzi_per_L: z.record(z.string(), z.number()),
  montante_intermedio: z.boolean().optional(),
});

export const priceMatricesSchema = z.record(z.string(), z.array(matriceRigaSchema));

export const catalogDatabaseSchema = z.object({
  prodotto: prodottoSchema,
  sotto_modelli: z.record(z.string(), sottoModelloSchema),
  note_estrazione: z.array(z.string()).optional(),
});

export type CatalogDatabase = z.infer<typeof catalogDatabaseSchema>;
export type PriceMatrices = z.infer<typeof priceMatricesSchema>;
export type SottoModello = z.infer<typeof sottoModelloSchema>;
export type VarianteMontaggio = z.infer<typeof varianteMontaggioSchema>;
export type MatriceRiga = z.infer<typeof matriceRigaSchema>;

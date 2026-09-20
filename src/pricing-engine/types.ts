export interface VoceCosto {
  descrizione: string;
  importo_eur: number;
}

export interface ConfigurazionePergola {
  prodotto: string;
  sotto_modello: string;
  variante_montaggio: string;
  opzione_tecnica: string;

  P_richiesta_cm: number;
  L_richiesta_cm: number;

  orientamento_crescita: "L" | "P";
  n_moduli: number;
  L_modulo_cm: number;
  P_modulo_cm: number;
  L_totale_effettiva_cm: number;
  P_totale_effettiva_cm: number;
  n_lame: number;

  colore_struttura: string;
  colore_plastica: string;
  altezza_montanti_cm: number;

  voci_costo: VoceCosto[];
  avvisi: string[];

  /** Rounded to 2 decimals, mirroring Python's round(sum(...), 2). */
  prezzo_totale_eur: number;
}

export interface ConfiguraInput {
  sottoModello: string;
  varianteMontaggio: string;
  pRichiestaCm: number;
  lRichiestaCm: number;
  coloreStruttura: string;
  colorePlastica: string;
  altezzaMontantiCm: number;
  opzioneTecnica?: string;
  nModuli?: number;
}

import { z } from "zod";

/**
 * Placeholder for Fase 5 (visual assets + Gemini rendering reference material).
 * Not populated by the Fase 1 Studio MVP, but reserved in the bundle shape now
 * so the folder layout doesn't need to change later (per PRD note at the end
 * of the "Prompt pronto per Claude Code" section).
 */
export const assetManifestEntrySchema = z.object({
  path: z.string(),
  tipo: z.enum(["foto", "rendering", "altro"]),
  prodotto: z.string().optional(),
  sotto_modello: z.string().optional(),
  variante_montaggio: z.string().optional(),
  colore: z.string().optional(),
});

export const assetManifestSchema = z.array(assetManifestEntrySchema);

export type AssetManifestEntry = z.infer<typeof assetManifestEntrySchema>;

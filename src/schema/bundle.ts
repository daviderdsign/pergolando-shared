import { z } from "zod";
import { manifestSchema } from "./manifest.js";
import { catalogDatabaseSchema, priceMatricesSchema } from "./catalog.js";
import { themeSchema } from "./theme.js";
import { assetManifestSchema } from "./assets.js";

/**
 * Full in-memory representation of a bundle (manifest + catalog + branding +
 * assets), as opposed to the on-disk folder layout described in the PRD
 * (manifest.json, catalog/database.json, catalog/price_matrices.json,
 * branding/letterhead.pdf, branding/theme.json, assets/). The on-disk layout
 * is produced/consumed by the bundle reader/writer in apps/studio; this
 * schema is what gets validated.
 */
export const bundleSchema = z.object({
  manifest: manifestSchema,
  catalog: z.object({
    database: catalogDatabaseSchema,
    price_matrices: priceMatricesSchema,
  }),
  branding: z.object({
    theme: themeSchema,
    letterhead_path: z.string().optional(),
  }),
  assets: assetManifestSchema.optional(),
});

export type Bundle = z.infer<typeof bundleSchema>;

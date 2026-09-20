import { z } from "zod";

/**
 * schema_version lets the App Venditore know which bundle shape to expect
 * as the catalog schema evolves (e.g. to support tende) without invalidating
 * bundles already in production.
 */
export const CURRENT_SCHEMA_VERSION = "1.0.0";

export const manifestSchema = z.object({
  tenant_id: z.string().min(1),
  nome_azienda: z.string().min(1),
  bundle_version: z.string().min(1),
  data_export: z.string().datetime({ offset: true }),
  schema_version: z.string().min(1),
});

export type Manifest = z.infer<typeof manifestSchema>;

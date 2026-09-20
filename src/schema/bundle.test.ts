import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { bundleSchema } from "./bundle.js";
import { CURRENT_SCHEMA_VERSION } from "./manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../../fixtures");

function loadJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, relativePath), "utf-8"));
}

function wrapAsBundle(tenantId: string, nomeAzienda: string, catalogDir: string) {
  return {
    manifest: {
      tenant_id: tenantId,
      nome_azienda: nomeAzienda,
      bundle_version: "0.1.0",
      data_export: new Date().toISOString(),
      schema_version: CURRENT_SCHEMA_VERSION,
    },
    catalog: {
      database: loadJson(`${catalogDir}/database.json`),
      price_matrices: loadJson(`${catalogDir}/price_matrices.json`),
    },
    branding: {
      theme: {
        nome_azienda: nomeAzienda,
        palette: { primario: "#1a1a1a" },
      },
    },
  };
}

describe("bundleSchema", () => {
  it("validates a full Vision bundle", () => {
    const result = bundleSchema.safeParse(wrapAsBundle("vision-demo", "Vision Demo", "vision"));
    expect(result.success, result.success ? "" : JSON.stringify(result.error.format())).toBe(
      true,
    );
  });

  it("validates a full Brera bundle", () => {
    const result = bundleSchema.safeParse(wrapAsBundle("brera-demo", "Brera Demo", "brera"));
    expect(result.success, result.success ? "" : JSON.stringify(result.error.format())).toBe(
      true,
    );
  });

  it("rejects a bundle missing schema_version", () => {
    const bundle = wrapAsBundle("vision-demo", "Vision Demo", "vision");
    // @ts-expect-error intentionally invalid for the test
    delete bundle.manifest.schema_version;
    const result = bundleSchema.safeParse(bundle);
    expect(result.success).toBe(false);
  });
});

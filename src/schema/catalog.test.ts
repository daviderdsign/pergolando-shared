import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { catalogDatabaseSchema, priceMatricesSchema } from "./catalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../../fixtures");

function loadJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, relativePath), "utf-8"));
}

describe("catalogDatabaseSchema", () => {
  it("validates the Vision catalog (single sotto-modello, single variante)", () => {
    const result = catalogDatabaseSchema.safeParse(loadJson("vision/database.json"));
    expect(result.success, result.success ? "" : JSON.stringify(result.error.format())).toBe(
      true,
    );
  });

  it("validates the Brera catalog (2 sotto-modelli x 6 varianti x 2 opzioni)", () => {
    const result = catalogDatabaseSchema.safeParse(loadJson("brera/database.json"));
    expect(result.success, result.success ? "" : JSON.stringify(result.error.format())).toBe(
      true,
    );
  });
});

describe("priceMatricesSchema", () => {
  it("validates the Vision price matrices", () => {
    const result = priceMatricesSchema.safeParse(loadJson("vision/price_matrices.json"));
    expect(result.success, result.success ? "" : JSON.stringify(result.error.format())).toBe(
      true,
    );
  });

  it("validates the Brera price matrices", () => {
    const result = priceMatricesSchema.safeParse(loadJson("brera/price_matrices.json"));
    expect(result.success, result.success ? "" : JSON.stringify(result.error.format())).toBe(
      true,
    );
  });
});

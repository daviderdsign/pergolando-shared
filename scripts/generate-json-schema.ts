import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { bundleSchema } from "../src/schema/bundle.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../schema/bundle.schema.json");

const jsonSchema = zodToJsonSchema(bundleSchema, "PergolandoBundle");

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2) + "\n", "utf-8");

console.log(`Wrote ${outPath}`);

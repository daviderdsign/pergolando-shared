# @pergolando/shared

The single source of truth for Pergolando's bundle contract and pricing logic — used by
**Studio** (catalog authoring), **pergolando-backend** (App Venditore), and nothing else.
Extracted from the main `Pergolando` monorepo so a separate backend repo can depend on it
without duplicating or re-implementing the pricing algorithm.

## Why a git dependency, not npm

No npm registry credentials are available for this project, so consumers pin to a tagged
commit instead of a published npm version:

```json
"@pergolando/shared": "github:daviderdsign/pergolando-shared#v0.1.0"
```

Both subpaths resolve from the built `dist/`, which is never committed — `package.json`
declares a `prepare` script (`tsc -p tsconfig.json`), and npm/pnpm run that automatically after
checking out a git dependency, so `dist/` is built on the consumer's machine at install time.

## Subpaths

- `@pergolando/shared/schema` — Zod schema for the bundle (manifest, catalog, price matrices,
  branding, assets placeholder) + the types inferred from it.
- `@pergolando/shared/pricing-engine` — `PergolaEngine`, a TypeScript port of
  `prototype/pergola_engine.py`. Ported as-is, including known quirks — see the comment at the
  top of `src/pricing-engine/engine.ts`.

## Why a TypeScript port of `pergola_engine.py`, not a rewrite

`prototype/pergola_engine.py` is the original, already-validated-against-real-catalogs
reference implementation. `src/pricing-engine/engine.ts` mirrors it line-for-line.
`scripts/generate_golden_fixtures.py` runs the Python engine against a representative set of
inputs (both Vision and Brera, both growth orientations, both blade options, coupling
discounts, height supplements, every error path) and writes `fixtures/*/golden_cases.json`.
`src/pricing-engine/engine.test.ts` replays those same inputs through the TypeScript engine and
asserts identical numeric output. Re-run the generator only if `pergola_engine.py` changes:

```bash
python scripts/generate_golden_fixtures.py
```

## Development

Requires Node 24 and pnpm.

```bash
pnpm install
pnpm build       # writes dist/
pnpm test        # vitest — schema validation + pricing-engine golden-output regression
pnpm typecheck
pnpm lint
```

## Releasing a new version

Bundle-schema and pricing-engine changes must stay in lockstep with Studio and
pergolando-backend, which pin to a tag rather than tracking a branch:

```bash
pnpm build && pnpm test   # must be green
git tag vX.Y.Z
git push origin main --tags
```

Then bump the git-dependency ref in every consumer's `package.json`.

# @waysnx/ui-kit-coverage

A deterministic, **read-only** analyzer that will report how much of a React +
TypeScript/JavaScript application uses the **WaysNX UI Kit**.

> **Status: v0.1 — Milestones 1–5 complete.**
> The analyzer discovers and parses source into a normalized model and reports
> UI Kit **adoption** (M2), **native & custom UI** (M3), catalog-backed
> **replacement candidates** (M4), and a deterministic **Markdown report** (M5).
> It is read-only, offline, deterministic, and has no WDG/AI/GitHub runtime
> dependency. CI enforcement (`check`) is a later milestone (M6).

## What the analyzer is

The tool statically analyzes a target project's source to establish, over later
milestones, which UI Kit packages/components are actually used, what is built
with native or custom components, and where existing UI Kit capabilities might
apply. M1 delivers the scanner foundation that this analysis will build on.

## Principles

- **Deterministic**, AST-based analysis. **No AI/LLM.**
- **Read-only** — never modifies the target project's source.
- **Portable & private** — no network, **no GitHub integration**, no tokens,
  **no WDG dependency**.

## Build & test (in-repo)

The tool lives in the WaysNX UI Kit monorepo under `tools/ui-kit-coverage/` and
is **not published** in v0.1.

```bash
pnpm --filter @waysnx/ui-kit-coverage build
pnpm --filter @waysnx/ui-kit-coverage test
```

## Usage

The eventual published command will be:

```bash
npx @waysnx/ui-kit-coverage analyze ./my-react-app
```

In v0.1 (unpublished), run the built CLI directly — the same `analyze` command:

```bash
node tools/ui-kit-coverage/dist/cli/index.js analyze ./my-react-app
```

### Reports (`report`)

`analyze` writes `coverage.json`. The `report` command writes a deterministic,
human-readable `coverage.md` (and/or JSON) from the same analysis model — it adds
no new analysis:

```bash
ui-kit-coverage report ./my-react-app --format all       # coverage.json + coverage.md
ui-kit-coverage report ./my-react-app --format markdown   # coverage.md only
```

| `--format` | Output |
|---|---|
| `json` | `coverage.json` |
| `markdown` | `coverage.md` |
| `all` (default) | both |

The Markdown report keeps observed facts, catalog facts, and inferred
replacement candidates as distinct sections, preserves the partial-catalog
disclaimer, and is byte-deterministic (no timestamp is written by default).

### Options (M1)

| Flag | Description | Default |
|---|---|---|
| `--output <dir>` | Output directory | `<path>/ui-kit-coverage` |
| `--include <glob>` | Include glob (repeatable) | `**/*.{ts,tsx,js,jsx}` |
| `--exclude <glob>` | Exclude glob (repeatable) | _(none)_ |
| `--config <path>` | Config file (overrides auto-discovery) | _(none)_ |
| `--verbose` | Verbose logging (to stderr) | off |
| `-h, --help` | Show help | — |

## Supported file types

`.ts`, `.tsx`, `.js`, `.jsx`.

## Default exclusions

`node_modules`, `dist`, `build`, `coverage`, `.next`, `storybook-static`,
`.git`, `vendor`, `generated`. Exclusions can be extended via config, but M1
keeps configuration minimal.

## Configuration (`ui-kit-coverage.config.json`)

Auto-discovered in the target project root. M1 honors only:

```json
{
  "include": ["src/**/*.{ts,tsx,js,jsx}"],
  "exclude": ["src/generated/**"],
  "output": "./ui-kit-coverage"
}
```

Precedence (highest wins): CLI flags → `--config` file → auto-discovered config
→ built-in defaults.

## Output

M1 writes a real `coverage.json` (proving files were discovered and parsed):

```jsonc
{
  "schemaVersion": "0.1",
  "analyzerVersion": "0.1.0",
  "project": { "name": "fixture-react-ts", "root": ".", "language": ["typescript", "tsx"] },
  "files": { "scanned": 3, "supported": 2, "ignored": 1 },
  "summary": {
    "waysnxPackagesDetected": 0,
    "uiKitComponentsDetected": 0,
    "nativeElementsDetected": 0,
    "customComponentsDetected": 0
  },
  "packages": [],
  "components": [],
  "nativeUi": [],
  "customComponents": [],
  "replacementCandidates": [],
  "limitations": []
}
```

Summary values are `0` in M1 because adoption analysis belongs to a later
milestone; the report proves the scan ran and fixes the reporting shape.

## Architecture overview

```
Source files
   ↓ discovery (package.json / tsconfig / jsconfig / source enumeration)
   ↓ parser (TypeScript Compiler API)
   ↓ Normalized intermediate model  ← the shared input for future analyzers
     ├── imports
     ├── exports
     ├── jsxElements
     ├── nativeElements
     ├── componentDeclarations
     └── locations
   ↓ report (coverage.json)
```

The parser produces one normalized model per file in a single traversal, so
later analyzers consume that model rather than each re-walking the AST.

## Determinism

The same fixture analyzed twice produces equivalent output. No timestamps are
written into the core analysis data; file and object ordering are stable.

## Programmatic API

```ts
import { analyze, resolveConfig } from "@waysnx/ui-kit-coverage";

const config = await resolveConfig("/abs/path/to/app", {});
const { report, normalized } = await analyze(config);
```

## Current limitations (v0.1)

- **The catalog is intentionally partial.** Replacement candidates are produced
  only where the catalog supports a mapping; absence of a candidate never means
  the UI Kit has no equivalent. Replacement candidates are inferences (each with
  confidence + evidence), not observed facts.
- **No GitHub integration**, **no CI enforcement (`check`)**, **no AI**, **no WDG
  runtime dependency**, **no source modification/migration** — these are out of
  scope for v0.1 / M5.
- Static analysis cannot resolve dynamically-constructed component names; such
  cases are surfaced as `limitations` rather than guessed.
- **React + TS/JS only** (`.ts`, `.tsx`, `.js`, `.jsx`).

## License

Apache-2.0 · © WaysNX Technologies

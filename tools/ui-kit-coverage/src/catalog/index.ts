/**
 * Capability catalog loader (Milestone 4).
 *
 * The catalog is the **sanctioned seed source** for replacement candidates: a
 * committed, versioned, **hand-authored and intentionally partial** JSON file
 * (see docs/adr/0001-catalog-seed-source.md). The analyzer **never calls WDG**
 * at runtime and does not regenerate WDG output.
 *
 * Data-model separation (spec §35): the catalog carries CATALOG FACTS only.
 * Observed usage facts and inferred replacement opportunities live elsewhere.
 *
 * Loading precedence:
 *   1. explicit path (resolved config `catalog`)
 *   2. the bundled default catalog shipped with this package
 *
 * The catalog is designed to be expanded by editing the JSON alone — no
 * analyzer code change is required to add components.
 */

import { promises as fs, existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Confidence } from "../types/index.js";

interface RawCatalogComponent {
  name: string;
  package: string;
  export: string;
  category?: string;
  semanticElements?: string[];
  nativeAlternatives?: string[];
  replacement?: { supported?: boolean; confidence?: string };
}
interface RawCatalog {
  schemaVersion?: string;
  catalogVersion?: string;
  source?: { type?: string; status?: string; description?: string };
  uiKit?: { name?: string; scope?: string; repository?: string; version?: string };
  components?: RawCatalogComponent[];
}

/** A normalized catalog component (catalog fact). */
export interface CatalogComponent {
  name: string;
  package: string;
  export: string;
  category: string;
  semanticElements: string[];
  /** Native element names this component can stand in for. */
  nativeAlternatives: string[];
  replacementSupported: boolean;
  confidence: Confidence;
}

export interface Catalog {
  catalogVersion: string;
  /** True when the catalog declares itself partial (source.status === "partial"). */
  partial: boolean;
  components: CatalogComponent[];
  /** Distinct packages referenced by the catalog. */
  packages: Set<string>;
  /** native element name → catalog components that list it as an alternative. */
  nativeIndex: Map<string, CatalogComponent[]>;
}

function normalizeConfidence(v: string | undefined): Confidence {
  switch ((v ?? "").toLowerCase()) {
    case "high":
      return "HIGH";
    case "medium":
      return "MEDIUM";
    case "low":
      return "LOW";
    default:
      return "LOW";
  }
}

/**
 * Path to the bundled default catalog (packaged under `catalog/`).
 *
 * Resolved by walking up from this module until a `catalog/ui-kit-catalog.json`
 * is found. This is robust to the module's depth, which differs between build
 * entry points (`dist/index.js` vs `dist/cli/index.js`) and between the source
 * tree (`src/catalog/index.ts`) and the bundled output.
 */
export function defaultCatalogPath(): string {
  const start = path.dirname(fileURLToPath(import.meta.url));
  let dir = start;
  // Walk up a bounded number of levels looking for catalog/ui-kit-catalog.json.
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "catalog", "ui-kit-catalog.json");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback to the conventional package-root location.
  return path.resolve(start, "..", "..", "catalog", "ui-kit-catalog.json");
}

function normalize(raw: RawCatalog): Catalog {
  const components: CatalogComponent[] = (raw.components ?? []).map((c) => ({
    name: c.name,
    package: c.package,
    export: c.export,
    category: c.category ?? "unknown",
    semanticElements: c.semanticElements ?? [],
    nativeAlternatives: c.nativeAlternatives ?? [],
    replacementSupported: c.replacement?.supported ?? false,
    confidence: normalizeConfidence(c.replacement?.confidence),
  }));

  const packages = new Set<string>();
  const nativeIndex = new Map<string, CatalogComponent[]>();
  for (const c of components) {
    packages.add(c.package);
    for (const native of c.nativeAlternatives) {
      const list = nativeIndex.get(native) ?? [];
      list.push(c);
      nativeIndex.set(native, list);
    }
  }

  return {
    catalogVersion: raw.catalogVersion ?? "0.0.0",
    partial: (raw.source?.status ?? "").toLowerCase() === "partial",
    components,
    packages,
    nativeIndex,
  };
}

/**
 * Load the catalog from an explicit path or the bundled default. Throws if an
 * explicitly-requested catalog is missing/invalid; a missing bundled catalog
 * yields an empty catalog rather than failing the run.
 */
export async function loadCatalog(catalogPath?: string): Promise<Catalog> {
  const target = catalogPath ?? defaultCatalogPath();
  let raw: string;
  try {
    raw = await fs.readFile(target, "utf8");
  } catch (err) {
    if (catalogPath) {
      throw new Error(`Catalog file not found: ${target} (${(err as Error).message})`);
    }
    return { catalogVersion: "0.0.0", partial: true, components: [], packages: new Set(), nativeIndex: new Map() };
  }
  let parsed: RawCatalog;
  try {
    parsed = JSON.parse(raw) as RawCatalog;
  } catch (err) {
    throw new Error(`Catalog file is not valid JSON: ${target} (${(err as Error).message})`);
  }
  return normalize(parsed);
}

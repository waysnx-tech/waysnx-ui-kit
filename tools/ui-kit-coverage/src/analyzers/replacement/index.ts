/**
 * Replacement candidate engine (Milestone 4, spec §12/§14).
 *
 * Produces INFERENCES only, kept strictly separate from observed facts. Every
 * candidate carries **explainable evidence**: which observed UI fact and which
 * catalog entry produced it.
 *
 * Rules (per approval):
 *   - Native elements do NOT automatically become opportunities — a candidate
 *     exists only where the catalog explicitly lists the element as a
 *     `nativeAlternative`.
 *   - `wrapsUiKit` is a heuristic signal and is NOT, by itself, an automatic
 *     replacement recommendation — this engine does not consume it.
 *   - An incomplete catalog is NOT proof that no replacement exists: absence of
 *     a candidate never asserts "no UI Kit equivalent."
 *   - Custom-component name matching is conservative (exact capped at MEDIUM;
 *     containment downgraded).
 */

import type { Catalog, CatalogComponent } from "../../catalog/index.js";
import type {
  Confidence,
  CustomComponentReport,
  NativeUiReport,
  ReplacementCandidate,
} from "../../types/index.js";

function rank(c: Confidence): number {
  return c === "HIGH" ? 3 : c === "MEDIUM" ? 2 : 1;
}
function downgrade(c: Confidence): Confidence {
  return c === "HIGH" ? "MEDIUM" : "LOW";
}
function label(c: CatalogComponent): string {
  return `${c.package}/${c.export}`;
}

export function buildReplacementCandidates(
  catalog: Catalog,
  nativeUi: NativeUiReport[],
  customComponents: CustomComponentReport[],
): ReplacementCandidate[] {
  const candidates: ReplacementCandidate[] = [];

  // 1. Native → UI Kit — ONLY where the catalog lists the element as an
  //    alternative. Never automatic.
  for (const native of nativeUi) {
    const matches = catalog.nativeIndex.get(native.element);
    if (!matches || matches.length === 0) continue;
    const best = [...matches]
      .filter((m) => m.replacementSupported)
      .sort((a, b) => rank(b.confidence) - rank(a.confidence))[0];
    if (!best) continue;
    candidates.push({
      source: native.element,
      sourceKind: "native",
      candidate: label(best),
      package: best.package,
      confidence: best.confidence,
      occurrences: native.count,
      files: native.files,
      evidence: {
        observedFact: {
          kind: "native-element",
          value: native.element,
          reason: "native element observed in JSX",
        },
        catalogEntry: {
          name: best.name,
          package: best.package,
          export: best.export,
          catalogConfidence: best.confidence,
          matchBasis: "native-alternative",
        },
      },
    });
  }

  // 2. Custom → UI Kit — conservative name similarity.
  for (const custom of customComponents) {
    const match = matchCustom(catalog, custom.component);
    if (!match) continue;
    candidates.push({
      source: custom.component,
      sourceKind: "custom",
      candidate: label(match.component),
      package: match.component.package,
      confidence: match.confidence,
      occurrences: custom.usages,
      files: custom.files,
      evidence: {
        observedFact: {
          kind: "custom-component",
          value: custom.component,
          reason:
            match.basis === "exact-name"
              ? "custom component name matches a catalog component name"
              : "custom component name contains a catalog component name",
        },
        catalogEntry: {
          name: match.component.name,
          package: match.component.package,
          export: match.component.export,
          catalogConfidence: match.component.confidence,
          matchBasis: match.basis,
        },
      },
    });
  }

  candidates.sort(
    (a, b) =>
      rank(b.confidence) - rank(a.confidence) ||
      b.occurrences - a.occurrences ||
      a.source.localeCompare(b.source),
  );
  return candidates;
}

interface CustomMatch {
  component: CatalogComponent;
  confidence: Confidence;
  basis: "exact-name" | "name-contains";
}

function matchCustom(catalog: Catalog, customName: string): CustomMatch | undefined {
  // Exact name match → catalog confidence, but capped at MEDIUM (a same-named
  // custom component may still behave differently).
  const exact = catalog.components.find(
    (c) => c.replacementSupported && c.name.toLowerCase() === customName.toLowerCase(),
  );
  if (exact) {
    const conf: Confidence = exact.confidence === "HIGH" ? "MEDIUM" : exact.confidence;
    return { component: exact, confidence: conf, basis: "exact-name" };
  }

  // Containment match (e.g. "CustomerDatePicker" contains "DatePicker") →
  // one level below the catalog confidence.
  let best: CustomMatch | undefined;
  for (const c of catalog.components) {
    if (!c.replacementSupported || c.name.length < 4) continue;
    if (customName.toLowerCase().includes(c.name.toLowerCase())) {
      const conf = downgrade(c.confidence);
      if (!best || rank(conf) > rank(best.confidence)) {
        best = { component: c, confidence: conf, basis: "name-contains" };
      }
    }
  }
  return best;
}

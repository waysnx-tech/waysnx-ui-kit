/**
 * Analysis orchestration — Milestones 1–2.
 *
 * The read-only pipeline:
 *   discovery → parse (normalized intermediate model) → analyzers → §11 report
 *
 * M1 established discovery + the normalized model. M2 adds the UI Kit **adoption**
 * analyzer, which consumes the normalized model (no new AST traversal) to fill
 * `packages` and `components` and the corresponding summary counts.
 *
 * Native UI, custom components, and replacement candidates remain deferred
 * (M3/M4): those report arrays stay empty and their summary counts stay 0.
 */

import { discoverProject } from "./discovery/index.js";
import { parseSourceFiles } from "./parser/index.js";
import { analyzeAdoption } from "./analyzers/adoption/index.js";
import { analyzeNative } from "./analyzers/native-ui/index.js";
import { analyzeCustom } from "./analyzers/custom-ui/index.js";
import { loadCatalog } from "./catalog/index.js";
import { buildReplacementCandidates } from "./analyzers/replacement/index.js";
import {
  SCHEMA_VERSION,
  type CoverageReport,
  type Limitation,
  type NormalizedFile,
  type ResolvedConfig,
} from "./types/index.js";

/** Analyzer version, surfaced in the report (approval doc §11). */
export const ANALYZER_VERSION = "0.1.0";

export interface AnalyzeResult {
  report: CoverageReport;
  /** Normalized per-file models (shared input for future analyzers). */
  normalized: NormalizedFile[];
}

export async function analyze(config: ResolvedConfig): Promise<AnalyzeResult> {
  const limitations: Limitation[] = [];

  const discovery = await discoverProject(
    config.projectRoot,
    config.include,
    config.exclude,
  );

  if (discovery.manifest === null) {
    limitations.push({
      code: "no-package-json",
      message:
        "No readable package.json found at the project root. Package-level facts cannot be established; source files are still discovered and parsed.",
    });
  }

  const parse = await parseSourceFiles(config.projectRoot, discovery.sourceFiles);
  limitations.push(...parse.limitations);

  // --- M2: UI Kit adoption (consumes the normalized model; no AST traversal) ---
  const adoption = analyzeAdoption(discovery.manifest, parse.files);
  if (adoption.unresolvedDynamicTags.length > 0) {
    for (const loc of adoption.unresolvedDynamicTags) {
      limitations.push({
        code: "dynamic-jsx-tag",
        message: "JSX tag could not be statically resolved to a component; excluded from adoption.",
        location: loc,
      });
    }
  }

  // --- M3: native UI + custom components (both consume the normalized model) ---
  const nativeUi = analyzeNative(parse.files);
  const customComponents = analyzeCustom(parse.files);

  // --- M4: replacement candidates (INFERENCES; catalog facts + observed facts) ---
  const catalog = await loadCatalog(config.catalog);
  const replacementCandidates = buildReplacementCandidates(catalog, nativeUi, customComponents);

  const projectName =
    discovery.manifest?.name ??
    config.projectRoot.split(/[\\/]/).filter(Boolean).pop() ??
    "unknown";

  const report: CoverageReport = {
    schemaVersion: SCHEMA_VERSION,
    analyzerVersion: ANALYZER_VERSION,
    project: {
      name: projectName,
      root: ".",
      language: discovery.languages,
    },
    files: {
      scanned: discovery.counts.scanned,
      supported: discovery.counts.supported,
      ignored: discovery.counts.ignored,
    },
    summary: {
      // M2: packages with at least one resolved JSX usage, and components rendered.
      waysnxPackagesDetected: adoption.packages.filter((p) => p.used).length,
      uiKitComponentsDetected: adoption.components.filter((c) => c.jsxUsages > 0).length,
      // M3: total native element occurrences, and distinct custom components.
      nativeElementsDetected: nativeUi.reduce((n, e) => n + e.count, 0),
      customComponentsDetected: customComponents.length,
    },
    packages: adoption.packages,
    components: adoption.components,
    nativeUi,
    customComponents,
    replacementCandidates,
    limitations,
  };

  return { report, normalized: parse.files };
}

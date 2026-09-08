/**
 * Analysis orchestration — Milestone 1 (Scanner Foundation).
 *
 * The read-only M1 pipeline:
 *   discovery → parse (normalized intermediate model) → assemble §11 report
 *
 * M1 proves that real files were discovered and parsed and establishes the
 * reporting shape. UI Kit adoption / native / custom / replacement analysis is
 * deferred to later milestones, so those report arrays are empty and the
 * summary counts are zero (approval doc §11). Parse/read limitations and a
 * `no-package-json` limitation are surfaced.
 *
 * The normalized per-file models produced here are the shared input for future
 * analyzers (approval doc §5); M1 also exposes them via `AnalyzeResult` for
 * inspection/testing.
 */

import { discoverProject } from "./discovery/index.js";
import { parseSourceFiles } from "./parser/index.js";
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
    // Analysis is deferred to M2+; M1 reports zeros over a real scan.
    summary: {
      waysnxPackagesDetected: 0,
      uiKitComponentsDetected: 0,
      nativeElementsDetected: 0,
      customComponentsDetected: 0,
    },
    packages: [],
    components: [],
    nativeUi: [],
    customComponents: [],
    replacementCandidates: [],
    limitations,
  };

  return { report, normalized: parse.files };
}

/**
 * JSON report writer (spec §25).
 *
 * Emits the stable, machine-readable coverage.json. The schema is intentionally
 * minimal for v0.1 and versioned via `schemaVersion`. Output is deterministic:
 * arrays are pre-sorted by their analyzers, and JSON is pretty-printed with a
 * stable key order (the order defined by the CoverageReport interface).
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { CoverageReport } from "../../types/index.js";

/** Serialize a coverage report to a deterministic JSON string. */
export function renderJson(report: CoverageReport): string {
  return JSON.stringify(report, null, 2) + "\n";
}

/** Write coverage.json into the output directory (created if needed). */
export async function writeJsonReport(
  outputDir: string,
  report: CoverageReport,
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const target = path.join(outputDir, "coverage.json");
  await fs.writeFile(target, renderJson(report), "utf8");
  return target;
}

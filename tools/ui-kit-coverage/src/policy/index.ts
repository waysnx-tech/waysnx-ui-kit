/**
 * CI policy engine (Milestone 6).
 *
 * Pure, testable evaluation of optional policy thresholds against a coverage
 * report. Only the `check` command consults this; `analyze`/`report` never
 * enforce policy.
 *
 * Design:
 *   - Fully opt-in. With no thresholds configured, the result is a pass and
 *     `enforced` is false (report-only).
 *   - Observed-fact thresholds (min*) are catalog-independent and are the
 *     recommended gates. The candidate-based threshold is off unless set and is
 *     labeled catalog-limited, because the catalog is intentionally partial.
 *   - Consumes the existing model only — no analysis logic here.
 */

import type { CoverageReport, PolicyConfig } from "../types/index.js";

export interface PolicyViolation {
  policy: string;
  message: string;
  /** True when this threshold is derived from catalog-backed inferences. */
  catalogLimited: boolean;
}

export interface PolicyResult {
  /** True when no policy was configured or all configured policies passed. */
  pass: boolean;
  /** True when at least one threshold was configured. */
  enforced: boolean;
  violations: PolicyViolation[];
}

export function evaluatePolicy(
  report: CoverageReport,
  policy: PolicyConfig | undefined,
): PolicyResult {
  const violations: PolicyViolation[] = [];

  if (!policy || Object.keys(policy).length === 0) {
    return { pass: true, enforced: false, violations };
  }

  const s = report.summary;
  const highCandidates = report.replacementCandidates.filter((c) => c.confidence === "HIGH").length;

  if (policy.minUiKitPackagesUsed !== undefined && s.waysnxPackagesDetected < policy.minUiKitPackagesUsed) {
    violations.push({
      policy: "minUiKitPackagesUsed",
      message: `UI Kit packages used (${s.waysnxPackagesDetected}) is below the minimum (${policy.minUiKitPackagesUsed}).`,
      catalogLimited: false,
    });
  }

  if (policy.minComponentsUsed !== undefined && s.uiKitComponentsDetected < policy.minComponentsUsed) {
    violations.push({
      policy: "minComponentsUsed",
      message: `UI Kit components used (${s.uiKitComponentsDetected}) is below the minimum (${policy.minComponentsUsed}).`,
      catalogLimited: false,
    });
  }

  if (policy.minUiKitUsages !== undefined) {
    const usages = report.components.reduce((n, c) => n + c.jsxUsages, 0);
    if (usages < policy.minUiKitUsages) {
      violations.push({
        policy: "minUiKitUsages",
        message: `UI Kit JSX usages (${usages}) is below the minimum (${policy.minUiKitUsages}).`,
        catalogLimited: false,
      });
    }
  }

  if (policy.maxNativeElements !== undefined && s.nativeElementsDetected > policy.maxNativeElements) {
    violations.push({
      policy: "maxNativeElements",
      message: `Native elements (${s.nativeElementsDetected}) exceed the maximum (${policy.maxNativeElements}).`,
      catalogLimited: false,
    });
  }

  if (policy.maxHighConfidenceCandidates !== undefined && highCandidates > policy.maxHighConfidenceCandidates) {
    violations.push({
      policy: "maxHighConfidenceCandidates",
      message:
        `HIGH-confidence replacement candidates (${highCandidates}) exceed the maximum ` +
        `(${policy.maxHighConfidenceCandidates}). Note: this reflects only catalog-backed ` +
        `candidates; the catalog is intentionally partial.`,
      catalogLimited: true,
    });
  }

  return { pass: violations.length === 0, enforced: true, violations };
}

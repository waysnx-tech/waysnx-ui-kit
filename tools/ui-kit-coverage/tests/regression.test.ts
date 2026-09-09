import { describe, it, expect, beforeAll } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/analyze.js";
import { resolveConfig } from "../src/cli/config.js";
import { renderJson } from "../src/reports/json/index.js";
import type { CoverageReport } from "../src/types/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const largeApp = path.join(here, "fixtures", "large-app");

let report: CoverageReport;
beforeAll(async () => {
  const cfg = await resolveConfig(largeApp, { format: "json" });
  report = (await analyze(cfg)).report;
});

describe("M6 regression — larger multi-file app", () => {
  it("summary matches the known-good baseline", () => {
    expect(report.summary).toEqual({
      waysnxPackagesDetected: 2,
      uiKitComponentsDetected: 4,
      nativeElementsDetected: 6,
      customComponentsDetected: 2,
    });
  });

  it("classifies packages: used, re-export-only, declared-unused", () => {
    const by = Object.fromEntries(report.packages.map((p) => [p.name, p]));
    expect(by["@waysnx/ui-core"]).toMatchObject({ imported: true, used: true });
    expect(by["@waysnx/ui-feedback"]).toMatchObject({ imported: true, used: true });
    expect(by["@waysnx/ui-grid-builder"]).toMatchObject({ imported: false, used: false }); // re-export only
    expect(by["@waysnx/ui-layout"]).toMatchObject({ declared: true, imported: false, used: false });
  });

  it("custom detection is conservative (external <Link> not custom; project components are)", () => {
    const names = report.customComponents.map((c) => c.component);
    expect(names).toContain("StatCard");
    expect(names).toContain("LegacyDatePicker");
    expect(names).not.toContain("Link"); // external bare package → not custom
    expect(report.customComponents.find((c) => c.component === "StatCard")?.wrapsUiKit).toBe(true);
  });

  it("produces no table candidate (catalog authoritative)", () => {
    expect(report.replacementCandidates.some((c) => c.source === "table")).toBe(false);
    expect(report.replacementCandidates.some((c) => /Grid|DataGrid/.test(c.candidate))).toBe(false);
  });

  it("renders a stable JSON snapshot with a stable top-level schema surface", () => {
    const a = renderJson(report);
    const b = renderJson(report);
    expect(a).toEqual(b);
    expect(Object.keys(JSON.parse(a)).sort()).toEqual(
      [
        "analyzerVersion",
        "components",
        "customComponents",
        "files",
        "limitations",
        "nativeUi",
        "packages",
        "project",
        "replacementCandidates",
        "schemaVersion",
        "summary",
      ].sort(),
    );
  });
});

describe("M6 performance smoke", () => {
  it("analyzes the fixture well under a generous bound", async () => {
    const cfg = await resolveConfig(largeApp, { format: "json" });
    const start = Date.now();
    await analyze(cfg);
    const elapsed = Date.now() - start;
    // Generous CI-safe guard against accidental O(n^2) blowups, not a benchmark.
    expect(elapsed).toBeLessThan(5000);
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/analyze.js";
import { resolveConfig } from "../src/cli/config.js";
import { renderMarkdown } from "../src/reports/markdown/index.js";
import { SCHEMA_VERSION, type CoverageReport } from "../src/types/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "native-custom");

let report: CoverageReport;
let md: string;
beforeAll(async () => {
  const cfg = await resolveConfig(fixture, { format: "markdown" });
  report = (await analyze(cfg)).report;
  md = renderMarkdown(report);
});

/** An empty-but-valid model for minimal/edge rendering. */
function emptyReport(): CoverageReport {
  return {
    schemaVersion: SCHEMA_VERSION,
    analyzerVersion: "0.1.0",
    project: { name: "empty", root: ".", language: [] },
    files: { scanned: 0, supported: 0, ignored: 0 },
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
    limitations: [],
  };
}

describe("M5 markdown — sections", () => {
  it("includes all top-level sections", () => {
    for (const heading of [
      "# WaysNX UI Kit Coverage Report",
      "## Summary",
      "## Observed Facts",
      "## Catalog Facts",
      "## Inferences",
      "## Limitations",
    ]) {
      expect(md).toContain(heading);
    }
  });

  it("keeps Observed Facts, Catalog Facts, and Inferences as distinct sections", () => {
    const iObs = md.indexOf("## Observed Facts");
    const iCat = md.indexOf("## Catalog Facts");
    const iInf = md.indexOf("## Inferences");
    expect(iObs).toBeGreaterThan(-1);
    expect(iCat).toBeGreaterThan(iObs);
    expect(iInf).toBeGreaterThan(iCat);
  });

  it("renders summary values from the model (does not invent metrics)", () => {
    expect(md).toContain(`| UI Kit packages detected | ${report.summary.waysnxPackagesDetected} |`);
    expect(md).toContain(`| Native elements detected | ${report.summary.nativeElementsDetected} |`);
    expect(md).toContain(`| Replacement candidates | ${report.replacementCandidates.length} |`);
  });

  it("shows the analyzer version and schema", () => {
    expect(md).toContain(`Analyzer version: ${report.analyzerVersion} (schema ${report.schemaVersion})`);
  });
});

describe("M5 markdown — facts vs inferences + evidence", () => {
  it("renders replacement candidates with evidence (basis + confidence + location)", () => {
    expect(md).toContain("### Replacement Candidates");
    expect(md).toContain("Match basis: native-alternative");
    expect(md).toContain("Confidence: HIGH");
    // A source location appears in candidate files (project-relative).
    expect(md).toMatch(/Files: src\/Form\.tsx/);
  });

  it("labels inferences explicitly as candidates, not facts", () => {
    expect(md).toContain("These are candidates, not observed facts.");
  });
});

describe("M5 markdown — partial catalog semantics (mandatory)", () => {
  it("includes the partial-catalog disclaimer", () => {
    expect(md).toContain("intentionally partial");
    expect(md).toContain("does not mean the UI Kit has no equivalent");
  });

  it("uses 'No catalog-backed replacement was identified' for unmapped natives", () => {
    // <form> has no catalog mapping.
    expect(md).toContain("No catalog-backed replacement was identified");
  });

  it("never states 'No UI Kit equivalent exists'", () => {
    expect(md).not.toMatch(/No UI Kit equivalent exists/i);
  });
});

describe("M5 markdown — no new mappings", () => {
  it("does not introduce table -> Grid / DataGrid", () => {
    expect(md).not.toMatch(/table.*->.*Grid/i);
    expect(md).not.toMatch(/DataGrid/);
  });
});

describe("M5 markdown — determinism", () => {
  it("is byte-identical across renders when no timestamp is injected", () => {
    expect(renderMarkdown(report)).toEqual(renderMarkdown(report));
  });

  it("omits any timestamp by default and includes one only when injected", () => {
    expect(renderMarkdown(report)).not.toContain("Generated:");
    const withTs = renderMarkdown(report, { timestamp: "2026-01-01T00:00:00Z" });
    expect(withTs).toContain("Generated: 2026-01-01T00:00:00Z");
  });

  it("contains no environment-specific absolute paths", () => {
    // No Windows drive paths or POSIX home/tmp absolute paths leak into output.
    expect(md).not.toMatch(/[A-Za-z]:\\/);
    expect(md).not.toMatch(/\/(?:home|Users|tmp|var)\//);
  });
});

describe("M5 markdown — minimal / edge model", () => {
  it("renders a valid report for an empty model without throwing", () => {
    const out = renderMarkdown(emptyReport());
    expect(out).toContain("## Observed Facts");
    expect(out).toContain("_No `@waysnx/*` packages detected._");
    expect(out).toContain("_No catalog-backed replacement was identified._");
    expect(out).toContain("_No limitations recorded for this run._");
  });

  it("handles a candidate with no files gracefully", () => {
    const r = emptyReport();
    r.replacementCandidates = [
      {
        source: "button",
        sourceKind: "native",
        candidate: "@waysnx/ui-core/Button",
        package: "@waysnx/ui-core",
        confidence: "HIGH",
        occurrences: 1,
        files: [],
        evidence: {
          observedFact: { kind: "native-element", value: "button", reason: "native element observed in JSX" },
          catalogEntry: {
            name: "Button",
            package: "@waysnx/ui-core",
            export: "Button",
            catalogConfidence: "HIGH",
            matchBasis: "native-alternative",
          },
        },
      },
    ];
    const out = renderMarkdown(r);
    expect(out).toContain("Files: (none)");
  });
});

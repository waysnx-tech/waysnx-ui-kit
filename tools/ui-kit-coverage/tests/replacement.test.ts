import { describe, it, expect, beforeAll } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/analyze.js";
import { resolveConfig } from "../src/cli/config.js";
import { loadCatalog, defaultCatalogPath } from "../src/catalog/index.js";
import { buildReplacementCandidates } from "../src/analyzers/replacement/index.js";
import type { CoverageReport, NativeUiReport, CustomComponentReport } from "../src/types/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "native-custom");

describe("M4 catalog loader", () => {
  it("loads the bundled hand-authored catalog and marks it partial", async () => {
    const cat = await loadCatalog();
    expect(cat.partial).toBe(true);
    expect(cat.components.length).toBe(15);
    expect(cat.catalogVersion).toBe("0.1.1");
  });

  it("normalizes confidence to HIGH/MEDIUM/LOW", async () => {
    const cat = await loadCatalog();
    expect(cat.components.find((c) => c.name === "Button")?.confidence).toBe("HIGH");
    expect(cat.components.find((c) => c.name === "DatePicker")?.confidence).toBe("MEDIUM");
  });

  it("indexes native alternatives (button → Button)", async () => {
    const cat = await loadCatalog();
    expect(cat.nativeIndex.get("button")?.some((c) => c.name === "Button")).toBe(true);
  });

  it("throws for an explicitly-requested missing catalog", async () => {
    await expect(loadCatalog(path.join(here, "nope.json"))).rejects.toThrow(/Catalog file not found/);
  });

  it("default catalog path points at the bundled file", () => {
    expect(defaultCatalogPath().replace(/\\/g, "/")).toMatch(/catalog\/ui-kit-catalog\.json$/);
  });
});

describe("M4 replacement engine — evidence + rules", () => {
  it("native button → Button (HIGH) with explainable evidence", async () => {
    const cat = await loadCatalog();
    const native: NativeUiReport[] = [{ element: "button", count: 4, files: ["a.tsx"] }];
    const [c] = buildReplacementCandidates(cat, native, []);
    expect(c).toMatchObject({
      source: "button",
      sourceKind: "native",
      candidate: "@waysnx/ui-core/Button",
      package: "@waysnx/ui-core",
      confidence: "HIGH",
      occurrences: 4,
    });
    expect(c!.evidence.observedFact).toMatchObject({ kind: "native-element", value: "button" });
    expect(c!.evidence.catalogEntry).toMatchObject({
      name: "Button",
      matchBasis: "native-alternative",
      catalogConfidence: "HIGH",
    });
  });

  it("does NOT automatically turn a native element into an opportunity", async () => {
    const cat = await loadCatalog();
    // 'video' has no catalog nativeAlternative → no candidate (native not automatic).
    const candidates = buildReplacementCandidates(cat, [{ element: "video", count: 3, files: ["a.tsx"] }], []);
    expect(candidates).toHaveLength(0);
  });

  it("custom name containing a catalog name is downgraded (CustomerDatePicker → LOW)", async () => {
    const cat = await loadCatalog();
    const custom: CustomComponentReport[] = [
      { component: "CustomerDatePicker", usages: 3, files: ["a.tsx"], wrapsUiKit: false },
    ];
    const [c] = buildReplacementCandidates(cat, [], custom);
    expect(c?.candidate).toBe("@waysnx/ui-core/DatePicker");
    expect(c?.confidence).toBe("LOW"); // DatePicker catalog MEDIUM → downgraded
    expect(c?.evidence.catalogEntry.matchBasis).toBe("name-contains");
  });

  it("exact custom name match is capped at MEDIUM (not HIGH)", async () => {
    const cat = await loadCatalog();
    const [c] = buildReplacementCandidates(cat, [], [
      { component: "Button", usages: 1, files: ["a.tsx"], wrapsUiKit: false },
    ]);
    expect(c?.confidence).toBe("MEDIUM");
    expect(c?.evidence.catalogEntry.matchBasis).toBe("exact-name");
  });

  it("wrapsUiKit alone does NOT create a replacement recommendation", async () => {
    const cat = await loadCatalog();
    // A custom component whose name has no catalog relation, but wrapsUiKit=true.
    const custom: CustomComponentReport[] = [
      { component: "WidgetPanel", usages: 5, files: ["a.tsx"], wrapsUiKit: true },
    ];
    const candidates = buildReplacementCandidates(cat, [], custom);
    expect(candidates).toHaveLength(0);
  });

  it("produces no candidate when there is no catalog mapping (incomplete catalog is not proof of none)", async () => {
    const cat = await loadCatalog();
    const candidates = buildReplacementCandidates(
      cat,
      [{ element: "video", count: 2, files: ["a.tsx"] }],
      [{ component: "TotallyUnrelatedThing", usages: 5, files: ["a.tsx"], wrapsUiKit: false }],
    );
    expect(candidates).toHaveLength(0);
    // Absence of a candidate is not an assertion that no UI Kit equivalent exists.
  });
});

describe("M4 integration — facts vs inferences stay separate", () => {
  let report: CoverageReport;
  beforeAll(async () => {
    const cfg = await resolveConfig(fixture, { format: "json" });
    report = (await analyze(cfg)).report;
  });

  it("replacementCandidates carry evidence and never appear in observed facts", () => {
    expect(report.replacementCandidates.length).toBeGreaterThan(0);
    for (const c of report.replacementCandidates) {
      expect(c.evidence).toBeDefined();
      expect(c.evidence.observedFact).toBeDefined();
      expect(c.evidence.catalogEntry).toBeDefined();
    }
    // Observed facts (components/nativeUi/customComponents) carry no confidence.
    for (const c of report.components) expect(c).not.toHaveProperty("confidence");
    for (const n of report.nativeUi) expect(n).not.toHaveProperty("confidence");
    for (const cu of report.customComponents) expect(cu).not.toHaveProperty("confidence");
  });

  it("native elements without a catalog mapping remain facts only (no candidate)", () => {
    // <form> is observed as a native fact but has no catalog mapping → no candidate.
    expect(report.nativeUi.some((n) => n.element === "form")).toBe(true);
    expect(report.replacementCandidates.some((c) => c.source === "form")).toBe(false);
  });
});

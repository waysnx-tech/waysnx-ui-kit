import { describe, it, expect, beforeAll } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, type Catalog } from "../src/catalog/index.js";
import { buildReplacementCandidates } from "../src/analyzers/replacement/index.js";
import { analyze } from "../src/analyze.js";
import { resolveConfig } from "../src/cli/config.js";
import type { NativeUiReport } from "../src/types/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "native-custom");

let catalog: Catalog;
beforeAll(async () => {
  catalog = await loadCatalog();
});

describe("catalog integrity (revised v0.1.1)", () => {
  it("loads the revised catalog: 15 components, version 0.1.1, partial", () => {
    expect(catalog.components.length).toBe(15);
    expect(catalog.catalogVersion).toBe("0.1.1");
    expect(catalog.partial).toBe(true);
  });

  it("every component has a package and export", () => {
    for (const c of catalog.components) {
      expect(c.package).toMatch(/^@waysnx\//);
      expect(c.export.length).toBeGreaterThan(0);
    }
  });

  it("normalizes confidence to HIGH/MEDIUM/LOW", () => {
    for (const c of catalog.components) {
      expect(["HIGH", "MEDIUM", "LOW"]).toContain(c.confidence);
    }
  });

  it("does NOT contain a DataGrid entry", () => {
    expect(catalog.components.find((c) => c.name === "DataGrid")).toBeUndefined();
  });

  it("has a Grid entry that is NOT replacement-supported and maps no native element", () => {
    const grid = catalog.components.find((c) => c.name === "Grid");
    expect(grid).toBeDefined();
    expect(grid?.package).toBe("@waysnx/ui-grid-builder");
    expect(grid?.replacementSupported).toBe(false);
    expect(grid?.nativeAlternatives).toEqual([]);
  });

  it("does NOT index `table` as a native alternative (no table→grid mapping)", () => {
    expect(catalog.nativeIndex.has("table")).toBe(false);
  });

  it("corrects package placement for Modal/Tooltip/Tabs", () => {
    expect(catalog.components.find((c) => c.name === "Modal")?.package).toBe("@waysnx/ui-feedback");
    expect(catalog.components.find((c) => c.name === "Tooltip")?.package).toBe("@waysnx/ui-feedback");
    expect(catalog.components.find((c) => c.name === "Tabs")?.package).toBe("@waysnx/ui-layout");
  });

  it("includes the newly-added Image and Textarea entries", () => {
    expect(catalog.components.find((c) => c.name === "Image")?.package).toBe("@waysnx/ui-core");
    expect(catalog.components.find((c) => c.name === "Textarea")?.package).toBe("@waysnx/ui-core");
  });
});

describe("no table → grid/DataGrid replacement candidate is produced", () => {
  it("a native <table> produces NO candidate", () => {
    const native: NativeUiReport[] = [{ element: "table", count: 5, files: ["a.tsx"] }];
    const candidates = buildReplacementCandidates(catalog, native, []);
    expect(candidates).toHaveLength(0);
  });

  it("full pipeline: demo-like table usage never maps to Grid/DataGrid", async () => {
    const cfg = await resolveConfig(fixture, { format: "json" });
    const { report } = await analyze(cfg);
    expect(
      report.replacementCandidates.some(
        (c) => c.source === "table" || /Grid|DataGrid/.test(c.candidate),
      ),
    ).toBe(false);
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/analyze.js";
import { resolveConfig } from "../src/cli/config.js";
import { parseSourceFiles } from "../src/parser/index.js";
import { discoverProject } from "../src/discovery/index.js";
import { analyzeAdoption } from "../src/analyzers/adoption/index.js";
import type { CoverageReport, ComponentReport, PackageReport } from "../src/types/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const adoptionFixture = path.join(here, "fixtures", "adoption");

let report: CoverageReport;
beforeAll(async () => {
  const cfg = await resolveConfig(adoptionFixture, { format: "json" });
  report = (await analyze(cfg)).report;
});

function pkg(name: string): PackageReport | undefined {
  return report.packages.find((p) => p.name === name);
}
function comp(name: string, p: string): ComponentReport | undefined {
  return report.components.find((c) => c.component === name && c.package === p);
}

describe("M2 adoption — package states (spec §6)", () => {
  it("ui-core is declared, imported, and used", () => {
    const p = pkg("@waysnx/ui-core");
    expect(p).toMatchObject({ declared: true, imported: true, used: true });
  });

  it("ui-feedback (namespace import + JSX) is used", () => {
    const p = pkg("@waysnx/ui-feedback");
    expect(p).toMatchObject({ imported: true, used: true });
  });

  it("ui-navigation is referenced but NOT installed", () => {
    const p = pkg("@waysnx/ui-navigation");
    expect(p).toMatchObject({ imported: true, declared: false, referencedButNotInstalled: true });
  });

  it("ui-layout appears only via re-export and is NOT counted as imported/used", () => {
    const p = pkg("@waysnx/ui-layout");
    expect(p).toMatchObject({ declared: true, imported: false, used: false });
  });
});

describe("M2 adoption — component usage (spec §8)", () => {
  it("Button (aliased + plain) collapses to one component: 3 usages across 2 files", () => {
    const c = comp("Button", "@waysnx/ui-core");
    expect(c?.jsxUsages).toBe(3); // 2 aliased in Page + 1 in Other
    expect(c?.importFiles).toBe(2);
    expect(c?.files.length).toBe(2);
  });

  it("Modal via namespace (UI.Modal) attributes to ui-feedback with 1 usage", () => {
    expect(comp("Modal", "@waysnx/ui-feedback")?.jsxUsages).toBe(1);
  });

  it("Input is imported but never rendered (0 JSX usages)", () => {
    const c = comp("Input", "@waysnx/ui-core");
    expect(c?.importFiles).toBe(1);
    expect(c?.jsxUsages).toBe(0);
  });

  it("Grid (re-export only) is not a used component", () => {
    const c = comp("Grid", "@waysnx/ui-layout");
    expect(c).toBeUndefined();
  });
});

describe("M2 adoption — summary", () => {
  it("counts used packages and rendered components", () => {
    // used: ui-core, ui-feedback, ui-navigation (all have a JSX usage)
    expect(report.summary.waysnxPackagesDetected).toBe(3);
    // rendered: Button, Modal, Menu
    expect(report.summary.uiKitComponentsDetected).toBe(3);
  });

  it("adoption facts (packages/components) carry no inference confidence", () => {
    // Adoption remains observed facts; replacement inferences live separately.
    for (const c of report.components) expect(c).not.toHaveProperty("confidence");
    for (const p of report.packages) expect(p).not.toHaveProperty("confidence");
  });
});

describe("M2 adoption — consumes the normalized model (no AST traversal)", () => {
  it("analyzeAdoption operates purely on NormalizedFile[] from the parser", async () => {
    const disco = await discoverProject(adoptionFixture, ["**/*.{ts,tsx,js,jsx}"], []);
    const parsed = await parseSourceFiles(adoptionFixture, disco.sourceFiles);
    // Feed the analyzer only the normalized model + manifest — nothing else.
    const result = analyzeAdoption(disco.manifest, parsed.files);
    expect(result.packages.find((p) => p.name === "@waysnx/ui-core")?.used).toBe(true);
    expect(result.components.find((c) => c.component === "Button")?.jsxUsages).toBe(3);
  });
});

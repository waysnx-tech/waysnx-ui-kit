import { describe, it, expect, beforeAll } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/analyze.js";
import { resolveConfig } from "../src/cli/config.js";
import { toBasePackage } from "../src/parser/index.js";
import type { CoverageReport } from "../src/types/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "native-custom");

let report: CoverageReport;
beforeAll(async () => {
  const cfg = await resolveConfig(fixture, { format: "json" });
  report = (await analyze(cfg)).report;
});

describe("M3 native UI (spec §10)", () => {
  const count = (el: string) => report.nativeUi.find((n) => n.element === el)?.count ?? 0;

  it("counts native input/select/textarea/form/button", () => {
    expect(count("input")).toBe(2);
    expect(count("select")).toBe(1);
    expect(count("textarea")).toBe(1);
    expect(count("form")).toBe(1);
    expect(count("button")).toBe(1);
  });

  it("does NOT count the UI Kit <Button> as native", () => {
    // Only the native submit <button> is counted; <Button> is UI Kit.
    expect(count("button")).toBe(1);
  });

  it("summary.nativeElementsDetected is the total native count", () => {
    expect(report.summary.nativeElementsDetected).toBe(6);
  });
});

describe("M3 custom components — CONSERVATIVE (spec §11 + clarifications)", () => {
  const find = (name: string) => report.customComponents.find((c) => c.component === name);

  it("counts a project-defined component (relative import + declaration) as custom", () => {
    const c = find("LegacyModal");
    expect(c?.usages).toBe(2);
    expect(c?.definition).toBeDefined();
    expect(c?.wrapsUiKit).toBe(true); // its file imports @waysnx/ui-core
  });

  it("does NOT label an external bare-package component as custom", () => {
    // <Link> from react-router-dom must not be custom.
    expect(find("Link")).toBeUndefined();
  });

  it("does NOT label a @waysnx component as custom (that is adoption)", () => {
    expect(find("Button")).toBeUndefined();
    expect(find("DiagnosticsProvider")).toBeUndefined();
  });

  it("summary.customComponentsDetected counts only resolvable project components", () => {
    expect(report.summary.customComponentsDetected).toBe(1);
  });
});

describe("M3 type-only imports are non-runtime", () => {
  it("`import type { ButtonProps }` does not inflate ui-core component detection", () => {
    const uiCore = report.packages.find((p) => p.name === "@waysnx/ui-core");
    // Only Button (a real value import + JSX usage) is counted, not ButtonProps.
    expect(uiCore?.componentsDetected).toBe(1);
    expect(uiCore?.used).toBe(true);
  });
});

describe("M3 subpath import normalization", () => {
  it("attributes `@waysnx/ui-diagnostics/react` to the base package", () => {
    const diag = report.packages.find((p) => p.name === "@waysnx/ui-diagnostics");
    expect(diag).toBeDefined();
    expect(diag?.imported).toBe(true);
    expect(diag?.used).toBe(true); // <DiagnosticsProvider/> rendered
  });

  it("toBasePackage normalizes subpaths while callers preserve the specifier", () => {
    expect(toBasePackage("@waysnx/ui-diagnostics/react")).toBe("@waysnx/ui-diagnostics");
    expect(toBasePackage("@waysnx/ui-core")).toBe("@waysnx/ui-core");
    expect(toBasePackage("react-router-dom/server")).toBe("react-router-dom");
    expect(toBasePackage("./local")).toBe("./local");
  });
});

describe("M3 does not pull M4 scope forward", () => {
  it("replacementCandidates stays empty", () => {
    expect(report.replacementCandidates).toHaveLength(0);
  });
});

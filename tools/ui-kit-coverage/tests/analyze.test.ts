import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, ANALYZER_VERSION } from "../src/analyze.js";
import { resolveConfig } from "../src/cli/config.js";
import { renderJson } from "../src/reports/json/index.js";
import { SCHEMA_VERSION } from "../src/types/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const reactTs = path.join(here, "fixtures", "react-ts");

const tempDirs: string[] = [];
afterEach(async () => {
  while (tempDirs.length) {
    await fs.rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("analyze — M1 pipeline + §11 schema", () => {
  it("produces a real report with the agreed top-level schema", async () => {
    const cfg = await resolveConfig(reactTs, { format: "json" });
    const { report } = await analyze(cfg);

    expect(report.schemaVersion).toBe(SCHEMA_VERSION);
    expect(report.analyzerVersion).toBe(ANALYZER_VERSION);

    // project block (§11): name, root, language[]
    expect(report.project.name).toBe("fixture-react-ts");
    expect(report.project.root).toBe(".");
    expect(report.project.language).toContain("tsx");

    // files block (§11): scanned/supported/ignored, from a real scan
    expect(report.files.supported).toBeGreaterThan(0);
    expect(report.files.scanned).toBeGreaterThanOrEqual(report.files.supported);
    expect(report.files.ignored).toBeGreaterThanOrEqual(0);

    // M2 populates adoption counts; native/custom stay 0 (M3).
    expect(report.summary.waysnxPackagesDetected).toBeGreaterThanOrEqual(1);
    expect(report.summary.uiKitComponentsDetected).toBeGreaterThanOrEqual(1);

    // all analysis arrays present
    for (const key of [
      "packages",
      "components",
      "nativeUi",
      "customComponents",
      "replacementCandidates",
    ] as const) {
      expect(Array.isArray(report[key])).toBe(true);
    }
    expect(Array.isArray(report.limitations)).toBe(true);

    // M2 populates adoption: react-ts imports and uses Button from ui-core.
    expect(report.packages.some((p) => p.name === "@waysnx/ui-core" && p.used)).toBe(true);
    expect(report.components.some((c) => c.component === "Button" && c.jsxUsages > 0)).toBe(true);

    // M4 replacement candidates are inferences (may be present); each carries evidence.
    for (const c of report.replacementCandidates) {
      expect(c.evidence).toBeDefined();
    }
  });

  it("exposes the normalized intermediate model for parsed files", async () => {
    const cfg = await resolveConfig(reactTs, { format: "json" });
    const { normalized } = await analyze(cfg);
    expect(normalized.length).toBeGreaterThan(0);

    const app = normalized.find((f) => f.file.endsWith("App.tsx"));
    expect(app).toBeDefined();
    // App.tsx imports Button from @waysnx/ui-core and uses <Button> + native <button>.
    expect(app!.imports.some((i) => i.module === "@waysnx/ui-core" && i.local === "Button")).toBe(true);
    expect(app!.jsxElements.some((j) => j.tag === "Button" && !j.intrinsic)).toBe(true);
    expect(app!.nativeElements.some((n) => n.element === "button")).toBe(true);
    expect(app!.locations.length).toBeGreaterThan(0);
  });

  it("records a no-package-json limitation when the manifest is absent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ukc-nopkg-"));
    tempDirs.push(root);
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "a.tsx"), "export const A = () => <div/>;", "utf8");

    const cfg = await resolveConfig(root, {});
    const { report } = await analyze(cfg);
    expect(report.limitations.some((l) => l.code === "no-package-json")).toBe(true);
  });

  it("renders deterministic JSON (identical across runs)", async () => {
    const cfg = await resolveConfig(reactTs, { format: "json" });
    const a = await analyze(cfg);
    const b = await analyze(cfg);
    expect(renderJson(a.report)).toEqual(renderJson(b.report));
  });
});

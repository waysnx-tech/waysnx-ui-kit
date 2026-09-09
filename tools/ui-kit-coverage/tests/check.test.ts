import { describe, it, expect } from "vitest";
import { evaluatePolicy } from "../src/policy/index.js";
import { resolveConfig } from "../src/cli/config.js";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SCHEMA_VERSION, type CoverageReport } from "../src/types/index.js";

function report(overrides?: Partial<CoverageReport["summary"]>, highCandidates = 1): CoverageReport {
  const candidates: CoverageReport["replacementCandidates"] = [];
  for (let i = 0; i < highCandidates; i++) {
    candidates.push({
      source: `el${i}`,
      sourceKind: "native",
      candidate: "@waysnx/ui-core/Button",
      package: "@waysnx/ui-core",
      confidence: "HIGH",
      occurrences: 1,
      files: ["a.tsx"],
      evidence: {
        observedFact: { kind: "native-element", value: `el${i}`, reason: "x" },
        catalogEntry: { name: "Button", package: "@waysnx/ui-core", export: "Button", catalogConfidence: "HIGH", matchBasis: "native-alternative" },
      },
    });
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    analyzerVersion: "0.1.0",
    project: { name: "t", root: ".", language: ["tsx"] },
    files: { scanned: 3, supported: 2, ignored: 1 },
    summary: {
      waysnxPackagesDetected: 3,
      uiKitComponentsDetected: 4,
      nativeElementsDetected: 6,
      customComponentsDetected: 2,
      ...overrides,
    },
    packages: [],
    components: [{ component: "Button", package: "@waysnx/ui-core", importFiles: 1, jsxUsages: 5, files: ["a.tsx"], locations: [] }],
    nativeUi: [],
    customComponents: [],
    replacementCandidates: candidates,
    limitations: [],
  };
}

describe("M6 policy engine", () => {
  it("passes and is NOT enforced when no policy is set", () => {
    const r = evaluatePolicy(report(), undefined);
    expect(r.enforced).toBe(false);
    expect(r.pass).toBe(true);
  });

  it("passes when all thresholds are satisfied", () => {
    const r = evaluatePolicy(report(), {
      minUiKitPackagesUsed: 2,
      minComponentsUsed: 3,
      minUiKitUsages: 5,
      maxNativeElements: 10,
      maxHighConfidenceCandidates: 5,
    });
    expect(r.enforced).toBe(true);
    expect(r.pass).toBe(true);
  });

  it("fails minUiKitPackagesUsed when below threshold (observed fact)", () => {
    const r = evaluatePolicy(report(), { minUiKitPackagesUsed: 5 });
    expect(r.pass).toBe(false);
    expect(r.violations[0]?.policy).toBe("minUiKitPackagesUsed");
    expect(r.violations[0]?.catalogLimited).toBe(false);
  });

  it("fails maxNativeElements when exceeded", () => {
    const r = evaluatePolicy(report({ nativeElementsDetected: 20 }), { maxNativeElements: 5 });
    expect(r.pass).toBe(false);
    expect(r.violations[0]?.policy).toBe("maxNativeElements");
  });

  it("flags maxHighConfidenceCandidates as catalog-limited", () => {
    const r = evaluatePolicy(report({}, 10), { maxHighConfidenceCandidates: 3 });
    expect(r.pass).toBe(false);
    expect(r.violations[0]?.policy).toBe("maxHighConfidenceCandidates");
    expect(r.violations[0]?.catalogLimited).toBe(true);
  });

  it("reports multiple violations together", () => {
    const r = evaluatePolicy(report(), { minUiKitPackagesUsed: 9, minComponentsUsed: 9, minUiKitUsages: 99 });
    expect(r.violations.length).toBe(3);
  });
});

describe("M6 policy config resolution", () => {
  const tempDirs: string[] = [];
  async function makeProject(files: Record<string, string>): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ukc-pol-"));
    tempDirs.push(dir);
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(dir, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, "utf8");
    }
    return dir;
  }

  it("reads a policy block from the config file", async () => {
    const root = await makeProject({
      "package.json": "{}",
      "ui-kit-coverage.config.json": JSON.stringify({ policy: { minUiKitPackagesUsed: 2 } }),
    });
    const cfg = await resolveConfig(root, {});
    expect(cfg.policy?.minUiKitPackagesUsed).toBe(2);
    await fs.rm(root, { recursive: true, force: true });
  });

  it("CLI policy flags override config-file policy", async () => {
    const root = await makeProject({
      "package.json": "{}",
      "ui-kit-coverage.config.json": JSON.stringify({ policy: { minUiKitPackagesUsed: 2 } }),
    });
    const cfg = await resolveConfig(root, { policy: { minUiKitPackagesUsed: 9 } });
    expect(cfg.policy?.minUiKitPackagesUsed).toBe(9);
    await fs.rm(root, { recursive: true, force: true });
  });

  it("ignores non-numeric policy values", async () => {
    const root = await makeProject({
      "package.json": "{}",
      "ui-kit-coverage.config.json": JSON.stringify({ policy: { minUiKitPackagesUsed: "lots", maxNativeElements: 3 } }),
    });
    const cfg = await resolveConfig(root, {});
    expect(cfg.policy?.minUiKitPackagesUsed).toBeUndefined();
    expect(cfg.policy?.maxNativeElements).toBe(3);
    await fs.rm(root, { recursive: true, force: true });
  });
});

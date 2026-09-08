import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverProject,
  enumerateSourceFiles,
  globToRegExp,
} from "../src/discovery/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const reactTs = path.join(here, "fixtures", "react-ts");
const reactJs = path.join(here, "fixtures", "react-js");

describe("globToRegExp", () => {
  it("matches ** across segments", () => {
    expect(globToRegExp("**/*.tsx").test("src/pages/App.tsx")).toBe(true);
    expect(globToRegExp("**/*.tsx").test("App.tsx")).toBe(true);
  });

  it("respects {a,b} alternation and extensions", () => {
    const re = globToRegExp("**/*.{ts,tsx,js,jsx}");
    expect(re.test("src/App.tsx")).toBe(true);
    expect(re.test("src/App.js")).toBe(true);
    expect(re.test("src/App.css")).toBe(false);
  });

  it("does not let * cross a path segment", () => {
    expect(globToRegExp("src/*.tsx").test("src/App.tsx")).toBe(true);
    expect(globToRegExp("src/*.tsx").test("src/pages/App.tsx")).toBe(false);
  });
});

describe("discoverProject — React/TS project", () => {
  it("reads the manifest and detects tsconfig + languages", async () => {
    const r = await discoverProject(reactTs, ["**/*.{ts,tsx,js,jsx}"], []);
    expect(r.manifest?.name).toBe("fixture-react-ts");
    expect(r.hasTsConfig).toBe(true);
    expect(r.hasJsConfig).toBe(false);
    expect(r.languages).toContain("tsx");
    expect(r.sourceFiles.length).toBeGreaterThan(0);
  });
});

describe("discoverProject — JS project", () => {
  it("detects js/jsx and ignores node_modules by default", async () => {
    const r = await discoverProject(reactJs, ["**/*.{ts,tsx,js,jsx}"], []);
    expect(r.manifest?.name).toBe("fixture-react-js");
    expect(r.languages).toContain("jsx");
    // The nested node_modules file must never appear.
    expect(r.sourceFiles.some((f) => f.includes("node_modules"))).toBe(false);
  });
});

describe("discoverProject — missing package.json", () => {
  it("returns manifest null without throwing", async () => {
    // 'here' (the tests dir) has no package.json of its own.
    const r = await discoverProject(here, ["**/*.{ts,tsx,js,jsx}"], []);
    expect(r.manifest).toBeNull();
    expect(r.sourceFiles.length).toBeGreaterThan(0);
  });
});

describe("discoverProject — invalid path", () => {
  it("throws for a non-existent project root", async () => {
    await expect(
      discoverProject(path.join(here, "does-not-exist-xyz"), ["**/*"], []),
    ).rejects.toThrow(/does not exist/);
  });
});

describe("enumerateSourceFiles — exclude globs + counts", () => {
  it("excludes files matching an exclude pattern", async () => {
    const all = await enumerateSourceFiles(reactTs, ["**/*.{ts,tsx,js,jsx}"], []);
    const excluded = await enumerateSourceFiles(
      reactTs,
      ["**/*.{ts,tsx,js,jsx}"],
      ["**/*.generated.tsx"],
    );
    expect(all.files.length).toBeGreaterThan(excluded.files.length);
    expect(excluded.files.some((f) => f.endsWith(".generated.tsx"))).toBe(false);
  });

  it("reports scanned/ignored counts", async () => {
    const excluded = await enumerateSourceFiles(
      reactTs,
      ["**/*.{ts,tsx,js,jsx}"],
      ["**/*.generated.tsx"],
    );
    // The excluded .generated.tsx file is counted as scanned but ignored.
    expect(excluded.scanned).toBeGreaterThanOrEqual(excluded.files.length);
    expect(excluded.ignored).toBeGreaterThanOrEqual(1);
  });

  it("returns a deterministic (sorted) order", async () => {
    const a = await enumerateSourceFiles(reactTs, ["**/*.{ts,tsx,js,jsx}"], []);
    const b = await enumerateSourceFiles(reactTs, ["**/*.{ts,tsx,js,jsx}"], []);
    expect(a.files).toEqual(b.files);
    expect([...a.files].sort()).toEqual(a.files);
  });
});

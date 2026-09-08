import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseSourceFiles } from "../src/parser/index.js";

const tempDirs: string[] = [];
afterEach(async () => {
  while (tempDirs.length) await fs.rm(tempDirs.pop()!, { recursive: true, force: true });
});

async function parseOne(content: string, ext = ".tsx") {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ukc-se-"));
  tempDirs.push(dir);
  const file = path.join(dir, `File${ext}`);
  await fs.writeFile(file, content, "utf8");
  const { files } = await parseSourceFiles(dir, [file]);
  return files[0]!;
}

describe("side-effect import classification (M3 clarification)", () => {
  it("classifies stylesheet imports as 'style'", async () => {
    const f = await parseOne(
      `import "@waysnx/ui-core/dist/index.css";\nimport "./theme.scss";\nexport const X = () => null;`,
    );
    const kinds = f.sideEffectImports.map((s) => s.kind);
    expect(kinds).toContain("style");
    expect(f.sideEffectImports.filter((s) => s.kind === "style").length).toBe(2);
    // A CSS side-effect import must NOT become a value import.
    expect(f.imports.some((i) => i.module.endsWith(".css"))).toBe(false);
  });

  it("classifies asset imports as 'asset'", async () => {
    const f = await parseOne(`import "./logo.png";\nexport const X = () => null;`);
    expect(f.sideEffectImports[0]?.kind).toBe("asset");
  });

  it("classifies other unbound side-effect imports as 'other' (not styling)", async () => {
    const f = await parseOne(`import "core-js/stable";\nexport const X = () => null;`);
    expect(f.sideEffectImports[0]?.kind).toBe("other");
  });

  it("records base package for a scoped CSS subpath while preserving the specifier", async () => {
    const f = await parseOne(`import "@waysnx/ui-core/dist/index.css";\nexport const X = () => null;`);
    const se = f.sideEffectImports[0]!;
    expect(se.module).toBe("@waysnx/ui-core/dist/index.css"); // original preserved
    expect(se.basePackage).toBe("@waysnx/ui-core"); // normalized base
  });
});

describe("type-only flag on normalized imports (M3 clarification)", () => {
  it("flags whole-clause `import type`", async () => {
    const f = await parseOne(`import type { ButtonProps } from "@waysnx/ui-core";\nexport const X = () => null;`);
    const imp = f.imports.find((i) => i.local === "ButtonProps");
    expect(imp?.typeOnly).toBe(true);
  });

  it("flags per-specifier `import { type X, Y }`", async () => {
    const f = await parseOne(
      `import { type ButtonProps, Button } from "@waysnx/ui-core";\nexport const X = () => null;`,
    );
    expect(f.imports.find((i) => i.local === "ButtonProps")?.typeOnly).toBe(true);
    expect(f.imports.find((i) => i.local === "Button")?.typeOnly).toBe(false);
  });
});

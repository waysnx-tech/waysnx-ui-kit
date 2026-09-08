import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveConfig, CONFIG_FILENAME, DEFAULT_FORMAT } from "../src/cli/config.js";

const tempDirs: string[] = [];

async function makeProject(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ukc-cfg-"));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
  }
  return dir;
}

afterEach(async () => {
  while (tempDirs.length) {
    const d = tempDirs.pop()!;
    await fs.rm(d, { recursive: true, force: true });
  }
});

describe("resolveConfig — defaults", () => {
  it("uses built-in defaults when nothing is provided", async () => {
    const root = await makeProject({ "package.json": "{}" });
    const cfg = await resolveConfig(root, {});
    expect(cfg.format).toBe(DEFAULT_FORMAT);
    expect(cfg.include).toEqual(["**/*.{ts,tsx,js,jsx}"]);
    expect(cfg.exclude).toEqual([]);
    expect(cfg.output).toBe(path.join(root, "ui-kit-coverage"));
    expect(cfg.verbose).toBe(false);
  });
});

describe("resolveConfig — precedence", () => {
  it("auto-discovered config file overrides defaults", async () => {
    const root = await makeProject({
      "package.json": "{}",
      [CONFIG_FILENAME]: JSON.stringify({ exclude: ["**/*.spec.tsx"], output: "out-dir" }),
    });
    const cfg = await resolveConfig(root, {});
    expect(cfg.exclude).toEqual(["**/*.spec.tsx"]);
    expect(cfg.output).toBe(path.resolve("out-dir"));
  });

  it("CLI flags override the auto-discovered config file", async () => {
    const root = await makeProject({
      "package.json": "{}",
      [CONFIG_FILENAME]: JSON.stringify({ exclude: ["**/*.spec.tsx"] }),
    });
    const cfg = await resolveConfig(root, { exclude: ["**/cli-wins.tsx"], format: "json" });
    expect(cfg.exclude).toEqual(["**/cli-wins.tsx"]);
    expect(cfg.format).toBe("json");
  });

  it("--config file overrides the auto-discovered config file", async () => {
    const root = await makeProject({
      "package.json": "{}",
      [CONFIG_FILENAME]: JSON.stringify({ include: ["auto/**"] }),
      "custom.json": JSON.stringify({ include: ["explicit/**"] }),
    });
    const cfg = await resolveConfig(root, { config: path.join(root, "custom.json") });
    expect(cfg.include).toEqual(["explicit/**"]);
  });

  it("throws when --config points to a missing/invalid file", async () => {
    const root = await makeProject({ "package.json": "{}" });
    await expect(
      resolveConfig(root, { config: path.join(root, "nope.json") }),
    ).rejects.toThrow(/--config file not found/);
  });

  it("ignores unknown keys in a config file (only documented keys honored)", async () => {
    const root = await makeProject({
      "package.json": "{}",
      [CONFIG_FILENAME]: JSON.stringify({ include: ["src/**"], evil: "ignored", output: 123 }),
    });
    const cfg = await resolveConfig(root, {});
    expect(cfg.include).toEqual(["src/**"]);
    // output was a number → sanitized away → falls back to default
    expect(cfg.output).toBe(path.join(root, "ui-kit-coverage"));
  });
});

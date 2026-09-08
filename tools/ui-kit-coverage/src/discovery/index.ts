/**
 * Project discovery (spec §5).
 *
 * Read-only inspection of a target project:
 *  - locate package.json / tsconfig.json / jsconfig.json
 *  - enumerate supported source files (.ts, .tsx, .js, .jsx)
 *  - apply the default ignore list plus configured include/exclude
 *
 * No source file is ever modified. All reads are best-effort: a missing
 * tsconfig/jsconfig is not an error, but a missing package.json is reported
 * so the caller can decide how to proceed.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

export const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"] as const;

/** Directories ignored by default (spec §5). */
export const DEFAULT_IGNORES = [
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  "storybook-static",
  ".git",
  "vendor",
  "generated",
] as const;

export interface PackageManifest {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface DiscoveryResult {
  projectRoot: string;
  /** Parsed package.json, or null if absent/unreadable. */
  manifest: PackageManifest | null;
  hasTsConfig: boolean;
  hasJsConfig: boolean;
  /** Absolute paths of discovered source files. */
  sourceFiles: string[];
  /** Detected language tags for the report (e.g. ["typescript", "tsx"]). */
  languages: string[];
  /** File counts for the report's `files` block (§11). */
  counts: { scanned: number; supported: number; ignored: number };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe<T>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * A minimal glob matcher supporting the subset used by include/exclude:
 *   **  → any number of path segments
 *   *   → any run of characters within a segment
 *   {a,b} → alternation
 * Paths are matched using forward slashes, relative to the project root.
 */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // ** → match across segments (optionally followed by a slash)
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) {
        re += "\\{";
      } else {
        const options = glob
          .slice(i + 1, end)
          .split(",")
          .map((o) => o.replace(/[.+^$()|[\]\\]/g, "\\$&"));
        re += `(?:${options.join("|")})`;
        i = end;
      }
    } else if (".+^$()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

function matchesAny(relPath: string, globs: string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(relPath));
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/** File-enumeration result with counts for the §11 `files` block. */
export interface EnumerationResult {
  /** Supported source files selected for analysis (absolute paths, sorted). */
  files: string[];
  /** Total files encountered under non-ignored directories. */
  scanned: number;
  /** Files not selected (unsupported extension, or excluded/not-included). */
  ignored: number;
}

/**
 * Recursively enumerate source files under projectRoot, honoring the default
 * ignore directories, include globs, and exclude globs. Also reports how many
 * files were scanned vs. ignored (for the report's `files` counts).
 *
 * Note: files inside default-ignored directories (node_modules, dist, ...) are
 * not descended into and are therefore not counted as "scanned".
 */
export async function enumerateSourceFiles(
  projectRoot: string,
  include: string[],
  exclude: string[],
): Promise<EnumerationResult> {
  const results: string[] = [];
  const ignoreSet = new Set<string>(DEFAULT_IGNORES);
  let scanned = 0;
  let ignored = 0;

  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = toPosix(path.relative(projectRoot, abs));
      if (entry.isDirectory()) {
        if (ignoreSet.has(entry.name)) continue;
        if (exclude.length && matchesAny(rel, exclude)) continue;
        await walk(abs);
      } else if (entry.isFile()) {
        scanned += 1;
        const ext = path.extname(entry.name);
        const supported = SUPPORTED_EXTENSIONS.includes(
          ext as (typeof SUPPORTED_EXTENSIONS)[number],
        );
        const excluded = exclude.length > 0 && matchesAny(rel, exclude);
        const included = include.length === 0 || matchesAny(rel, include);
        if (supported && !excluded && included) {
          results.push(abs);
        } else {
          ignored += 1;
        }
      }
    }
  }

  await walk(projectRoot);
  results.sort();
  return { files: results, scanned, ignored };
}

function detectLanguages(files: string[]): string[] {
  const langs = new Set<string>();
  for (const f of files) {
    const ext = path.extname(f);
    if (ext === ".ts") langs.add("typescript");
    else if (ext === ".tsx") langs.add("tsx");
    else if (ext === ".js") langs.add("javascript");
    else if (ext === ".jsx") langs.add("jsx");
  }
  return [...langs].sort();
}

/**
 * Discover a target project. Throws only if the project root itself does not
 * exist; a missing package.json is reported via `manifest: null`.
 */
export async function discoverProject(
  projectRoot: string,
  include: string[],
  exclude: string[],
): Promise<DiscoveryResult> {
  if (!(await pathExists(projectRoot))) {
    throw new Error(`Project path does not exist: ${projectRoot}`);
  }

  const manifest = await readJsonSafe<PackageManifest>(
    path.join(projectRoot, "package.json"),
  );
  const hasTsConfig = await pathExists(path.join(projectRoot, "tsconfig.json"));
  const hasJsConfig = await pathExists(path.join(projectRoot, "jsconfig.json"));
  const enumeration = await enumerateSourceFiles(projectRoot, include, exclude);
  const sourceFiles = enumeration.files;

  return {
    projectRoot,
    manifest,
    hasTsConfig,
    hasJsConfig,
    sourceFiles,
    languages: detectLanguages(sourceFiles),
    counts: {
      scanned: enumeration.scanned,
      supported: sourceFiles.length,
      ignored: enumeration.ignored,
    },
  };
}

/**
 * Configuration resolution (approval doc §7, §8) — Milestone 1.
 *
 * Precedence (highest wins):
 *   1. CLI flags
 *   2. --config <path> file
 *   3. auto-discovered ui-kit-coverage.config.json (in the target project root)
 *   4. built-in defaults
 *
 * M1 keeps configuration minimal: only include/exclude/output are honored.
 * (Catalog and CI policy configuration belong to later milestones.)
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { CliOptions, FileConfig, OutputFormat, PolicyConfig, ResolvedConfig } from "../types/index.js";

export const CONFIG_FILENAME = "ui-kit-coverage.config.json";

export const DEFAULT_INCLUDE = ["**/*.{ts,tsx,js,jsx}"];
export const DEFAULT_EXCLUDE: string[] = [];
export const DEFAULT_OUTPUT_DIRNAME = "ui-kit-coverage";
export const DEFAULT_FORMAT: OutputFormat = "json";

async function readJsonSafe<T>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function sanitizePolicy(raw: unknown): PolicyConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: PolicyConfig = {};
  const numKeys = [
    "minUiKitPackagesUsed",
    "minComponentsUsed",
    "minUiKitUsages",
    "maxNativeElements",
    "maxHighConfidenceCandidates",
  ] as const;
  for (const k of numKeys) {
    if (typeof r[k] === "number" && Number.isFinite(r[k])) out[k] = r[k] as number;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Only pick the documented, safe keys from a config file. */
function sanitizeFileConfig(raw: unknown): FileConfig {
  const out: FileConfig = {};
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.include)) out.include = r.include.filter((x): x is string => typeof x === "string");
    if (Array.isArray(r.exclude)) out.exclude = r.exclude.filter((x): x is string => typeof x === "string");
    if (typeof r.output === "string") out.output = r.output;
    if (typeof r.catalog === "string") out.catalog = r.catalog;
    const policy = sanitizePolicy(r.policy);
    if (policy) out.policy = policy;
  }
  return out;
}

/**
 * Resolve the effective config for a run.
 *
 * @param projectRoot absolute path to the target project.
 * @param cli parsed CLI options.
 */
export async function resolveConfig(
  projectRoot: string,
  cli: CliOptions,
): Promise<ResolvedConfig> {
  // Layer 3: auto-discovered config in the project root.
  const autoConfig = sanitizeFileConfig(
    await readJsonSafe(path.join(projectRoot, CONFIG_FILENAME)),
  );

  // Layer 2: explicit --config file (resolved relative to cwd).
  let explicitConfig: FileConfig = {};
  if (cli.config) {
    const explicitPath = path.resolve(cli.config);
    const raw = await readJsonSafe(explicitPath);
    if (raw === null) {
      throw new Error(`--config file not found or invalid JSON: ${explicitPath}`);
    }
    explicitConfig = sanitizeFileConfig(raw);
  }

  const include =
    cli.include ?? explicitConfig.include ?? autoConfig.include ?? DEFAULT_INCLUDE;
  const exclude =
    cli.exclude ?? explicitConfig.exclude ?? autoConfig.exclude ?? DEFAULT_EXCLUDE;
  const format = cli.format ?? DEFAULT_FORMAT;
  const verbose = cli.verbose ?? false;

  const outputRaw =
    cli.output ??
    explicitConfig.output ??
    autoConfig.output ??
    path.join(projectRoot, DEFAULT_OUTPUT_DIRNAME);

  const catalogRaw = explicitConfig.catalog ?? autoConfig.catalog;
  const catalog = catalogRaw ? path.resolve(projectRoot, catalogRaw) : undefined;

  // Policy: CLI flags merge over file policy (explicit > auto).
  const filePolicy = explicitConfig.policy ?? autoConfig.policy;
  const policy: PolicyConfig | undefined =
    cli.policy || filePolicy ? { ...(filePolicy ?? {}), ...(cli.policy ?? {}) } : undefined;

  return {
    projectRoot,
    output: path.resolve(outputRaw),
    format,
    include,
    exclude,
    verbose,
    catalog,
    policy,
  };
}

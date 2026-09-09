#!/usr/bin/env node
/**
 * ui-kit-coverage CLI.
 *
 *   ui-kit-coverage analyze <path> [options]            # writes coverage.json
 *   ui-kit-coverage report  <path> [--format ...] [...] # M5: JSON and/or Markdown
 *
 * `analyze` is unchanged (JSON only) for backward compatibility. `report` adds
 * the M5 Markdown output. No network, no GitHub integration, no AI, no WDG.
 */

import { parseArgs } from "node:util";
import * as path from "node:path";
import { analyze } from "../analyze.js";
import { resolveConfig } from "./config.js";
import { writeJsonReport } from "../reports/json/index.js";
import { writeMarkdownReport } from "../reports/markdown/index.js";
import { evaluatePolicy } from "../policy/index.js";
import type { CliOptions, OutputFormat, PolicyConfig } from "../types/index.js";

const EXIT_OK = 0;
const EXIT_USAGE = 1;
const EXIT_ERROR = 2;
// `check` policy failure (M6).
const EXIT_POLICY = 3;

const USAGE = `ui-kit-coverage — WaysNX UI Kit adoption analyzer (v0.1)

Usage:
  ui-kit-coverage analyze <path> [options]
  ui-kit-coverage report  <path> [options] [--format json|markdown|all]
  ui-kit-coverage check   <path> [options] [threshold flags]

Options:
  --output <directory>   Output directory (default: <path>/ui-kit-coverage)
  --format <fmt>         report/check: json | markdown | all (default: all for report)
  --include <glob>       Include glob (repeatable)
  --exclude <glob>       Exclude glob (repeatable)
  --config <path>        Path to a config file (overrides auto-discovery)
  --verbose              Verbose logging
  -h, --help             Show this help

check-only threshold flags (all opt-in; omitted = report only, always passes):
  --min-packages <n>        Fail if fewer than n UI Kit packages are used
  --min-components <n>       Fail if fewer than n UI Kit components are used
  --min-usages <n>          Fail if fewer than n UI Kit JSX usages
  --max-native <n>          Fail if more than n native elements are detected
  --max-high-candidates <n> Fail if HIGH-confidence candidates exceed n
                            (catalog-limited; the catalog is intentionally partial)

Notes:
  - Read-only: never modifies the target project.
  - No network, no GitHub integration, no AI, no WDG.
  - 'analyze' writes coverage.json. 'report' additionally renders a
    deterministic coverage.md. 'check' evaluates opt-in CI policy thresholds
    and exits 3 on a policy failure (exits 0 when no thresholds are set).
`;

function isFormat(v: string | undefined): v is OutputFormat {
  return v === "json" || v === "markdown" || v === "all";
}

function parsePolicyFlags(values: {
  "min-packages"?: string;
  "min-components"?: string;
  "min-usages"?: string;
  "max-native"?: string;
  "max-high-candidates"?: string;
}): PolicyConfig | undefined {
  const num = (v: string | undefined): number | undefined => {
    if (v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const out: PolicyConfig = {};
  const mp = num(values["min-packages"]);
  const mc = num(values["min-components"]);
  const mu = num(values["min-usages"]);
  const mn = num(values["max-native"]);
  const mh = num(values["max-high-candidates"]);
  if (mp !== undefined) out.minUiKitPackagesUsed = mp;
  if (mc !== undefined) out.minComponentsUsed = mc;
  if (mu !== undefined) out.minUiKitUsages = mu;
  if (mn !== undefined) out.maxNativeElements = mn;
  if (mh !== undefined) out.maxHighConfidenceCandidates = mh;
  return Object.keys(out).length ? out : undefined;
}

async function runAnalyze(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      output: { type: "string" },
      include: { type: "string", multiple: true },
      exclude: { type: "string", multiple: true },
      config: { type: "string" },
      verbose: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return EXIT_OK;
  }

  const targetArg = positionals[0];
  if (!targetArg) {
    process.stderr.write("error: missing <path> argument\n\n" + USAGE);
    return EXIT_USAGE;
  }

  const projectRoot = path.resolve(targetArg);
  const cli: CliOptions = {
    output: values.output,
    include: values.include,
    exclude: values.exclude,
    config: values.config,
    verbose: values.verbose,
  };

  const config = await resolveConfig(projectRoot, cli);

  if (config.verbose) {
    process.stderr.write(`Analyzing: ${config.projectRoot}\n`);
    process.stderr.write(`Output:    ${config.output}\n`);
  }

  const { report } = await analyze(config);
  const wrote = await writeJsonReport(config.output, report);

  process.stdout.write(
    `ui-kit-coverage: analyzed ${report.project.name} — ` +
      `${report.files.supported} supported / ${report.files.scanned} scanned files, ` +
      `${report.limitations.length} limitation(s).\n`,
  );
  process.stdout.write(`  wrote ${wrote}\n`);

  return EXIT_OK;
}

async function runReport(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      output: { type: "string" },
      format: { type: "string" },
      include: { type: "string", multiple: true },
      exclude: { type: "string", multiple: true },
      config: { type: "string" },
      verbose: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return EXIT_OK;
  }

  const targetArg = positionals[0];
  if (!targetArg) {
    process.stderr.write("error: missing <path> argument\n\n" + USAGE);
    return EXIT_USAGE;
  }

  if (values.format !== undefined && !isFormat(values.format)) {
    process.stderr.write(`error: invalid --format '${values.format}' (expected json|markdown|all)\n`);
    return EXIT_USAGE;
  }
  const format: OutputFormat = isFormat(values.format) ? values.format : "all";

  const projectRoot = path.resolve(targetArg);
  const cli: CliOptions = {
    output: values.output,
    include: values.include,
    exclude: values.exclude,
    config: values.config,
    verbose: values.verbose,
  };

  const config = await resolveConfig(projectRoot, cli);
  const { report } = await analyze(config);

  const wrote: string[] = [];
  if (format === "json" || format === "all") {
    wrote.push(await writeJsonReport(config.output, report));
  }
  if (format === "markdown" || format === "all") {
    // No timestamp injected → deterministic output.
    wrote.push(await writeMarkdownReport(config.output, report));
  }

  process.stdout.write(
    `ui-kit-coverage: reported ${report.project.name} — ` +
      `${report.summary.waysnxPackagesDetected} UI Kit package(s), ` +
      `${report.summary.uiKitComponentsDetected} component(s), ` +
      `${report.replacementCandidates.length} candidate(s).\n`,
  );
  for (const w of wrote) process.stdout.write(`  wrote ${w}\n`);

  return EXIT_OK;
}

async function runCheck(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      output: { type: "string" },
      format: { type: "string" },
      include: { type: "string", multiple: true },
      exclude: { type: "string", multiple: true },
      config: { type: "string" },
      verbose: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      "min-packages": { type: "string" },
      "min-components": { type: "string" },
      "min-usages": { type: "string" },
      "max-native": { type: "string" },
      "max-high-candidates": { type: "string" },
    },
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return EXIT_OK;
  }

  const targetArg = positionals[0];
  if (!targetArg) {
    process.stderr.write("error: missing <path> argument\n\n" + USAGE);
    return EXIT_USAGE;
  }
  if (values.format !== undefined && !isFormat(values.format)) {
    process.stderr.write(`error: invalid --format '${values.format}' (expected json|markdown|all)\n`);
    return EXIT_USAGE;
  }

  const projectRoot = path.resolve(targetArg);
  const cli: CliOptions = {
    output: values.output,
    include: values.include,
    exclude: values.exclude,
    config: values.config,
    verbose: values.verbose,
    policy: parsePolicyFlags(values),
  };

  const config = await resolveConfig(projectRoot, cli);
  const { report } = await analyze(config);

  // Optionally also write reports when a format is requested.
  if (values.format) {
    const format = values.format as OutputFormat;
    if (format === "json" || format === "all") await writeJsonReport(config.output, report);
    if (format === "markdown" || format === "all") await writeMarkdownReport(config.output, report);
  }

  const result = evaluatePolicy(report, config.policy);

  // The catalog is intentionally partial — always surface this in check output.
  const disclaimer =
    "note: the UI Kit catalog is intentionally partial; a passing/failing check " +
    "does not imply the catalog is complete or authoritative.\n";

  if (!result.enforced) {
    process.stdout.write("ui-kit-coverage check: no policy thresholds configured — reporting only.\n");
    process.stdout.write(
      `  ${report.summary.waysnxPackagesDetected} package(s) used, ` +
        `${report.summary.uiKitComponentsDetected} component(s) used, ` +
        `${report.summary.nativeElementsDetected} native element(s), ` +
        `${report.replacementCandidates.filter((c) => c.confidence === "HIGH").length} high-confidence candidate(s).\n`,
    );
    process.stdout.write(disclaimer);
    return EXIT_OK;
  }

  if (result.pass) {
    process.stdout.write("ui-kit-coverage check: PASS — all configured policies satisfied.\n");
    process.stdout.write(disclaimer);
    return EXIT_OK;
  }

  process.stderr.write("ui-kit-coverage check: FAIL — policy violations:\n");
  for (const v of result.violations) {
    const tag = v.catalogLimited ? " [catalog-limited]" : "";
    process.stderr.write(`  - [${v.policy}]${tag} ${v.message}\n`);
  }
  process.stderr.write(disclaimer);
  return EXIT_POLICY;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  switch (command) {
    case "analyze":
      return runAnalyze(argv.slice(1));
    case "report":
      return runReport(argv.slice(1));
    case "check":
      return runCheck(argv.slice(1));
    case undefined:
      process.stdout.write(USAGE);
      return EXIT_USAGE;
    case "-h":
    case "--help":
      process.stdout.write(USAGE);
      return EXIT_OK;
    default:
      process.stderr.write(`error: unknown command '${command}'\n\n` + USAGE);
      return EXIT_USAGE;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    process.exitCode = EXIT_ERROR;
  });

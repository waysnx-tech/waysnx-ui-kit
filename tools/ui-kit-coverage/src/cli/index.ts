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
import type { CliOptions, OutputFormat } from "../types/index.js";

const EXIT_OK = 0;
const EXIT_USAGE = 1;
const EXIT_ERROR = 2;

const USAGE = `ui-kit-coverage — WaysNX UI Kit adoption analyzer (v0.1)

Usage:
  ui-kit-coverage analyze <path> [options]
  ui-kit-coverage report  <path> [options] [--format json|markdown|all]

Options:
  --output <directory>   Output directory (default: <path>/ui-kit-coverage)
  --format <fmt>         report only: json | markdown | all (default: all)
  --include <glob>       Include glob (repeatable)
  --exclude <glob>       Exclude glob (repeatable)
  --config <path>        Path to a config file (overrides auto-discovery)
  --verbose              Verbose logging
  -h, --help             Show this help

Notes:
  - Read-only: never modifies the target project.
  - No network, no GitHub integration, no AI, no WDG.
  - 'analyze' writes coverage.json. 'report' additionally renders a
    deterministic coverage.md from the same model.
`;

function isFormat(v: string | undefined): v is OutputFormat {
  return v === "json" || v === "markdown" || v === "all";
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

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  switch (command) {
    case "analyze":
      return runAnalyze(argv.slice(1));
    case "report":
      return runReport(argv.slice(1));
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

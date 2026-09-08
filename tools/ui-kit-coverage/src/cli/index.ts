#!/usr/bin/env node
/**
 * ui-kit-coverage CLI (approval doc §7) — Milestone 1.
 *
 *   ui-kit-coverage analyze <path> [options]
 *
 * M1 implements only the `analyze` command and writes a JSON report. Later
 * milestones add adoption analysis, a Markdown report, and (M6) a `check`
 * command; those are intentionally not present yet.
 */

import { parseArgs } from "node:util";
import * as path from "node:path";
import { analyze } from "../analyze.js";
import { resolveConfig } from "./config.js";
import { writeJsonReport } from "../reports/json/index.js";
import type { CliOptions } from "../types/index.js";

const EXIT_OK = 0;
const EXIT_USAGE = 1;
const EXIT_ERROR = 2;

const USAGE = `ui-kit-coverage — WaysNX UI Kit adoption analyzer (v0.1, Milestone 1)

Usage:
  ui-kit-coverage analyze <path> [options]

Options:
  --output <directory>   Output directory (default: <path>/ui-kit-coverage)
  --include <glob>       Include glob (repeatable)
  --exclude <glob>       Exclude glob (repeatable)
  --config <path>        Path to a config file (overrides auto-discovery)
  --verbose              Verbose logging
  -h, --help             Show this help

Notes:
  - Read-only: never modifies the target project.
  - No network, no GitHub integration, no AI, no WDG.
  - M1 is the scanner foundation: it discovers and parses source and writes a
    real coverage.json. UI Kit adoption analysis arrives in later milestones.
`;

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

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  switch (command) {
    case "analyze":
      return runAnalyze(argv.slice(1));
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

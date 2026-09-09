/**
 * Markdown reporter (Milestone 5).
 *
 * Renders a deterministic, human-readable `coverage.md` from the existing
 * CoverageReport model. This reporter is PURE presentation: it performs no
 * source analysis, does not traverse the AST, and does not recalculate metrics
 * — it consumes what the analyzers already produced.
 *
 * Guarantees:
 *   - Byte-for-byte deterministic for identical model input. No timestamps by
 *     default (an explicit timestamp may be injected via options for display),
 *     no random ids, no environment-specific absolute paths, stable ordering.
 *   - Facts vs. inferences are kept explicit: Observed Facts, Catalog Facts, and
 *     Inferences are distinct sections.
 *   - Partial-catalog language is mandatory: never "No UI Kit equivalent
 *     exists"; use "No catalog-backed replacement was identified."
 *   - Introduces NO new mappings (e.g. no table → Grid/DataGrid); it only
 *     renders candidates the analyzer already produced.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type {
  CoverageReport,
  PackageReport,
  ReplacementCandidate,
} from "../../types/index.js";

export interface MarkdownOptions {
  /**
   * Optional display timestamp. When omitted, no timestamp is written — this
   * keeps output byte-deterministic (recommended for tests/CI). Callers that
   * want a timestamp inject it explicitly.
   */
  timestamp?: string;
}

const DISCLAIMER =
  "The UI Kit catalog is intentionally partial. Absence of a catalog-backed " +
  "replacement does not mean the UI Kit has no equivalent -- only that none was " +
  "identified from the current catalog.";

function h(level: number, text: string): string {
  return `${"#".repeat(level)} ${text}`;
}

function table(headers: string[], rows: string[][], align?: ("l" | "r")[]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map((_, i) => (align?.[i] === "r" ? "---:" : "---")).join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

function yn(b: boolean): string {
  return b ? "Yes" : "No";
}

function loc(l: { file: string; line: number; column: number }): string {
  return `${l.file}:${l.line}:${l.column}`;
}

/** Render the coverage model to deterministic Markdown. */
export function renderMarkdown(report: CoverageReport, options: MarkdownOptions = {}): string {
  const s = report.summary;
  const out: string[] = [];

  // 1. Title
  out.push(h(1, "WaysNX UI Kit Coverage Report"));
  out.push("");

  // 2. Analysis scope/path + 3. summary metadata (project-relative only; no abs paths)
  out.push(`- Project: ${report.project.name}`);
  out.push(`- Scope: ${report.project.root}`);
  out.push(`- Languages: ${report.project.language.length ? report.project.language.join(", ") : "(none)"}`);
  // 12. Analyzer/package version
  out.push(`- Analyzer version: ${report.analyzerVersion} (schema ${report.schemaVersion})`);
  if (options.timestamp) out.push(`- Generated: ${options.timestamp}`);
  out.push("");

  // 3. Existing summary metrics — Executive summary
  out.push(h(2, "Summary"));
  out.push("");
  out.push(
    table(
      ["Metric", "Value"],
      [
        ["Files scanned", String(report.files.scanned)],
        ["Files supported", String(report.files.supported)],
        ["Files ignored", String(report.files.ignored)],
        ["UI Kit packages detected", String(s.waysnxPackagesDetected)],
        ["UI Kit components detected", String(s.uiKitComponentsDetected)],
        ["Native elements detected", String(s.nativeElementsDetected)],
        ["Custom components detected", String(s.customComponentsDetected)],
        ["Replacement candidates", String(report.replacementCandidates.length)],
      ],
      ["l", "r"],
    ),
  );
  out.push("");

  // ---- OBSERVED FACTS -------------------------------------------------
  out.push(h(2, "Observed Facts"));
  out.push("");
  out.push("_Directly established from source analysis._");
  out.push("");

  // 4. UI Kit utilization summary — Adoption
  out.push(h(3, "UI Kit Package Adoption"));
  out.push("");
  if (report.packages.length) {
    out.push(
      table(
        ["Package", "Declared", "Imported", "Used", "Imported but unused", "Referenced not installed", "Components"],
        report.packages.map((p: PackageReport) => [
          p.name,
          yn(p.declared),
          yn(p.imported),
          yn(p.used),
          yn(p.importedButUnused),
          yn(p.referencedButNotInstalled),
          String(p.componentsDetected),
        ]),
        ["l", "l", "l", "l", "l", "l", "r"],
      ),
    );
  } else {
    out.push("_No `@waysnx/*` packages detected._");
  }
  out.push("");

  out.push(h(3, "UI Kit Component Utilization"));
  out.push("");
  const usedComponents = report.components.filter((c) => c.importFiles > 0 || c.jsxUsages > 0);
  if (usedComponents.length) {
    out.push(
      table(
        ["Component", "Package", "Imports", "JSX usages", "Files"],
        usedComponents.map((c) => [
          c.component,
          c.package,
          String(c.importFiles),
          String(c.jsxUsages),
          String(c.files.length),
        ]),
        ["l", "l", "r", "r", "r"],
      ),
    );
  } else {
    out.push("_No UI Kit components detected in use._");
  }
  out.push("");

  // 5. Native/custom component summary
  out.push(h(3, "Native Elements"));
  out.push("");
  if (report.nativeUi.length) {
    out.push(
      table(
        ["Element", "Count", "Files"],
        report.nativeUi.map((n) => [`\`${n.element}\``, String(n.count), String(n.files.length)]),
        ["l", "r", "r"],
      ),
    );
    out.push("");
    out.push("_Native elements are reported as observed facts; they are not inherently problematic._");
  } else {
    out.push("_No tracked native elements detected._");
  }
  out.push("");

  out.push(h(3, "Custom Components"));
  out.push("");
  if (report.customComponents.length) {
    out.push(
      table(
        ["Component", "Usages", "Wraps UI Kit", "Definition"],
        report.customComponents.map((c) => [
          c.component,
          String(c.usages),
          yn(c.wrapsUiKit),
          c.definition ? loc(c.definition) : "(none)",
        ]),
        ["l", "r", "l", "l"],
      ),
    );
  } else {
    out.push("_No project-defined custom components detected._");
  }
  out.push("");

  // ---- CATALOG FACTS --------------------------------------------------
  out.push(h(2, "Catalog Facts"));
  out.push("");
  out.push("_Established from the UI Kit catalog (not from source)._");
  out.push("");
  // Catalog coverage is represented via the catalog entries referenced by
  // candidates (the reporter does not load the catalog itself). Summarize the
  // distinct catalog components that appear as candidate targets.
  const catalogTargets = new Map<string, { pkg: string; export: string; confidence: string }>();
  for (const c of report.replacementCandidates) {
    const key = `${c.evidence.catalogEntry.package}/${c.evidence.catalogEntry.export}`;
    if (!catalogTargets.has(key)) {
      catalogTargets.set(key, {
        pkg: c.evidence.catalogEntry.package,
        export: c.evidence.catalogEntry.export,
        confidence: c.evidence.catalogEntry.catalogConfidence,
      });
    }
  }
  if (catalogTargets.size) {
    const rows = [...catalogTargets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => [`${v.pkg}/${v.export}`, v.confidence]);
    out.push(table(["Catalog component", "Catalog confidence"], rows, ["l", "l"]));
  } else {
    out.push("_No catalog components were referenced by any candidate in this run._");
  }
  out.push("");
  out.push(`> ${DISCLAIMER}`);
  out.push("");

  // ---- INFERENCES -----------------------------------------------------
  out.push(h(2, "Inferences"));
  out.push("");
  out.push("_Derived recommendations. These are candidates, not observed facts._");
  out.push("");
  out.push(h(3, "Replacement Candidates"));
  out.push("");
  if (report.replacementCandidates.length) {
    for (const c of report.replacementCandidates) {
      out.push(...renderCandidate(c));
      out.push("");
    }
  } else {
    out.push("_No catalog-backed replacement was identified._");
    out.push("");
  }

  // Native elements without a candidate — explicit, using partial-catalog language.
  const candidateNativeSources = new Set(
    report.replacementCandidates.filter((c) => c.sourceKind === "native").map((c) => c.source),
  );
  const nativeWithoutCandidate = report.nativeUi
    .map((n) => n.element)
    .filter((el) => !candidateNativeSources.has(el));
  if (nativeWithoutCandidate.length) {
    out.push(h(3, "Native Elements Without a Catalog-Backed Replacement"));
    out.push("");
    out.push(
      nativeWithoutCandidate.map((el) => `- \`${el}\`: No catalog-backed replacement was identified.`).join("\n"),
    );
    out.push("");
  }

  // ---- LIMITATIONS ----------------------------------------------------
  out.push(h(2, "Limitations"));
  out.push("");
  if (report.limitations.length) {
    out.push(
      report.limitations
        .map((l) => `- **${l.code}**: ${l.message}${l.location ? ` (${loc(l.location)})` : ""}`)
        .join("\n"),
    );
  } else {
    out.push("_No limitations recorded for this run._");
  }
  out.push("");

  return out.join("\n");
}

function renderCandidate(c: ReplacementCandidate): string[] {
  const kind = c.sourceKind === "native" ? `Native \`<${c.source}>\`` : `Custom \`${c.source}\``;
  const files = c.files.length ? c.files.join(", ") : "(none)";
  return [
    `- ${kind} -> \`${c.candidate}\``,
    `  - Suggested package: \`${c.package}\``,
    `  - Suggested export: \`${c.evidence.catalogEntry.export}\``,
    `  - Confidence: ${c.confidence}`,
    `  - Match basis: ${c.evidence.catalogEntry.matchBasis}`,
    `  - Catalog confidence: ${c.evidence.catalogEntry.catalogConfidence}`,
    `  - Observed: ${c.evidence.observedFact.reason}`,
    `  - Occurrences: ${c.occurrences}`,
    `  - Files: ${files}`,
  ];
}

/** Write coverage.md into the output directory (created if needed). */
export async function writeMarkdownReport(
  outputDir: string,
  report: CoverageReport,
  options: MarkdownOptions = {},
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const target = path.join(outputDir, "coverage.md");
  await fs.writeFile(target, renderMarkdown(report, options), "utf8");
  return target;
}

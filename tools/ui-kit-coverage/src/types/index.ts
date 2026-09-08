/**
 * Shared types for @waysnx/ui-kit-coverage — Milestone 1 (Scanner Foundation).
 *
 * Two families:
 *   1. The stable JSON report schema (approval doc §11), versioned via
 *      `schemaVersion`. M1 produces a REAL report; analysis arrays may be empty
 *      because UI Kit adoption analysis belongs to M2.
 *   2. The normalized intermediate analysis model (approval doc §5/§9/§10) —
 *      the parser produces one normalized per-file model that becomes the common
 *      input for later analyzers, so analyzers do NOT each re-traverse the AST.
 *
 * Strongly typed throughout; `any` is avoided.
 */

/** A resolved source position. Snippets are never included by default. */
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

// ---------------------------------------------------------------------------
// Normalized intermediate analysis model (approval doc §5/§9/§10)
// ---------------------------------------------------------------------------

/** An import binding discovered in a file. */
export interface NormalizedImport {
  /** Module specifier, e.g. "@waysnx/ui-core" or "react". */
  module: string;
  /** Local identifier bound in this file. */
  local: string;
  /** Original exported name; "*" for namespace, "default" for default import. */
  imported: string;
  kind: "named" | "aliased" | "namespace" | "default";
  location: SourceLocation;
}

/** An export discovered in a file (including re-exports). */
export interface NormalizedExport {
  /** Exported name, or "*" for `export * from`. */
  name: string;
  /** Source module for a re-export, else undefined for a local export. */
  from?: string;
  /** True when this is a re-export (`export ... from '...'`). */
  reExport: boolean;
  location: SourceLocation;
}

/** A JSX element occurrence (component or intrinsic). */
export interface NormalizedJsxElement {
  /** Tag as written, e.g. "Button", "UI.Modal", "button". */
  tag: string;
  /** True when the tag is a lowercase intrinsic (native) element. */
  intrinsic: boolean;
  location: SourceLocation;
}

/** A native (intrinsic) element occurrence. */
export interface NormalizedNativeElement {
  element: string;
  location: SourceLocation;
}

/** A component declaration in a file (Capitalized function/const/class). */
export interface NormalizedComponentDeclaration {
  name: string;
  location: SourceLocation;
}

/** The normalized per-file analysis model — shared input for later analyzers. */
export interface NormalizedFile {
  file: string;
  language: string;
  imports: NormalizedImport[];
  exports: NormalizedExport[];
  jsxElements: NormalizedJsxElement[];
  nativeElements: NormalizedNativeElement[];
  componentDeclarations: NormalizedComponentDeclaration[];
  /** All source locations of interest recorded for this file. */
  locations: SourceLocation[];
}

// ---------------------------------------------------------------------------
// Stable JSON report schema (approval doc §11)
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = "0.1" as const;

export interface ProjectInfo {
  name: string;
  root: string;
  language: string[];
}

export interface FileCounts {
  scanned: number;
  supported: number;
  ignored: number;
}

/** M1 summary (approval doc §11). Values may be 0 in M1 (analysis is M2+). */
export interface CoverageSummary {
  waysnxPackagesDetected: number;
  uiKitComponentsDetected: number;
  nativeElementsDetected: number;
  customComponentsDetected: number;
}

/** A self-reported analysis limitation. */
export interface Limitation {
  code: string;
  message: string;
  location?: SourceLocation;
}

/**
 * The M1 coverage report (approval doc §11).
 *
 * `packages`, `components`, `nativeUi`, `customComponents`, and
 * `replacementCandidates` are present as empty arrays in M1 — their contents
 * are produced by later milestones. Their element types are intentionally left
 * open (`unknown[]`) in M1 so the M1 schema does not prematurely commit to
 * analysis shapes that belong to M2–M4.
 */
export interface CoverageReport {
  schemaVersion: typeof SCHEMA_VERSION;
  analyzerVersion: string;
  project: ProjectInfo;
  files: FileCounts;
  summary: CoverageSummary;
  packages: unknown[];
  components: unknown[];
  nativeUi: unknown[];
  customComponents: unknown[];
  replacementCandidates: unknown[];
  limitations: Limitation[];
}

// ---------------------------------------------------------------------------
// Config + runtime types (approval doc §7/§8)
// ---------------------------------------------------------------------------

export type OutputFormat = "json";

/** Effective, fully-resolved configuration used by a run. */
export interface ResolvedConfig {
  /** Absolute path to the target project root. */
  projectRoot: string;
  /** Absolute output directory. */
  output: string;
  format: OutputFormat;
  include: string[];
  exclude: string[];
  verbose: boolean;
}

/** The subset of config that can appear in ui-kit-coverage.config.json. */
export interface FileConfig {
  include?: string[];
  exclude?: string[];
  output?: string;
}

/** Raw CLI options after parsing, before merge/resolution. */
export interface CliOptions {
  output?: string;
  format?: OutputFormat;
  include?: string[];
  exclude?: string[];
  config?: string;
  verbose?: boolean;
}

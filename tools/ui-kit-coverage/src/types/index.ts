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
  /** Original module specifier as written, e.g. "@waysnx/ui-diagnostics/react". */
  module: string;
  /** Normalized base package (e.g. "@waysnx/ui-diagnostics") for a scoped/plain
   *  package specifier; equals `module` when there is no subpath. */
  basePackage: string;
  /** Local identifier bound in this file. */
  local: string;
  /** Original exported name; "*" for namespace, "default" for default import. */
  imported: string;
  kind: "named" | "aliased" | "namespace" | "default";
  /** True for `import type ...` or a per-specifier `import { type X }`. Type-only
   *  imports are erased at build time and are NOT runtime usage. */
  typeOnly: boolean;
  location: SourceLocation;
}

/** An unbound side-effect import: `import '...'` (no bindings). */
export interface NormalizedSideEffectImport {
  /** Original module specifier as written. */
  module: string;
  /** Normalized base package when the specifier is a package import. */
  basePackage: string;
  /**
   * Classification:
   *  - "style": a stylesheet (.css/.scss/.sass/.less)
   *  - "asset": a known asset (image/font/media)
   *  - "other": any other side-effect import (NOT styling; must not count as a
   *    component import)
   */
  kind: "style" | "asset" | "other";
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
  /** Unbound side-effect imports (styling/asset/other), separate from `imports`. */
  sideEffectImports: NormalizedSideEffectImport[];
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

// ---------------------------------------------------------------------------
// M2 — UI Kit adoption report shapes (approval doc §6, §9, §17, §18 of spec)
// ---------------------------------------------------------------------------

/** Package-level adoption state for a `@waysnx/*` package (spec §6). */
export interface PackageReport {
  name: string;
  /** Present in dependencies/devDependencies/peerDependencies of package.json. */
  declared: boolean;
  /** At least one direct import (re-exports excluded, spec §7). */
  imported: boolean;
  /** At least one component from this package is rendered in JSX. */
  used: boolean;
  /** Imported but no JSX usage resolved. */
  importedButUnused: boolean;
  /** Imported in source but NOT declared in package.json, where detectable (§6). */
  referencedButNotInstalled: boolean;
  /** Distinct components from this package detected (imported or used). */
  componentsDetected: number;
}

/** Component-level utilization (spec §8, §18). */
export interface ComponentReport {
  component: string;
  package: string;
  /** Number of files that directly import this component. */
  importFiles: number;
  /** Number of JSX usages across the project. */
  jsxUsages: number;
  /** Files where the component appears (imported or used), sorted. */
  files: string[];
  /** Resolved source locations of JSX usages. */
  locations: SourceLocation[];
}

// ---------------------------------------------------------------------------
// M3 — Native & Custom UI report shapes (spec §10, §11, §19)
// ---------------------------------------------------------------------------

/** Native (intrinsic) element usage (spec §10, §19). Facts only; never "bad". */
export interface NativeUiReport {
  element: string;
  count: number;
  files: string[];
}

/**
 * Application-defined component (spec §11). Reported CONSERVATIVELY: a
 * capitalized JSX tag is custom only when it resolves to a project-defined
 * component (a local declaration in the scanned set, or a local/relative
 * import). External or unresolved components are NOT reported as custom.
 */
export interface CustomComponentReport {
  component: string;
  usages: number;
  /** Files where the component is used, sorted. */
  files: string[];
  /** Definition location when the component is declared in the scanned set. */
  definition?: SourceLocation;
  /** True when the component's definition file imports `@waysnx/*` (heuristic). */
  wrapsUiKit: boolean;
}

/**
 * The coverage report (approval doc §11).
 *
 * As of M2, `packages` and `components` carry UI Kit adoption facts. `nativeUi`,
 * `customComponents`, and `replacementCandidates` remain empty (`unknown[]`)
 * until M3/M4 — their shapes are intentionally not committed here yet, so M3+
 * scope is not pulled forward.
 */
export interface CoverageReport {
  schemaVersion: typeof SCHEMA_VERSION;
  analyzerVersion: string;
  project: ProjectInfo;
  files: FileCounts;
  summary: CoverageSummary;
  packages: PackageReport[];
  components: ComponentReport[];
  nativeUi: NativeUiReport[];
  customComponents: CustomComponentReport[];
  /** M4 (replacement candidates) — intentionally empty until then. */
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

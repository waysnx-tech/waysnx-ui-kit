/**
 * @waysnx/ui-kit-coverage — programmatic API (Milestone 1).
 *
 * Deterministic, read-only scanner foundation for WaysNX UI Kit adoption
 * analysis in a React/TypeScript project. See README for the CLI.
 */

export { analyze, ANALYZER_VERSION, type AnalyzeResult } from "./analyze.js";
export { resolveConfig, CONFIG_FILENAME } from "./cli/config.js";
export { discoverProject, enumerateSourceFiles, type DiscoveryResult } from "./discovery/index.js";
export { parseSourceFiles, type ParseResult } from "./parser/index.js";
export { analyzeAdoption, type AdoptionResult } from "./analyzers/adoption/index.js";
export { analyzeNative } from "./analyzers/native-ui/index.js";
export { analyzeCustom } from "./analyzers/custom-ui/index.js";
export { buildReplacementCandidates } from "./analyzers/replacement/index.js";
export { loadCatalog, defaultCatalogPath, type Catalog, type CatalogComponent } from "./catalog/index.js";
export { toBasePackage } from "./parser/index.js";
export { renderJson, writeJsonReport } from "./reports/json/index.js";
export { renderMarkdown, writeMarkdownReport, type MarkdownOptions } from "./reports/markdown/index.js";
export * from "./types/index.js";

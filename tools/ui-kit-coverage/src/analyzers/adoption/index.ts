/**
 * UI Kit Adoption analyzer (Milestone 2).
 *
 * IMPORTANT (M1 architecture, preserved): this analyzer consumes the
 * NORMALIZED INTERMEDIATE MODEL (`NormalizedFile[]`) produced by the parser.
 * It performs **no AST traversal of its own** — it reads only `imports`,
 * `exports`, and `jsxElements` from the normalized model.
 *
 * It answers, factually (spec §6, §8, §9):
 *   - which `@waysnx/*` packages are declared / imported / used
 *   - imported-but-unused, and referenced-but-not-installed
 *   - per-component import file counts + JSX usage counts + locations
 *
 * Rules:
 *   - Imports are authoritative for adoption; presence in package.json is not.
 *   - Re-exports (`export { X } from '@waysnx/...'`) are tracked but EXCLUDED
 *     from direct usage (spec §7).
 *   - Aliased imports collapse to the original exported component name.
 *   - Namespace usage (`<UI.Button/>`) resolves via the namespace import.
 *   - These are observed FACTS only — no inferred recommendations (that is M4).
 */

import type { PackageManifest } from "../../discovery/index.js";
import type {
  ComponentReport,
  NormalizedFile,
  PackageReport,
  SourceLocation,
} from "../../types/index.js";

const WAYSNX_SCOPE = "@waysnx/";

export interface AdoptionResult {
  packages: PackageReport[];
  components: ComponentReport[];
  /** JSX tags that could not be resolved to a known import (for limitations). */
  unresolvedDynamicTags: SourceLocation[];
}

function isWaysnx(module: string): boolean {
  return module.startsWith(WAYSNX_SCOPE);
}

function declaredPackages(manifest: PackageManifest | null): Set<string> {
  const set = new Set<string>();
  if (!manifest) return set;
  for (const group of [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies]) {
    if (group) for (const name of Object.keys(group)) set.add(name);
  }
  return set;
}

interface CompAcc {
  package: string;
  component: string;
  importFiles: Set<string>;
  jsxUsages: number;
  files: Set<string>;
  locations: SourceLocation[];
}

export function analyzeAdoption(
  manifest: PackageManifest | null,
  files: NormalizedFile[],
): AdoptionResult {
  const declared = declaredPackages(manifest);
  const importedPackages = new Set<string>();
  const reExportedPackages = new Set<string>();
  const unresolvedDynamicTags: SourceLocation[] = [];

  const comps = new Map<string, CompAcc>();
  const compKey = (pkg: string, comp: string) => `${pkg}::${comp}`;
  const ensureComp = (pkg: string, comp: string): CompAcc => {
    const k = compKey(pkg, comp);
    let acc = comps.get(k);
    if (!acc) {
      acc = { package: pkg, component: comp, importFiles: new Set(), jsxUsages: 0, files: new Set(), locations: [] };
      comps.set(k, acc);
    }
    return acc;
  };

  for (const file of files) {
    // Per-file resolution tables built from the normalized imports.
    // local name → { package, exportedComponent }
    const named = new Map<string, { pkg: string; component: string }>();
    // namespace local → package
    const namespaces = new Map<string, string>();

    for (const imp of file.imports) {
      if (!isWaysnx(imp.module)) continue;
      importedPackages.add(imp.module);
      if (imp.kind === "namespace") {
        namespaces.set(imp.local, imp.module);
      } else {
        // named | aliased | default — resolve to the original exported name
        const component = imp.imported === "default" ? imp.local : imp.imported;
        named.set(imp.local, { pkg: imp.module, component });
        // Importing a component counts as an "import file" for that component.
        ensureComp(imp.module, component).importFiles.add(file.file);
      }
    }

    // Re-exports are tracked separately and NOT counted as direct usage (§7).
    for (const exp of file.exports) {
      if (exp.reExport && exp.from && isWaysnx(exp.from)) {
        reExportedPackages.add(exp.from);
      }
    }

    // Resolve JSX usages against this file's import tables (no AST walk).
    for (const el of file.jsxElements) {
      if (el.intrinsic) continue; // native elements are M3
      const tag = el.tag;
      if (tag.includes(".")) {
        // namespace access: Root.Component
        const [root, prop] = tag.split(".", 2);
        const pkg = root ? namespaces.get(root) : undefined;
        if (pkg && prop) {
          const acc = ensureComp(pkg, prop);
          acc.jsxUsages += 1;
          acc.files.add(file.file);
          acc.locations.push(el.location);
        }
        // else: not a @waysnx namespace → not adoption (custom is M3)
      } else if (tag === "<dynamic>") {
        unresolvedDynamicTags.push(el.location);
      } else {
        const binding = named.get(tag);
        if (binding) {
          const acc = ensureComp(binding.pkg, binding.component);
          acc.jsxUsages += 1;
          acc.files.add(file.file);
          acc.locations.push(el.location);
        }
        // else: capitalized tag not from @waysnx → custom (M3), not adoption
      }
    }
  }

  const components: ComponentReport[] = [...comps.values()]
    .map((c) => ({
      component: c.component,
      package: c.package,
      importFiles: c.importFiles.size,
      jsxUsages: c.jsxUsages,
      files: [...c.files].sort(),
      locations: c.locations,
    }))
    .sort(
      (a, b) =>
        b.jsxUsages - a.jsxUsages ||
        a.package.localeCompare(b.package) ||
        a.component.localeCompare(b.component),
    );

  // Package rollup: every @waysnx package that is declared, imported, or re-exported.
  const allPackages = new Set<string>([
    ...[...declared].filter((p) => p.startsWith(WAYSNX_SCOPE)),
    ...importedPackages,
    ...reExportedPackages,
  ]);

  const usedPackages = new Set<string>();
  for (const c of components) if (c.jsxUsages > 0) usedPackages.add(c.package);

  const componentsByPackage = new Map<string, number>();
  for (const c of components) {
    if (c.importFiles > 0 || c.jsxUsages > 0) {
      componentsByPackage.set(c.package, (componentsByPackage.get(c.package) ?? 0) + 1);
    }
  }

  const packages: PackageReport[] = [...allPackages]
    .map((name) => {
      const isDeclared = declared.has(name);
      const isImported = importedPackages.has(name);
      const isUsed = usedPackages.has(name);
      return {
        name,
        declared: isDeclared,
        imported: isImported,
        used: isUsed,
        importedButUnused: isImported && !isUsed,
        referencedButNotInstalled: isImported && !isDeclared,
        componentsDetected: componentsByPackage.get(name) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { packages, components, unresolvedDynamicTags };
}

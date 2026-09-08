/**
 * Custom component analyzer (Milestone 3, spec §11) — CONSERVATIVE.
 *
 * Consumes the normalized model only (no AST traversal). A capitalized JSX tag
 * is reported as a custom component ONLY when it resolves to a project-defined,
 * resolvable application component:
 *
 *   - it is declared in the scanned set (a `componentDeclarations` entry in any
 *     scanned file), OR
 *   - it is imported via a LOCAL/RELATIVE import ("./x", "../x", or an absolute
 *     project path).
 *
 * Explicitly NOT custom (per approved clarification):
 *   - `@waysnx/*` components (that is adoption, M2),
 *   - components imported from an EXTERNAL bare package (e.g. "react-router"),
 *   - unresolved capitalized tags (no declaration and no import) — these are
 *     left out rather than mislabeled.
 *
 * Type-only imports are ignored (a type is not a rendered component).
 */

import type {
  CustomComponentReport,
  NormalizedFile,
  NormalizedImport,
  SourceLocation,
} from "../../types/index.js";

const WAYSNX_SCOPE = "@waysnx/";

function isRelative(module: string): boolean {
  return module.startsWith(".") || module.startsWith("/");
}

interface CustomAcc {
  usages: number;
  files: Set<string>;
  definition?: SourceLocation;
  wrapsUiKit: boolean;
}

export function analyzeCustom(files: NormalizedFile[]): CustomComponentReport[] {
  // 1. Global set of project-defined component declarations (name → location),
  //    and which of those names are defined in a file that imports @waysnx.
  const declarations = new Map<string, SourceLocation>();
  const wrapsUiKit = new Set<string>();

  for (const file of files) {
    const fileImportsWaysnx = file.imports.some(
      (i) => !i.typeOnly && i.basePackage.startsWith(WAYSNX_SCOPE),
    );
    for (const decl of file.componentDeclarations) {
      if (!declarations.has(decl.name)) declarations.set(decl.name, decl.location);
      if (fileImportsWaysnx) wrapsUiKit.add(decl.name);
    }
  }

  // 2. Walk JSX usages; count a tag as custom only if it resolves to a
  //    project-defined component.
  const custom = new Map<string, CustomAcc>();
  const ensure = (name: string): CustomAcc => {
    let acc = custom.get(name);
    if (!acc) {
      acc = { usages: 0, files: new Set(), wrapsUiKit: false };
      custom.set(name, acc);
    }
    return acc;
  };

  for (const file of files) {
    // Per-file value-import resolution: local name → { relative?, waysnx?, external? }
    const importOrigin = new Map<string, NormalizedImport>();
    for (const imp of file.imports) {
      if (imp.typeOnly) continue; // types are not components
      // last write wins is fine; duplicate locals are rare
      importOrigin.set(imp.local, imp);
    }

    for (const el of file.jsxElements) {
      if (el.intrinsic) continue; // native → native analyzer
      const tag = el.tag;
      if (tag.includes(".") || tag === "<dynamic>") continue; // namespace/dynamic not custom
      if (!/^[A-Z]/.test(tag)) continue; // must be a component (capitalized)

      const imp = importOrigin.get(tag);
      let isCustom = false;

      if (imp) {
        // Imported: custom only if from a LOCAL/RELATIVE path (project component).
        if (isRelative(imp.module)) {
          isCustom = true;
        } else {
          // @waysnx → adoption; other bare package → external, NOT custom.
          isCustom = false;
        }
      } else if (declarations.has(tag)) {
        // Not imported here but declared somewhere in the scanned project.
        isCustom = true;
      } else {
        // Neither imported nor declared in the project → unresolved, NOT custom.
        isCustom = false;
      }

      if (isCustom) {
        const acc = ensure(tag);
        acc.usages += 1;
        acc.files.add(file.file);
        const def = declarations.get(tag);
        if (def && !acc.definition) acc.definition = def;
        if (wrapsUiKit.has(tag)) acc.wrapsUiKit = true;
      }
    }
  }

  return [...custom.entries()]
    .map(([component, acc]) => {
      const report: CustomComponentReport = {
        component,
        usages: acc.usages,
        files: [...acc.files].sort(),
        wrapsUiKit: acc.wrapsUiKit,
      };
      if (acc.definition) report.definition = acc.definition;
      return report;
    })
    .sort((a, b) => b.usages - a.usages || a.component.localeCompare(b.component));
}

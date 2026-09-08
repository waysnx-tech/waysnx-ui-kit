/**
 * Parser (approval doc §5, §9, §10) — Milestone 1.
 *
 * Uses the TypeScript Compiler API to parse each supported source file and
 * produce a NORMALIZED INTERMEDIATE ANALYSIS MODEL (`NormalizedFile`). This is
 * the "Important Architectural Requirement": every file is traversed ONCE here,
 * and later analyzers (M2+) consume this normalized model rather than each
 * re-walking the AST.
 *
 * M1 populates the model's structural facts — imports, exports (incl.
 * re-exports), JSX elements (with intrinsic/native flag), native elements, and
 * component declarations, each with source locations. It does not yet interpret
 * them (that is M2+); it establishes the shared representation.
 *
 * Read-only and best-effort: a file that cannot be read/parsed is recorded as a
 * limitation rather than aborting the run.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import type {
  Limitation,
  NormalizedComponentDeclaration,
  NormalizedExport,
  NormalizedFile,
  NormalizedImport,
  NormalizedJsxElement,
  NormalizedNativeElement,
  NormalizedSideEffectImport,
  SourceLocation,
} from "../types/index.js";

/** Known stylesheet extensions (side-effect import → "style"). */
const STYLE_EXTENSIONS = [".css", ".scss", ".sass", ".less", ".styl"];
/** Known asset extensions (side-effect import → "asset"). */
const ASSET_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico", ".bmp",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".mp4", ".webm", ".mp3", ".wav", ".ogg",
];

/**
 * Normalize a module specifier to its base package.
 *   "@waysnx/ui-diagnostics/react" → "@waysnx/ui-diagnostics"
 *   "@waysnx/ui-core"              → "@waysnx/ui-core"
 *   "react-dom/client"             → "react-dom"
 *   "./local", "../x"              → returned as-is (relative)
 * The ORIGINAL specifier is always preserved separately by the caller.
 */
export function toBasePackage(moduleSpecifier: string): string {
  if (moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/")) {
    return moduleSpecifier;
  }
  const parts = moduleSpecifier.split("/");
  if (moduleSpecifier.startsWith("@")) {
    // scoped: @scope/name[/subpath...]
    return parts.slice(0, 2).join("/");
  }
  // plain: name[/subpath...]
  return parts[0] ?? moduleSpecifier;
}

function classifySideEffect(moduleSpecifier: string): "style" | "asset" | "other" {
  const lower = moduleSpecifier.toLowerCase();
  if (STYLE_EXTENSIONS.some((e) => lower.endsWith(e))) return "style";
  if (ASSET_EXTENSIONS.some((e) => lower.endsWith(e))) return "asset";
  return "other";
}

/** Native/intrinsic elements recognized structurally (lowercase JSX tags). */
const NATIVE_ELEMENTS = new Set<string>([
  "button",
  "input",
  "select",
  "textarea",
  "dialog",
  "table",
  "img",
  "a",
  "form",
  "nav",
  "menu",
  "progress",
  "video",
  "audio",
]);

export interface ParseResult {
  files: NormalizedFile[];
  limitations: Limitation[];
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function scriptKindFor(file: string): ts.ScriptKind {
  switch (path.extname(file).toLowerCase()) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".ts":
      return ts.ScriptKind.TS;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.Unknown;
  }
}

function languageFor(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case ".ts":
      return "typescript";
    case ".tsx":
      return "tsx";
    case ".js":
      return "javascript";
    case ".jsx":
      return "jsx";
    default:
      return "unknown";
  }
}

/** Convert a TS character position into a 1-based line/column SourceLocation. */
export function locationOf(
  sourceFile: ts.SourceFile,
  relPath: string,
  pos: number,
): SourceLocation {
  const lc = sourceFile.getLineAndCharacterOfPosition(pos);
  return { file: relPath, line: lc.line + 1, column: lc.character + 1 };
}

function isCapitalized(name: string): boolean {
  return name.length > 0 && name[0] === name[0]!.toUpperCase();
}

/** Build the normalized model for a single source file (one traversal). */
function normalizeFile(
  file: string,
  relPath: string,
  text: string,
): NormalizedFile {
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKindFor(file),
  );

  const imports: NormalizedImport[] = [];
  const sideEffectImports: NormalizedSideEffectImport[] = [];
  const exports: NormalizedExport[] = [];
  const jsxElements: NormalizedJsxElement[] = [];
  const nativeElements: NormalizedNativeElement[] = [];
  const componentDeclarations: NormalizedComponentDeclaration[] = [];
  const locations: SourceLocation[] = [];

  const loc = (pos: number): SourceLocation => {
    const l = locationOf(sourceFile, relPath, pos);
    locations.push(l);
    return l;
  };

  // ---- top-level imports / exports / component declarations -----------
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const spec = stmt.moduleSpecifier;
      if (!spec || !ts.isStringLiteral(spec)) continue;
      const moduleName = spec.text;
      const base = toBasePackage(moduleName);
      const at = loc(stmt.getStart(sourceFile));

      // Side-effect import: `import '...'` with no import clause.
      if (!stmt.importClause) {
        sideEffectImports.push({
          module: moduleName,
          basePackage: base,
          kind: classifySideEffect(moduleName),
          location: at,
        });
        continue;
      }

      const clause = stmt.importClause;
      // Whole-clause `import type ...`.
      const clauseTypeOnly = clause.isTypeOnly === true;

      if (clause.name) {
        imports.push({
          module: moduleName,
          basePackage: base,
          local: clause.name.text,
          imported: "default",
          kind: "default",
          typeOnly: clauseTypeOnly,
          location: at,
        });
      }
      const bindings = clause.namedBindings;
      if (bindings) {
        if (ts.isNamespaceImport(bindings)) {
          imports.push({
            module: moduleName,
            basePackage: base,
            local: bindings.name.text,
            imported: "*",
            kind: "namespace",
            typeOnly: clauseTypeOnly,
            location: at,
          });
        } else if (ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) {
            const local = el.name.text;
            const importedName = el.propertyName ? el.propertyName.text : local;
            // Per-specifier `import { type X }` OR whole-clause type-only.
            const typeOnly = clauseTypeOnly || el.isTypeOnly === true;
            imports.push({
              module: moduleName,
              basePackage: base,
              local,
              imported: importedName,
              kind: el.propertyName ? "aliased" : "named",
              typeOnly,
              location: at,
            });
          }
        }
      }
      continue;
    }

    if (ts.isExportDeclaration(stmt)) {
      const from =
        stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)
          ? stmt.moduleSpecifier.text
          : undefined;
      const at = loc(stmt.getStart(sourceFile));
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          exports.push({ name: el.name.text, from, reExport: from !== undefined, location: at });
        }
      } else {
        // export * from '...'
        exports.push({ name: "*", from, reExport: from !== undefined, location: at });
      }
      continue;
    }

    // component declarations: Capitalized function / class / const
    if (ts.isFunctionDeclaration(stmt) && stmt.name && isCapitalized(stmt.name.text)) {
      componentDeclarations.push({ name: stmt.name.text, location: loc(stmt.getStart(sourceFile)) });
    } else if (ts.isClassDeclaration(stmt) && stmt.name && isCapitalized(stmt.name.text)) {
      componentDeclarations.push({ name: stmt.name.text, location: loc(stmt.getStart(sourceFile)) });
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && isCapitalized(decl.name.text)) {
          componentDeclarations.push({
            name: decl.name.text,
            location: loc(decl.getStart(sourceFile)),
          });
        }
      }
    }
  }

  // ---- JSX elements (full tree walk) ----------------------------------
  const visit = (node: ts.Node): void => {
    let tagNode: ts.JsxTagNameExpression | undefined;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      tagNode = node.tagName;
    }
    if (tagNode) {
      const at = loc(node.getStart(sourceFile));
      let tag: string;
      if (ts.isIdentifier(tagNode)) {
        tag = tagNode.text;
      } else if (ts.isPropertyAccessExpression(tagNode) && ts.isIdentifier(tagNode.expression)) {
        tag = `${tagNode.expression.text}.${ts.isIdentifier(tagNode.name) ? tagNode.name.text : "?"}`;
      } else {
        tag = "<dynamic>";
      }
      const intrinsic = /^[a-z]/.test(tag) && NATIVE_ELEMENTS.has(tag);
      jsxElements.push({ tag, intrinsic, location: at });
      if (intrinsic) {
        nativeElements.push({ element: tag, location: at });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return {
    file: relPath,
    language: languageFor(file),
    imports,
    sideEffectImports,
    exports,
    jsxElements,
    nativeElements,
    componentDeclarations,
    locations,
  };
}

/**
 * Parse all given source files into normalized models. Read-only; unreadable or
 * unparsable files are recorded as limitations.
 */
export async function parseSourceFiles(
  projectRoot: string,
  files: string[],
): Promise<ParseResult> {
  const parsed: NormalizedFile[] = [];
  const limitations: Limitation[] = [];

  for (const file of files) {
    const relPath = toPosix(path.relative(projectRoot, file));
    let text: string;
    try {
      text = await fs.readFile(file, "utf8");
    } catch (err) {
      limitations.push({
        code: "read-error",
        message: `Could not read source file: ${(err as Error).message}`,
        location: { file: relPath, line: 1, column: 1 },
      });
      continue;
    }
    try {
      parsed.push(normalizeFile(file, relPath, text));
    } catch (err) {
      limitations.push({
        code: "parse-error",
        message: `Failed to parse source file: ${(err as Error).message}`,
        location: { file: relPath, line: 1, column: 1 },
      });
    }
  }

  return { files: parsed, limitations };
}

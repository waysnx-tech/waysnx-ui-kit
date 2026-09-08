/**
 * Native UI analyzer (Milestone 3, spec §10, §19).
 *
 * Consumes the normalized model's `nativeElements` (produced by the parser in a
 * single traversal) and aggregates per-element counts + files. Performs no AST
 * traversal of its own.
 *
 * Framing (spec §10): native elements are reported as FACTS and are never
 * labeled "bad". Whether a native element is a replacement opportunity is an
 * inference for M4 — not decided here.
 */

import type { NativeUiReport, NormalizedFile } from "../../types/index.js";

export function analyzeNative(files: NormalizedFile[]): NativeUiReport[] {
  const byElement = new Map<string, { count: number; files: Set<string> }>();

  for (const file of files) {
    for (const native of file.nativeElements) {
      let acc = byElement.get(native.element);
      if (!acc) {
        acc = { count: 0, files: new Set() };
        byElement.set(native.element, acc);
      }
      acc.count += 1;
      acc.files.add(file.file);
    }
  }

  return [...byElement.entries()]
    .map(([element, acc]) => ({ element, count: acc.count, files: [...acc.files].sort() }))
    .sort((a, b) => b.count - a.count || a.element.localeCompare(b.element));
}

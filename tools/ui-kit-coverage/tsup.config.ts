import { defineConfig } from "tsup";

// The analyzer ships as ESM only. Two entry points:
//   - index.ts     → programmatic API
//   - cli/index.ts → the `ui-kit-coverage` executable (shebang is in the source file)
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cli/index": "src/cli/index.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  dts: true,
  clean: true,
  sourcemap: false,
  splitting: false,
});

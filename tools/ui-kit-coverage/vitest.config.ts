import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Deterministic, read-only analyzer: no globals, no watch in CI.
    globals: false,
  },
});

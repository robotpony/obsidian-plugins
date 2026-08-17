import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    // Extends vitest's own defaults (specifying `exclude` replaces them,
    // it doesn't append) plus two temporary entries, until Phase 1b of
    // PLAN-repo-split.md deletes these directories: without them, vitest's
    // default recursive discovery also picks up warped-reference/'s own
    // test suite, running it under this config's aliases instead of its own.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
      "warped-hugo/**",
      "warped-reference/**",
    ],
  },
  resolve: {
    alias: {
      // Stub out Obsidian and the shared module — the tested functions don't use them
      "obsidian": path.resolve(__dirname, "src/__tests__/stubs/obsidian.ts"),
      "./shared": path.resolve(__dirname, "src/__tests__/stubs/shared.ts"),
    },
  },
});

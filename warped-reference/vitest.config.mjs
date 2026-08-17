import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      // Stub out Obsidian — the real npm package ships only .d.ts files, no
      // runtime module, so Vite can't resolve it on its own. Individual test
      // files still vi.mock("obsidian", ...) for behaviour.
      obsidian: path.resolve(__dirname, "src/__tests__/stubs/obsidian.ts"),
    },
  },
});

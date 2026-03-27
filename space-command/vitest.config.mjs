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
      // Stub out Obsidian and the shared module — the tested functions don't use them
      "obsidian": path.resolve(__dirname, "src/__tests__/stubs/obsidian.ts"),
      "../../shared": path.resolve(__dirname, "src/__tests__/stubs/shared.ts"),
    },
  },
});

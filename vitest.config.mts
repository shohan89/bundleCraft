import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors tsconfig.json's "@/*": ["./*"] path alias so test files can use
// the same imports as application code.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    // Dashboard component tests need a DOM; the handful of pure Node
    // tests (crypto/session/oauth/integration) opt out per-file via a
    // `// @vitest-environment node` docblock instead of a path glob,
    // which doesn't match reliably across OS path separators.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});

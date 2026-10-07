import react from "@vitejs/plugin-react";
import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

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
    // The Function's wasm fixture run builds the module and shells out to
    // function-runner; it has its own command (npm run test:function).
    exclude: [...configDefaults.exclude, "extensions/**/tests/**"],
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Integration tests run against the live (remote) database; round trips vary widely.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

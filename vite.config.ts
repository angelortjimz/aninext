import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Deliberately not enabled: the suite imports `describe`/`it` from
    // "vitest" explicitly, and each component test opts into jsdom with a
    // `@vitest-environment` docblock so the pure-logic suite stays in node.
    globals: false,
    setupFiles: ["src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

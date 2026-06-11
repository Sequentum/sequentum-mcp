import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Builds dist/ once before the suite so the native-ESM smoke test
    // (src/smoke.test.ts) has current built output on every vitest invocation.
    globalSetup: ["./vitest.global-setup.ts"],
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});

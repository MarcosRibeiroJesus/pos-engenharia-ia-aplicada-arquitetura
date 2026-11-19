import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/handlers/**", "lib/infra/aws/**"],
      thresholds: { lines: 80, branches: 70 },
    },
  },
});

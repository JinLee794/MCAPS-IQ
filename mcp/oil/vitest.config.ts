import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["bench/**/*.bench.ts"],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    reporters: ["verbose"],
  },
});

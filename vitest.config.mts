import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests (pure logic) and database tests (migrations + row-level security
// on an in-memory Postgres). Browser tests live in e2e/ and run with Playwright.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000, // starting an in-memory Postgres and running migrations takes a few seconds
  },
});

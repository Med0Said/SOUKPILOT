import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src"),
      // Next.js enforces "server-only" at build time; in unit tests it is a no-op.
      "server-only": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "tests/stubs/server-only.ts"),
    },
  },
  test: {
    // `npm run test:coverage` — thresholds and their reasons: CONSTRAINTS.md.
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts", "src/lib/supabase/**", "src/lib/server/**", "src/lib/auth/session.ts", "src/lib/auth/organization.ts"],
      reporter: ["text-summary", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      // Ratchet: measured 2026-10-18 minus 0.5 point, rounded down. Raise when
      // coverage improves; never lower to make a change pass (CONSTRAINTS.md).
      thresholds: {
        lines: 89,
        statements: 87,
        branches: 82,
        functions: 80,
        "src/lib/domain/**": { lines: 94, statements: 92, branches: 84, functions: 87 },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          // Each file boots its own embedded Postgres and applies all migrations.
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});

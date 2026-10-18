import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // End-to-end build output and Playwright artefacts.
    ".next-e2e/**",
    "test-results/**",
    "playwright-report/**",
    // Generated coverage report (npm run test:coverage).
    "coverage/**",
  ]),
]);

export default eslintConfig;

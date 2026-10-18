#!/usr/bin/env node
/**
 * CSP/console guard on every E2E spec (CONSTRAINTS.md): each e2e/*.spec.ts must
 * take `test` from ./fixtures (which fails a test on any console error, page
 * exception or Content-Security-Policy violation), never straight from
 * @playwright/test. Exit 0 = ok, 1 = unguarded spec, 2 = could not run.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "e2e");
try {
  const specs = readdirSync(dir).filter((f) => f.endsWith(".spec.ts"));
  const unguarded = specs.filter((f) => {
    const text = readFileSync(path.join(dir, f), "utf8");
    const fromFixtures = /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*["']\.\/fixtures["']/.test(text);
    const fromPlaywright = /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*["']@playwright\/test["']/.test(text);
    return !fromFixtures || fromPlaywright;
  });
  console.log(`e2e-guard: ${specs.length - unguarded.length}/${specs.length} specs use the console/CSP guard`);
  if (unguarded.length) {
    console.error(`e2e-guard: import { test } from "./fixtures" in: ${unguarded.join(", ")}`);
    process.exit(1);
  }
} catch (error) {
  console.error(`e2e-guard: could not run: ${error.message}`);
  process.exit(2);
}

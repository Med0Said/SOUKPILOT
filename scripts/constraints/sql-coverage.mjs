#!/usr/bin/env node
/**
 * SQL function coverage (CONSTRAINTS.md): every function the Data API exposes
 * (created in schema `public` by a migration) must be called by at least one
 * database test in tests/db/. PL/pgSQL has no line-coverage tool we can run
 * on PGlite and Supabase alike, so this is the measurable proxy: no public
 * function ships without a test that executes it.
 * A function may be listed in the Exceptions table of CONSTRAINTS.md
 * (Rule `sql-coverage`, Path `public.<name>`) until its expiry date; an
 * expired exception counts as uncovered.
 * Exit 0 = all covered, 1 = uncovered functions, 2 = could not run.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
try {
  const migrations = path.join(root, "supabase", "migrations");
  const tests = path.join(root, "tests", "db");
  const sql = readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(path.join(migrations, f), "utf8"))
    .join("\n");
  const names = [...new Set([...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi)].map((m) => m[1]))].sort();
  const testText = readdirSync(tests)
    .filter((f) => f.endsWith(".test.ts"))
    .map((f) => readFileSync(path.join(tests, f), "utf8"))
    .join("\n");

  // | E1 | sql-coverage | `public.fn` | reason | owner | 2026-11-30 |
  const today = new Date().toISOString().slice(0, 10);
  const excepted = new Map(
    readFileSync(path.join(root, "CONSTRAINTS.md"), "utf8")
      .split("\n")
      .map((line) => line.split("|").map((cell) => cell.trim().replaceAll("`", "")))
      .filter((cells) => /^E\d+$/.test(cells[1] ?? "") && cells[2] === "sql-coverage")
      .map((cells) => [cells[3].replace(/^public\./, ""), cells[cells.length - 2]]),
  );

  const untested = names.filter((n) => !new RegExp(String.raw`\b${n}\s*\(`).test(testText));
  for (const n of untested.filter((x) => excepted.has(x))) {
    const expires = excepted.get(n);
    console.log(`sql-coverage: ${n} is a tracked exception until ${expires}${expires < today ? " (EXPIRED)" : ""}`);
  }
  const uncovered = untested.filter((n) => !excepted.has(n) || excepted.get(n) < today);
  console.log(`sql-coverage: ${names.length - untested.length}/${names.length} public functions called by a DB test`);
  if (uncovered.length) {
    console.error(`sql-coverage: not called by any test in tests/db/: ${uncovered.join(", ")}`);
    process.exit(1);
  }
} catch (error) {
  console.error(`sql-coverage: could not run: ${error.message}`);
  process.exit(2);
}

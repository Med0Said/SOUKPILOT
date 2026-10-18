#!/usr/bin/env node
/**
 * Client JavaScript budget (CONSTRAINTS.md), measured on a production build:
 * gzip size of every chunk in <distDir>/static/chunks. The numbers below
 * mirror CONSTRAINTS.md, which is the source of truth.
 * Usage: node scripts/constraints/bundle-budget.mjs [distDir]   (default .next)
 * Exit 0 = within budget, 1 = over, 2 = could not run (no build).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const TOTAL_GZIP_MAX = 352_000; // bytes, all client chunks (each gzipped on its own, as served)
const CHUNK_GZIP_MAX = 75_000; // bytes, largest single chunk

const dist = process.argv[2] ?? ".next";
const chunks = path.join(dist, "static", "chunks");
let files;
try {
  if (!statSync(chunks).isDirectory()) throw new Error("not a directory");
  files = readdirSync(chunks, { recursive: true }).filter((f) => String(f).endsWith(".js")).map(String);
} catch {
  console.error(`bundle-budget: no build found in ${chunks} (run a production build first)`);
  process.exit(2);
}

const sizes = files.map((f) => ({ f, gz: gzipSync(readFileSync(path.join(chunks, f)), { level: 9 }).length }));
const total = sizes.reduce((s, x) => s + x.gz, 0);
const largest = sizes.reduce((m, x) => (x.gz > m.gz ? x : m), { f: "-", gz: 0 });
console.log(`bundle-budget: ${files.length} chunks, total ${total} B gzip (max ${TOTAL_GZIP_MAX}), largest ${largest.gz} B ${largest.f} (max ${CHUNK_GZIP_MAX})`);
const over = [];
if (total > TOTAL_GZIP_MAX) over.push(`total ${total} > ${TOTAL_GZIP_MAX}`);
if (largest.gz > CHUNK_GZIP_MAX) over.push(`largest chunk ${largest.gz} > ${CHUNK_GZIP_MAX}`);
if (over.length) {
  console.error(`bundle-budget: over budget: ${over.join("; ")}`);
  process.exit(1);
}

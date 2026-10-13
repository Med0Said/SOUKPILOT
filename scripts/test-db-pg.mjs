#!/usr/bin/env node
/**
 * Runs the database test suite against a REAL PostgreSQL server.
 *
 * - If TEST_DATABASE_URL is set, uses that server (a superuser connection to a
 *   maintenance database, e.g. postgres://postgres@localhost:5432/postgres).
 *   Each test file creates and drops its own database.
 * - Otherwise starts a throwaway local cluster in .pgtest/ (trust auth,
 *   localhost only, port 54329) using the PostgreSQL binaries on PATH or
 *   PG_BIN (e.g. "C:\Program Files\PostgreSQL\17\bin"), and stops it after.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const bin = (name) => (process.env.PG_BIN ? path.join(process.env.PG_BIN, name) : name);
const PORT = process.env.PGTEST_PORT ?? "54329";

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...options });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

let url = process.env.TEST_DATABASE_URL;
let dataDir;

if (!url) {
  const base = path.join(root, ".pgtest");
  dataDir = path.join(base, "data");
  mkdirSync(base, { recursive: true });
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    const code = run(bin("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"]);
    if (code !== 0) process.exit(code);
  }
  const code = run(bin("pg_ctl"), [
    "-D", dataDir, "-l", path.join(base, "server.log"), "-w",
    "-o", `-p ${PORT} -c listen_addresses=localhost -c max_connections=200`,
    "start",
  ]);
  if (code !== 0) process.exit(code);
  url = `postgres://postgres@localhost:${PORT}/postgres`;
}

let exitCode = 1;
try {
  // API roles are cluster-wide; create them once before test files run in parallel.
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  for (const [role, extra] of [["anon", ""], ["authenticated", ""], ["service_role", " bypassrls"]]) {
    const { rowCount } = await client.query("select 1 from pg_roles where rolname = $1", [role]);
    if (!rowCount) await client.query(`create role ${role} nologin noinherit${extra}`);
  }
  const { rows } = await client.query("show server_version");
  console.log(`Running DB tests on PostgreSQL ${rows[0].server_version}`);
  await client.end();

  exitCode = run(process.execPath, [path.join(root, "node_modules", "vitest", "vitest.mjs"), "run", "--project", "db"], {
    env: { ...process.env, TEST_DATABASE_URL: url },
    cwd: root,
  });
} finally {
  if (dataDir) run(bin("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"]);
}
process.exit(exitCode);

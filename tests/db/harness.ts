/**
 * Database test harness.
 *
 * Two interchangeable backends run the SAME migrations and tests:
 *   - PGlite (default): embedded PostgreSQL 17 in-process, no services needed.
 *   - Real PostgreSQL server: when TEST_DATABASE_URL is set (see
 *     scripts/test-db-pg.mjs). Each test file gets its own fresh database.
 *     Required for concurrency tests (several simultaneous connections).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const SHIM = path.join(HERE, "supabase-shim.sql");

export type TestUser = { id: string; email: string };
export type Role = "owner" | "manager" | "cashier";

export interface Queryable {
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
  exec(sql: string): Promise<unknown>;
}

export interface TestDb extends Queryable {
  readonly kind: "pglite" | "postgres";
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const usingRealPostgres = Boolean(process.env.TEST_DATABASE_URL);

// int8 (bigint) as JS number on both backends. Millime amounts stay far below 2^53.
const INT8_OID = 20;
pg.types.setTypeParser(INT8_OID, (value) => Number(value));

async function createPgliteDb(): Promise<TestDb> {
  const db = new PGlite({ extensions: { pg_trgm }, parsers: { [INT8_OID]: (v: string) => Number(v) } });
  return {
    kind: "pglite",
    query: (sql, params) => db.query(sql, params),
    exec: (sql) => db.exec(sql),
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          query: (sql, params) => tx.query(sql, params),
          exec: (sql) => tx.exec(sql),
        }),
      ),
    close: () => db.close(),
  };
}

async function createPostgresDb(adminUrl: string): Promise<TestDb> {
  const name = `sp_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 10 });

  const wrap = (client: pg.Pool | pg.PoolClient): Queryable => ({
    query: async (sql, params) => ({ rows: (await client.query(sql, params)).rows }),
    exec: (sql) => client.query(sql),
  });

  return {
    kind: "postgres",
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn(wrap(client));
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
      const cleanup = new pg.Client({ connectionString: adminUrl });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    },
  };
}

/**
 * Fresh database with the Supabase shim and every migration in
 * supabase/migrations applied in filename order (the order Supabase uses).
 */
export async function createTestDb(): Promise<TestDb> {
  const db = usingRealPostgres
    ? await createPostgresDb(process.env.TEST_DATABASE_URL as string)
    : await createPgliteDb();
  await db.exec(readFileSync(SHIM, "utf8"));
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

/** Inserts an auth user as the platform (superuser) would. */
export async function createUser(
  db: Queryable,
  email: string,
  options: { confirmed?: boolean; fullName?: string } = {},
): Promise<TestUser> {
  const { confirmed = true, fullName = "" } = options;
  const result = await db.query<{ id: string }>(
    `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
     values ($1, case when $2::boolean then now() else null end, jsonb_build_object('full_name', $3::text))
     returning id`,
    [email, confirmed, fullName],
  );
  return { id: result.rows[0].id, email };
}

async function setClaims(tx: Queryable, role: "authenticated" | "anon", claims: Record<string, unknown>) {
  await tx.exec(`set local role ${role}`);
  await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
}

/**
 * Runs `fn` inside a transaction as the `authenticated` API role with the
 * user's JWT claims, exactly like PostgREST does for a signed-in request.
 * RLS and GRANTs apply; nothing is mocked.
 */
export async function asUser<T>(db: TestDb, user: TestUser, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await setClaims(tx, "authenticated", { sub: user.id, role: "authenticated", email: user.email });
    return fn(tx);
  });
}

/** Same as asUser but as the unauthenticated `anon` role. */
export async function asAnon<T>(db: TestDb, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await setClaims(tx, "anon", { role: "anon" });
    return fn(tx);
  });
}

/** Convenience: run one query as a user and return its rows. */
export async function queryAs<R>(db: TestDb, user: TestUser, sql: string, params: unknown[] = []): Promise<R[]> {
  return asUser(db, user, async (tx) => (await tx.query<R>(sql, params)).rows);
}

/** Creates an organization through the public API function as `owner`. */
export async function createOrganization(db: TestDb, owner: TestUser, name: string): Promise<string> {
  const rows = await queryAs<{ id: string }>(db, owner, "select public.create_organization($1) as id", [name]);
  return rows[0].id;
}

/** Adds a member directly as superuser (test setup only). */
export async function addMember(db: Queryable, organizationId: string, user: TestUser, role: Role): Promise<void> {
  await db.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, $3)", [
    organizationId,
    user.id,
    role,
  ]);
}

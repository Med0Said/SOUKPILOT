import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const SHIM = path.join(HERE, "supabase-shim.sql");

export type TestUser = { id: string; email: string };

/**
 * Fresh embedded PostgreSQL with the Supabase shim and every migration in
 * supabase/migrations applied in filename order (the order Supabase uses).
 */
export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
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
  db: PGlite,
  email: string,
  options: { confirmed?: boolean; fullName?: string } = {},
): Promise<TestUser> {
  const { confirmed = true, fullName = "" } = options;
  const result = await db.query<{ id: string }>(
    `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
     values ($1, case when $2 then now() else null end, jsonb_build_object('full_name', $3::text))
     returning id`,
    [email, confirmed, fullName],
  );
  return { id: result.rows[0].id, email };
}

/**
 * Runs `fn` inside a transaction as the `authenticated` API role with the
 * user's JWT claims, exactly like PostgREST does for a signed-in request.
 * RLS and GRANTs apply; nothing is mocked.
 */
export async function asUser<T>(
  db: PGlite,
  user: TestUser,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: user.id, role: "authenticated", email: user.email }),
    ]);
    return fn(tx);
  });
}

/** Same as asUser but as the unauthenticated `anon` role. */
export async function asAnon<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role: "anon" }),
    ]);
    return fn(tx);
  });
}

/** Convenience: run one query as a user and return its rows. */
export async function queryAs<R>(
  db: PGlite,
  user: TestUser,
  sql: string,
  params: unknown[] = [],
): Promise<R[]> {
  return asUser(db, user, async (tx) => (await tx.query<R>(sql, params)).rows);
}

/** Creates an organization through the public API function as `owner`. */
export async function createOrganization(
  db: PGlite,
  owner: TestUser,
  name: string,
): Promise<string> {
  const rows = await queryAs<{ id: string }>(db, owner, "select public.create_organization($1) as id", [
    name,
  ]);
  return rows[0].id;
}

/** Adds a member directly as superuser (test setup only). */
export async function addMember(
  db: PGlite,
  organizationId: string,
  user: TestUser,
  role: "owner" | "manager" | "cashier",
): Promise<void> {
  await db.query(
    "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, $3)",
    [organizationId, user.id, role],
  );
}

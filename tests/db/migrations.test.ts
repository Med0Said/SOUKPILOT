import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb } from "./harness";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

describe("migrations", () => {
  it("enable RLS on every table in the public schema", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
       order by 1`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("give the anon role no privileges on public tables", async () => {
    const { rows } = await db.query<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type
       from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'anon'`,
    );
    expect(rows).toEqual([]);
  });

  it("do not let anon execute any public function", async () => {
    const { rows } = await db.query<{ proname: string }>(
      `select p.proname
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
       order by 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it("declare every SECURITY DEFINER function with an empty search_path", async () => {
    const { rows } = await db.query<{ fn: string }>(
      `select n.nspname || '.' || p.proname as fn
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosecdef
         and not coalesce(p.proconfig @> array['search_path=""'], false)
       order by 1`,
    );
    expect(rows.map((r) => r.fn)).toEqual([]);
  });

  it("keep audit-writing helpers out of reach of API roles", async () => {
    const { rows } = await db.query<{ ok: boolean }>(
      `select has_function_privilege('authenticated', 'private.write_audit(uuid,text,text,uuid,jsonb)', 'execute') as ok`,
    );
    expect(rows[0].ok).toBe(false);
  });
});

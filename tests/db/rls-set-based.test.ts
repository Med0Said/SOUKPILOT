/**
 * Audit finding P2: SELECT policies evaluated a membership function once per
 * row (≈5 µs each; 250 ms to count 50k sales). They now compare
 * organization_id with the caller's organizations computed once per query.
 *
 * 1. Structure: no SELECT policy calls is_org_member()/has_org_role() per row.
 * 2. Semantics: for every converted table and every kind of user, the rows
 *    visible through RLS are exactly the rows the ORIGINAL predicate allows
 *    (evaluated by the superuser for the same identity).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createOrganization, createTestDb, createUser, queryAs, type Queryable, type TestDb, type TestUser } from "./harness";

let db: TestDb;
const users: Record<"owner" | "manager" | "cashier" | "outsider" | "otherOwner", TestUser> = {} as never;

// Table → original predicate ("member" = is_org_member, "manager" = owner/manager role).
const TABLES: Record<string, "member" | "manager"> = {
  audit_logs: "manager",
  catalog_import_batches: "manager",
  categories: "member",
  customers: "member",
  locations: "member",
  organization_integrations: "member",
  organization_invitations: "manager",
  organization_members: "member",
  organizations: "member",
  payment_methods: "member",
  product_variant_costs: "manager",
  product_variants: "member",
  products: "member",
  purchase_order_items: "manager",
  purchase_orders: "manager",
  sale_item_costs: "manager",
  sale_items: "member",
  sale_payments: "member",
  sale_return_items: "member",
  sale_returns: "member",
  sales: "member",
  stock_adjustment_lines: "member",
  stock_adjustments: "member",
  stock_count_items: "member",
  stock_counts: "member",
  stock_levels: "member",
  stock_movements: "member",
  stock_opening_costs: "manager",
  stock_receipt_lines: "manager",
  stock_receipts: "manager",
  stock_transfer_lines: "member",
  stock_transfers: "member",
  supplier_payments: "manager",
  suppliers: "manager",
};

async function seed(owner: TestUser, name: string) {
  const org = await createOrganization(db, owner, name);
  const location = (await db.query<{ id: string }>("select id from public.locations where organization_id = $1", [org])).rows[0].id;
  const cash = (await db.query<{ id: string }>("select id from public.payment_methods where organization_id = $1 and kind = 'cash'", [org])).rows[0].id;
  const [{ id: product }] = await queryAs<{ id: string }>(db, owner, "select public.create_product($1, $2::jsonb) as id", [
    org,
    JSON.stringify({ name: `Article ${name}`, option_names: [], variants: [{ option_values: [], price_millimes: 10_000, cost_millimes: 4_000 }] }),
  ]);
  const variant = (await db.query<{ id: string }>("select id from public.product_variants where product_id = $1", [product])).rows[0].id;
  await queryAs(db, owner, "insert into public.categories (organization_id, name) values ($1, 'Catégorie')", [org]);
  const [{ id: supplier }] = await queryAs<{ id: string }>(db, owner, "insert into public.suppliers (organization_id, name) values ($1, 'Fournisseur') returning id", [org]);
  const [{ id: customer }] = await queryAs<{ id: string }>(db, owner, "insert into public.customers (organization_id, name) values ($1, 'Client') returning id", [org]);
  await queryAs(db, owner, "select public.record_opening_stock($1, $2, $3::jsonb, $4)", [org, location, JSON.stringify([{ variant_id: variant, quantity: 10, unit_cost_millimes: 4_000 }]), randomUUID()]);
  const [{ id: sale }] = await queryAs<{ id: string }>(db, owner, "select public.finalize_sale($1, null, $2, $3, $4::jsonb, 0, null, $5::jsonb, $6) as id", [
    org,
    location,
    customer,
    JSON.stringify([{ variant_id: variant, quantity: 2 }]),
    JSON.stringify([{ method_id: cash, amount_millimes: 20_000 }]),
    randomUUID(),
  ]);
  const item = (await db.query<{ id: string }>("select id from public.sale_items where sale_id = $1", [sale])).rows[0].id;
  await queryAs(db, owner, "select public.create_sale_return($1, $2::jsonb, 'Taille trop petite', $3, 5000, $4)", [
    sale,
    JSON.stringify([{ sale_item_id: item, quantity: 1, restock: true }]),
    cash,
    randomUUID(),
  ]);
  const [{ id: po }] = await queryAs<{ id: string }>(db, owner, "select public.save_purchase_order($1, null, $2, $3, null, null, null, $4::jsonb) as id", [
    org,
    supplier,
    location,
    JSON.stringify([{ variant_id: variant, quantity: 3, unit_cost_millimes: 4_000 }]),
  ]);
  await queryAs(db, owner, "select public.place_purchase_order($1)", [po]);
  await queryAs(db, owner, "select public.set_integration_enabled($1, 'exchange_rates', true)", [org]);
  return org;
}

/** Rows the original predicate allows for `user`, evaluated without RLS (superuser). */
async function expectedCount(tx: Queryable, table: string, kind: "member" | "manager", user: TestUser) {
  await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user.id, role: "authenticated" })]);
  const column = table === "organizations" ? "id" : "organization_id";
  const predicate =
    kind === "member"
      ? `private.is_org_member(${column})`
      : `private.has_org_role(${column}, array['owner', 'manager']::public.org_role[])`;
  const r = await tx.query<{ n: number }>(`select count(*)::int as n from public.${table} where ${predicate}`);
  return r.rows[0].n;
}

beforeAll(async () => {
  db = await createTestDb();
  users.owner = await createUser(db, "owner@rls.tn");
  users.manager = await createUser(db, "manager@rls.tn");
  users.cashier = await createUser(db, "cashier@rls.tn");
  users.outsider = await createUser(db, "outsider@rls.tn");
  users.otherOwner = await createUser(db, "owner@autre-rls.tn");
  const org = await seed(users.owner, "Boutique RLS");
  await seed(users.otherOwner, "Autre RLS");
  await addMember(db, org, users.manager, "manager");
  await addMember(db, org, users.cashier, "cashier");
  await queryAs(db, users.owner, "select public.create_invitation($1, 'invite@rls.tn', 'cashier')", [org]);
});

afterAll(async () => {
  await db.close();
});

describe("SELECT policies are set-based (P2)", () => {
  it("no SELECT policy evaluates a membership function per row", async () => {
    const rows = await db.query<{ tablename: string; qual: string }>(
      `select tablename, qual from pg_policies
       where schemaname = 'public' and cmd = 'SELECT' and qual ~ '(is_org_member|has_org_role)\\('`,
    );
    expect(rows.rows).toEqual([]);
  });
});

describe("visibility is unchanged for every converted table and every kind of user", () => {
  it("the seed populated the tables that matter", async () => {
    const empty: string[] = [];
    for (const table of ["sales", "sale_items", "sale_item_costs", "sale_returns", "stock_movements", "purchase_orders", "suppliers", "audit_logs", "organization_invitations", "organization_integrations"]) {
      const r = await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`);
      if (r.rows[0].n === 0) empty.push(table);
    }
    expect(empty).toEqual([]);
  });

  for (const who of ["owner", "manager", "cashier", "outsider", "otherOwner"] as const) {
    it(`${who}: same rows as the original predicate`, async () => {
      const user = users[who];
      const mismatches: string[] = [];
      for (const [table, kind] of Object.entries(TABLES)) {
        const visible = (await queryAs<{ n: number }>(db, user, `select count(*)::int as n from public.${table}`))[0].n;
        const expected = await db.transaction((tx) => expectedCount(tx, table, kind, user));
        if (visible !== expected) mismatches.push(`${table}: visible ${visible}, expected ${expected}`);
      }
      expect(mismatches).toEqual([]);
    });
  }
});

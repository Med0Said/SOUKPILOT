/**
 * Phase 3 reports: per-day figures equal sales_daily_summary for every day,
 * margins exclude unknown costs (reported separately), returns are counted on
 * their own day, product/category grouping, payments per method, the
 * owner/manager restriction and the period guard.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createOrganization, createTestDb, createUser, queryAs, type TestDb, type TestUser } from "./harness";

let db: TestDb;
let owner: TestUser;
let manager: TestUser;
let cashier: TestUser;
let otherOwner: TestUser;
let org: string;
let location: string;
let cash: string;
let shirt: string; // 25 000, cost 12 000, category Vêtements
let socks: string; // 2 000, unknown cost, no category
let customer: string;

async function variant(name: string, price: number, extra: Record<string, unknown> = {}) {
  const [{ id }] = await queryAs<{ id: string }>(db, owner, "select public.create_product($1, $2::jsonb) as id", [
    org,
    JSON.stringify({ name, option_names: [], variants: [{ option_values: [], price_millimes: price }], ...extra }),
  ]);
  return (await db.query<{ id: string }>("select id from public.product_variants where product_id = $1", [id])).rows[0].id;
}

/** Test setup only: moves rows in time, bypassing the immutability triggers. */
async function moveInTime(sql: string, params: unknown[]) {
  await db.transaction(async (tx) => {
    await tx.exec("set local session_replication_role = replica");
    await tx.query(sql, params);
  });
}

async function sell(lines: { variant_id: string; quantity: number }[], paid: number, at: string, customerId: string | null = null) {
  const [{ id }] = await queryAs<{ id: string }>(
    db,
    cashier,
    "select public.finalize_sale($1, null, $2, $3, $4::jsonb, 0, null, $5::jsonb, $6) as id",
    [org, location, customerId, JSON.stringify(lines), JSON.stringify(paid ? [{ method_id: cash, amount_millimes: paid }] : []), randomUUID()],
  );
  await moveInTime("update public.sales set finalized_at = $2, created_at = $2 where id = $1", [id, at]);
  await moveInTime("update public.sale_payments set created_at = $2 where sale_id = $1", [id, at]);
  return id;
}

const DAYS = ["2026-03-10", "2026-03-11", "2026-03-12"];

beforeAll(async () => {
  db = await createTestDb();
  owner = await createUser(db, "owner@rapports.tn");
  manager = await createUser(db, "manager@rapports.tn");
  cashier = await createUser(db, "cashier@rapports.tn");
  otherOwner = await createUser(db, "owner@autre-rapports.tn");
  org = await createOrganization(db, owner, "Boutique Rapports");
  await createOrganization(db, otherOwner, "Autre");
  await addMember(db, org, manager, "manager");
  await addMember(db, org, cashier, "cashier");
  location = (await db.query<{ id: string }>("select id from public.locations where organization_id = $1", [org])).rows[0].id;
  cash = (await db.query<{ id: string }>("select id from public.payment_methods where organization_id = $1 and kind = 'cash'", [org])).rows[0].id;

  const [{ id: category }] = await queryAs<{ id: string }>(
    db,
    owner,
    "insert into public.categories (organization_id, name) values ($1, 'Vêtements') returning id",
    [org],
  );
  shirt = await variant("Chemise", 25_000, { category_id: category });
  await db.query("update public.product_variant_costs set cost_millimes = 12000 where variant_id = $1", [shirt]);
  socks = await variant("Chaussettes", 2_000);
  [{ id: customer }] = await queryAs<{ id: string }>(db, owner, "insert into public.customers (organization_id, name) values ($1, 'Leïla') returning id", [org]);

  await queryAs(db, owner, "select public.record_opening_stock($1, $2, $3::jsonb, $4)", [
    org,
    location,
    JSON.stringify([
      { variant_id: shirt, quantity: 20 },
      { variant_id: socks, quantity: 20 },
    ]),
    randomUUID(),
  ]);

  // Day 1 (10 March, 11:00 Tunis): 2 shirts + 3 socks, paid cash.
  const first = await sell(
    [
      { variant_id: shirt, quantity: 2 },
      { variant_id: socks, quantity: 3 },
    ],
    56_000,
    "2026-03-10T10:00:00Z",
  );
  // Day 2 (11 March): one shirt of the first sale comes back, refunded in cash.
  const shirtLine = (await db.query<{ id: string }>("select id from public.sale_items where sale_id = $1 and variant_id = $2", [first, shirt])).rows[0].id;
  const [{ id: returnId }] = await queryAs<{ id: string }>(
    db,
    owner,
    "select public.create_sale_return($1, $2::jsonb, 'Taille trop petite', $3, 25000, $4) as id",
    [first, JSON.stringify([{ sale_item_id: shirtLine, quantity: 1, restock: true }]), cash, randomUUID()],
  );
  await moveInTime("update public.sale_returns set created_at = '2026-03-11T09:00:00Z' where id = $1", [returnId]);
  await moveInTime("update public.sale_payments set created_at = '2026-03-11T09:00:00Z' where return_id = $1", [returnId]);
  // Day 3: 23:30 UTC on the 11th is 00:30 on the 12th in Tunis. On credit.
  await sell([{ variant_id: shirt, quantity: 1 }], 0, "2026-03-11T23:30:00Z", customer);
});

afterAll(async () => {
  await db.close();
});

type DayRow = {
  day: string;
  sales_count: number;
  gross_millimes: number;
  discount_millimes: number;
  sales_total_millimes: number;
  returns_count: number;
  returns_millimes: number;
  net_sales_millimes: number;
  credit_given_millimes: number;
  cost_millimes: number;
  margin_millimes: number;
  revenue_without_cost_millimes: number;
};

const byDay = (user: TestUser, from = DAYS[0], to = DAYS[2]) =>
  queryAs<DayRow>(db, user, "select * from public.report_sales_by_day($1, $2::date, $3::date)", [org, from, to]);


describe("report_sales_by_day", () => {
  it("matches sales_daily_summary for every day of the period", async () => {
    const rows = await byDay(manager);
    expect(rows.map((r) => r.day)).toEqual(DAYS);
    for (const row of rows) {
      const [{ s }] = await queryAs<{ s: Record<string, number> }>(db, manager, "select public.sales_daily_summary($1, $2::date) as s", [
        org,
        row.day,
      ]);
      expect({
        sales_count: row.sales_count,
        gross_millimes: row.gross_millimes,
        discount_millimes: row.discount_millimes,
        sales_total_millimes: row.sales_total_millimes,
        returns_count: row.returns_count,
        returns_millimes: row.returns_millimes,
        net_sales_millimes: row.net_sales_millimes,
        credit_given_millimes: row.credit_given_millimes,
      }).toEqual({
        sales_count: s.sales_count,
        gross_millimes: s.gross_millimes,
        discount_millimes: s.discount_millimes,
        sales_total_millimes: s.sales_total_millimes,
        returns_count: s.returns_count,
        returns_millimes: s.returns_millimes,
        net_sales_millimes: s.net_sales_millimes,
        credit_given_millimes: s.credit_given_millimes,
      });
    }
  });

  it("estimates the margin on known costs only and reports the rest separately", async () => {
    const rows = await byDay(owner);
    expect(rows.map((r) => [r.net_sales_millimes, r.cost_millimes, r.margin_millimes, r.revenue_without_cost_millimes])).toEqual([
      [56_000, 24_000, 26_000, 6_000], // 2 × (25 000 − 12 000); socks have no cost
      [-25_000, -12_000, -13_000, 0], // the returned shirt, on the day of the return
      [25_000, 12_000, 13_000, 0], // 00:30 local time → the 12th, not the 11th
    ]);
    for (const r of rows) {
      expect(r.margin_millimes).toBe(r.net_sales_millimes - r.revenue_without_cost_millimes - r.cost_millimes);
    }
    expect(rows[2].credit_given_millimes).toBe(25_000);
  });

  it("includes days without sales", async () => {
    const rows = await byDay(owner, "2026-03-01", "2026-03-31");
    expect(rows).toHaveLength(31);
    expect(rows.reduce((s, r) => s + r.net_sales_millimes, 0)).toBe(56_000);
  });
});

describe("report_sales_by_product", () => {
  type Row = { label: string | null; quantity: number; revenue_millimes: number; cost_millimes: number; margin_millimes: number; revenue_without_cost_millimes: number; total_count: number };
  const report = (group: string, sort = "revenue") =>
    queryAs<Row>(
      db,
      owner,
      "select label, quantity, revenue_millimes, cost_millimes, margin_millimes, revenue_without_cost_millimes, total_count from public.report_sales_by_product($1, $2::date, $3::date, $4, $5)",
      [org, DAYS[0], DAYS[2], group, sort],
    );

  it("by product: sales of the period minus their returns", async () => {
    expect(await report("product")).toEqual([
      { label: "Chemise", quantity: 2, revenue_millimes: 50_000, cost_millimes: 24_000, margin_millimes: 26_000, revenue_without_cost_millimes: 0, total_count: 2 },
      { label: "Chaussettes", quantity: 3, revenue_millimes: 6_000, cost_millimes: 0, margin_millimes: 0, revenue_without_cost_millimes: 6_000, total_count: 2 },
    ]);
    expect((await report("product", "quantity")).map((r) => r.label)).toEqual(["Chaussettes", "Chemise"]);
  });

  it("by category (uncategorized grouped under no label)", async () => {
    expect((await report("category")).map((r) => [r.label, r.revenue_millimes])).toEqual([
      ["Vêtements", 50_000],
      [null, 6_000],
    ]);
  });
});

describe("report_payments_by_method", () => {
  it("equals the sum of the daily summaries' payments", async () => {
    const rows = await queryAs<{ label: string; received_millimes: number; refunded_millimes: number; net_millimes: number }>(
      db,
      owner,
      "select label, received_millimes, refunded_millimes, net_millimes from public.report_payments_by_method($1, $2::date, $3::date)",
      [org, DAYS[0], DAYS[2]],
    );
    expect(rows).toEqual([{ label: "Espèces", received_millimes: 56_000, refunded_millimes: 25_000, net_millimes: 31_000 }]);
  });
});

describe("dashboard_attention", () => {
  it("counts what needs attention", async () => {
    const [{ a }] = await queryAs<{ a: Record<string, number> }>(db, manager, "select public.dashboard_attention($1) as a", [org]);
    expect(a).toEqual({
      pending_adjustments: 0,
      submitted_counts: 0,
      late_purchase_orders: 0,
      customers_owing: 1,
      customer_credit_millimes: 25_000,
    });
  });
});

describe("access and validation", () => {
  it.each([
    ["report_sales_by_day($1, '2026-03-10', '2026-03-12')"],
    ["report_sales_by_product($1, '2026-03-10', '2026-03-12')"],
    ["report_payments_by_method($1, '2026-03-10', '2026-03-12')"],
    ["dashboard_attention($1)"],
  ])("%s: refused to cashiers and to other organizations", async (call) => {
    await expect(queryAs(db, cashier, `select * from public.${call}`, [org])).rejects.toThrow(/forbidden/);
    await expect(queryAs(db, otherOwner, `select * from public.${call}`, [org])).rejects.toThrow(/forbidden/);
  });

  it("rejects reversed or over-long periods", async () => {
    await expect(byDay(owner, "2026-03-12", "2026-03-10")).rejects.toThrow(/invalid_period/);
    await expect(byDay(owner, "2025-01-01", "2026-03-10")).rejects.toThrow(/invalid_period/);
  });

  it("is not callable anonymously", async () => {
    const r = await db.query<{ ok: boolean }>(
      "select has_function_privilege('anon', 'public.report_sales_by_day(uuid, date, date, uuid)', 'execute') as ok",
    );
    expect(r.rows[0].ok).toBe(false);
  });
});

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

/**
 * Oracle test (audit finding P1, written before rewriting the function):
 * 60 days, several sales a day, line and order discounts, credit, an article
 * without cost, returns recorded on later days. Every column of every day is
 * compared with an independent computation over the raw tables.
 */
describe("report_sales_by_day against an independent computation (60 days)", () => {
  const TZ_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis", year: "numeric", month: "2-digit", day: "2-digit" });
  const localDay = (at: Date | string) => TZ_DAY.format(new Date(at));
  let org2: string;
  let owner2: TestUser;

  beforeAll(async () => {
    owner2 = await createUser(db, "owner@rapports-60j.tn");
    org2 = await createOrganization(db, owner2, "Boutique 60 jours");
    const location2 = (await db.query<{ id: string }>("select id from public.locations where organization_id = $1", [org2])).rows[0].id;
    const cash2 = (await db.query<{ id: string }>("select id from public.payment_methods where organization_id = $1 and kind = 'cash'", [org2])).rows[0].id;
    const customer2 = (
      await queryAs<{ id: string }>(db, owner2, "insert into public.customers (organization_id, name) values ($1, 'Client crédit') returning id", [org2])
    )[0].id;
    const make = async (name: string, price: number, cost: number | null) => {
      const [{ id }] = await queryAs<{ id: string }>(db, owner2, "select public.create_product($1, $2::jsonb) as id", [
        org2,
        JSON.stringify({ name, option_names: [], variants: [{ option_values: [], price_millimes: price, cost_millimes: cost }] }),
      ]);
      return (await db.query<{ id: string }>("select id from public.product_variants where product_id = $1", [id])).rows[0].id;
    };
    const known = await make("Avec coût", 12_345, 7_001);
    const unknown = await make("Sans coût", 3_333, null);
    await queryAs(db, owner2, "select public.record_opening_stock($1, $2, $3::jsonb, $4)", [
      org2,
      location2,
      JSON.stringify([
        { variant_id: known, quantity: 1000 },
        { variant_id: unknown, quantity: 1000 },
      ]),
      randomUUID(),
    ]);

    const sales: string[] = [];
    for (let d = 0; d < 60; d++) {
      for (let k = 0; k < 1 + (d % 3); k++) {
        const credit = (d + k) % 7 === 0;
        const lines = [
          { variant_id: known, quantity: 1 + ((d + k) % 3), discount_bps: (d % 4) * 250 },
          ...(k % 2 === 0 ? [{ variant_id: unknown, quantity: 1 + (d % 2) }] : []),
        ];
        const [{ id }] = await queryAs<{ id: string }>(
          db,
          owner2,
          "select public.finalize_sale($1, null, $2, $3, $4::jsonb, $5, null, '[]'::jsonb, $6) as id",
          [org2, location2, customer2, JSON.stringify(lines), (d % 5) * 100, randomUUID()],
        );
        const total = (await db.query<{ t: number }>("select total_millimes as t from public.sales where id = $1", [id])).rows[0].t;
        if (!credit) await queryAs(db, owner2, "select public.record_sale_payment($1, $2, $3, $4)", [id, cash2, total, randomUUID()]);
        // 22:30 UTC = 23:30 in Tunis: the local day, not the UTC day, must count.
        const at = new Date(Date.UTC(2026, 0, 1 + d, k === 2 ? 22 : 9, 30)).toISOString();
        await moveInTime("update public.sales set finalized_at = $2, created_at = $2 where id = $1", [id, at]);
        await moveInTime("update public.sale_payments set created_at = $2 where sale_id = $1", [id, at]);
        sales.push(id);
      }
    }
    // Returns two days after the sale, on every 5th sale (with a refund when the sale was paid).
    for (let i = 0; i < sales.length; i += 5) {
      const item = (await db.query<{ id: string }>("select id from public.sale_items where sale_id = $1 order by line_no limit 1", [sales[i]])).rows[0];
      const paid = (await db.query<{ p: number }>("select paid_millimes as p from public.sales where id = $1", [sales[i]])).rows[0].p;
      const [{ id: ret }] = await queryAs<{ id: string }>(db, owner2, "select public.create_sale_return($1, $2::jsonb, 'Retour client', $3, $4, $5) as id", [
        sales[i],
        JSON.stringify([{ sale_item_id: item.id, quantity: 1, restock: true }]),
        paid > 0 ? cash2 : null,
        paid > 0 ? 1_000 : null,
        randomUUID(),
      ]);
      const at = (await db.query<{ at: string }>("select finalized_at + interval '2 days' as at from public.sales where id = $1", [sales[i]])).rows[0].at;
      await moveInTime("update public.sale_returns set created_at = $2 where id = $1", [ret, at]);
      await moveInTime("update public.sale_payments set created_at = $2 where return_id = $1", [ret, at]);
    }
  });

  it("every column of every day equals the raw data", async () => {
    const from = "2025-12-30";
    const to = "2026-03-05";
    const report = await queryAs<DayRow>(db, owner2, "select * from public.report_sales_by_day($1, $2::date, $3::date)", [org2, from, to]);

    type Acc = Omit<DayRow, "day">;
    const zero = (): Acc => ({
      sales_count: 0,
      gross_millimes: 0,
      discount_millimes: 0,
      sales_total_millimes: 0,
      returns_count: 0,
      returns_millimes: 0,
      net_sales_millimes: 0,
      credit_given_millimes: 0,
      cost_millimes: 0,
      margin_millimes: 0,
      revenue_without_cost_millimes: 0,
    });
    const days = new Map<string, Acc>();
    const acc = (d: string) => {
      if (!days.has(d)) days.set(d, zero());
      return days.get(d)!;
    };

    type SaleRow = {
      finalized_at: string;
      subtotal_millimes: number;
      line_discount_millimes: number;
      order_discount_millimes: number;
      total_millimes: number;
      returned_millimes: number;
      paid_millimes: number;
    };
    const sales = await db.query<SaleRow>("select * from public.sales where organization_id = $1 and status = 'finalized'", [org2]);
    for (const s of sales.rows) {
      const a = acc(localDay(s.finalized_at));
      a.sales_count += 1;
      a.gross_millimes += s.subtotal_millimes + s.line_discount_millimes;
      a.discount_millimes += s.line_discount_millimes + s.order_discount_millimes;
      a.sales_total_millimes += s.total_millimes;
      a.credit_given_millimes += Math.max(s.total_millimes - s.returned_millimes - s.paid_millimes, 0);
    }
    const sold = await db.query<{ finalized_at: string; net: number; quantity: number; unit_cost: number | null }>(
      `select s.finalized_at, i.net_total_millimes as net, i.quantity, c.unit_cost_millimes as unit_cost
       from public.sale_items i join public.sales s on s.id = i.sale_id left join public.sale_item_costs c on c.sale_item_id = i.id
       where s.organization_id = $1 and s.status = 'finalized'`,
      [org2],
    );
    for (const l of sold.rows) {
      const a = acc(localDay(l.finalized_at));
      if (l.unit_cost === null) a.revenue_without_cost_millimes += l.net;
      else a.cost_millimes += l.quantity * l.unit_cost;
    }
    const returns = await db.query<{ created_at: string; amount_millimes: number }>(
      "select created_at, amount_millimes from public.sale_returns where organization_id = $1",
      [org2],
    );
    for (const r of returns.rows) {
      const a = acc(localDay(r.created_at));
      a.returns_count += 1;
      a.returns_millimes += r.amount_millimes;
    }
    const returned = await db.query<{ created_at: string; amount: number; quantity: number; unit_cost: number | null }>(
      `select r.created_at, ri.amount_millimes as amount, ri.quantity, c.unit_cost_millimes as unit_cost
       from public.sale_return_items ri join public.sale_returns r on r.id = ri.return_id left join public.sale_item_costs c on c.sale_item_id = ri.sale_item_id
       where r.organization_id = $1`,
      [org2],
    );
    for (const l of returned.rows) {
      const a = acc(localDay(l.created_at));
      if (l.unit_cost === null) a.revenue_without_cost_millimes -= l.amount;
      else a.cost_millimes -= l.quantity * l.unit_cost;
    }

    const expected: DayRow[] = [];
    for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      const a = days.get(day) ?? zero();
      a.net_sales_millimes = a.sales_total_millimes - a.returns_millimes;
      a.margin_millimes = a.net_sales_millimes - a.revenue_without_cost_millimes - a.cost_millimes;
      expected.push({ day, ...a });
    }

    expect(report).toHaveLength(66);
    expect(returns.rows.length).toBeGreaterThan(20);
    expect(report.filter((r) => r.sales_count > 0)).toHaveLength(60);
    expect(report).toEqual(expected);
  });
});

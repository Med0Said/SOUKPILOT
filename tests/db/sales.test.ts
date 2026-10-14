/**
 * Milestone 4 sales: pricing parity with the TypeScript mirror, finalization
 * atomicity and idempotency, discounts by role, credit and payments, returns
 * and refunds, immutability, tenant isolation, daily summary, concurrency.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { priceSale } from "../../src/lib/domain/pricing";
import {
  addMember,
  asUser,
  createOrganization,
  createTestDb,
  createUser,
  queryAs,
  usingRealPostgres,
  type TestDb,
  type TestUser,
} from "./harness";

let db: TestDb;
let owner: TestUser;
let manager: TestUser;
let cashier: TestUser;
let otherOwner: TestUser;
let org: string;
let otherOrg: string;
let location: string;
let cash: string;
let card: string;
let otherCash: string;
let customer: string;
let shirt: string; // 25 000, cost 12 000, tracked
let socks: string; // 1 999, tracked
let service: string; // 5 000, not tracked
let foreignVariant: string;

type Line = { variant_id: string; quantity: number; discount_bps?: number; [k: string]: unknown };
type Payment = { method_id: string; amount_millimes: number };

async function variant(user: TestUser, organizationId: string, name: string, price: number, extra: Record<string, unknown> = {}) {
  const [{ id }] = await queryAs<{ id: string }>(db, user, "select public.create_product($1, $2::jsonb) as id", [
    organizationId,
    JSON.stringify({ name, option_names: [], variants: [{ option_values: [], price_millimes: price, ...extra }], ...extra }),
  ]);
  return (await db.query<{ id: string }>("select id from public.product_variants where product_id = $1", [id])).rows[0].id;
}

async function stock(variantId: string): Promise<number> {
  const r = await db.query<{ quantity: number }>(
    "select quantity from public.stock_levels where location_id = $1 and variant_id = $2",
    [location, variantId],
  );
  return r.rows[0]?.quantity ?? 0;
}

function finalize(
  user: TestUser,
  lines: Line[],
  opts: { payments?: Payment[]; discount?: number; customer?: string | null; key?: string; saleId?: string; org?: string } = {},
) {
  return queryAs<{ id: string }>(
    db,
    user,
    "select public.finalize_sale($1, $2, $3, $4, $5::jsonb, $6, null, $7::jsonb, $8) as id",
    [
      opts.org ?? org,
      opts.saleId ?? null,
      location,
      opts.customer ?? null,
      JSON.stringify(lines),
      opts.discount ?? 0,
      JSON.stringify(opts.payments ?? []),
      opts.key ?? randomUUID(),
    ],
  ).then((r) => r[0].id);
}

const sale = (id: string) =>
  db
    .query<{
      number: number;
      status: string;
      subtotal_millimes: number;
      line_discount_millimes: number;
      order_discount_millimes: number;
      total_millimes: number;
      returned_millimes: number;
      paid_millimes: number;
    }>("select * from public.sales where id = $1", [id])
    .then((r) => r.rows[0]);

const items = (id: string) =>
  db
    .query<{
      id: string;
      variant_id: string;
      quantity: number;
      unit_price_millimes: number;
      gross_millimes: number;
      line_discount_millimes: number;
      line_total_millimes: number;
      order_discount_share_millimes: number;
      net_total_millimes: number;
    }>("select * from public.sale_items where sale_id = $1 order by line_no", [id])
    .then((r) => r.rows);

function returnSale(user: TestUser, saleId: string, lines: unknown[], refund?: { method: string; amount: number }, key = randomUUID()) {
  return queryAs<{ id: string }>(db, user, "select public.create_sale_return($1, $2::jsonb, 'Taille trop petite', $3, $4, $5) as id", [
    saleId,
    JSON.stringify(lines),
    refund?.method ?? null,
    refund?.amount ?? null,
    key,
  ]).then((r) => r[0].id);
}

const pay = (user: TestUser, saleId: string, method: string, amount: number, key = randomUUID()) =>
  queryAs<{ id: string }>(db, user, "select public.record_sale_payment($1, $2, $3, $4) as id", [saleId, method, amount, key]).then(
    (r) => r[0].id,
  );

beforeAll(async () => {
  db = await createTestDb();
  owner = await createUser(db, "owner@vente.tn");
  manager = await createUser(db, "manager@vente.tn");
  cashier = await createUser(db, "cashier@vente.tn");
  otherOwner = await createUser(db, "owner@autre.tn");
  org = await createOrganization(db, owner, "Boutique Vente");
  otherOrg = await createOrganization(db, otherOwner, "Autre");
  await addMember(db, org, manager, "manager");
  await addMember(db, org, cashier, "cashier");
  location = (await db.query<{ id: string }>("select id from public.locations where organization_id = $1", [org])).rows[0].id;

  const methods = await db.query<{ id: string; kind: string; organization_id: string }>(
    "select id, kind, organization_id from public.payment_methods",
  );
  cash = methods.rows.find((m) => m.organization_id === org && m.kind === "cash")!.id;
  card = methods.rows.find((m) => m.organization_id === org && m.kind === "card")!.id;
  otherCash = methods.rows.find((m) => m.organization_id === otherOrg && m.kind === "cash")!.id;

  [{ id: customer }] = await queryAs<{ id: string }>(
    db,
    cashier,
    "insert into public.customers (organization_id, name, phone) values ($1, 'Mme Ben Salah', '+216 22 000 111') returning id",
    [org],
  );

  shirt = await variant(owner, org, "Chemise", 25_000);
  await db.query("update public.product_variant_costs set cost_millimes = 12000 where variant_id = $1", [shirt]);
  socks = await variant(owner, org, "Chaussettes", 1_999);
  service = await variant(owner, org, "Retouche", 5_000, { track_stock: false });
  foreignVariant = await variant(otherOwner, otherOrg, "Ailleurs", 1_000);

  await queryAs(db, owner, "select public.record_opening_stock($1, $2, $3::jsonb, $4)", [
    org,
    location,
    JSON.stringify([
      { variant_id: shirt, quantity: 10 },
      { variant_id: socks, quantity: 50 },
    ]),
    randomUUID(),
  ]);
});

afterAll(async () => {
  await db.close();
});

describe("payment methods", () => {
  it("every organization gets default methods, visible only to its members", async () => {
    const mine = await queryAs<{ label: string }>(db, cashier, "select label from public.payment_methods order by sort_order");
    expect(mine.map((m) => m.label)).toEqual(["Espèces", "Carte bancaire", "Virement", "Chèque"]);
    await expect(
      queryAs(db, cashier, "insert into public.payment_methods (organization_id, label, kind) values ($1, 'D17', 'mobile')", [org]),
    ).rejects.toThrow(/row-level security/);
    await queryAs(db, manager, "insert into public.payment_methods (organization_id, label, kind) values ($1, 'D17', 'mobile')", [org]);
  });
});

describe("finalize_sale", () => {
  it("creates the sale, lines, cost snapshot, stock movements and payment in one go", async () => {
    const id = await finalize(cashier, [{ variant_id: shirt, quantity: 2 }], { payments: [{ method_id: cash, amount_millimes: 50_000 }] });
    expect(await sale(id)).toMatchObject({ number: 1, status: "finalized", total_millimes: 50_000, paid_millimes: 50_000 });
    expect(await stock(shirt)).toBe(8);

    const movement = await db.query<{ movement_type: string; quantity_delta: number }>(
      "select movement_type, quantity_delta from public.stock_movements where source_id = $1",
      [id],
    );
    expect(movement.rows).toEqual([{ movement_type: "sale", quantity_delta: -2 }]);

    const [item] = await items(id);
    expect(await queryAs(db, cashier, "select * from public.sale_item_costs where sale_item_id = $1", [item.id])).toEqual([]);
    expect(
      await queryAs<{ unit_cost_millimes: number }>(db, manager, "select unit_cost_millimes from public.sale_item_costs where sale_item_id = $1", [
        item.id,
      ]),
    ).toEqual([{ unit_cost_millimes: 12_000 }]);
  });

  it("matches the TypeScript pricing exactly (line and order discounts)", async () => {
    const lines = [
      { variant_id: shirt, quantity: 2, discount_bps: 1000 },
      { variant_id: socks, quantity: 3, discount_bps: 333 },
      { variant_id: service, quantity: 1, discount_bps: 0 },
    ];
    const id = await finalize(owner, lines, { discount: 1_001, payments: [{ method_id: card, amount_millimes: 1 }], customer });
    const expected = priceSale(
      [
        { quantity: 2, unitPriceMillimes: 25_000, discountBps: 1000 },
        { quantity: 3, unitPriceMillimes: 1_999, discountBps: 333 },
        { quantity: 1, unitPriceMillimes: 5_000, discountBps: 0 },
      ],
      1_001,
    );
    expect(await sale(id)).toMatchObject({
      subtotal_millimes: expected.subtotal,
      line_discount_millimes: expected.lineDiscount,
      order_discount_millimes: 1_001,
      total_millimes: expected.total,
    });
    expect((await items(id)).map((i) => [i.gross_millimes, i.line_discount_millimes, i.line_total_millimes, i.order_discount_share_millimes, i.net_total_millimes])).toEqual(
      expected.lines.map((l) => [l.gross, l.lineDiscount, l.lineTotal, l.orderDiscountShare, l.netTotal]),
    );
  });

  it("ignores any price sent by the browser", async () => {
    const id = await finalize(owner, [{ variant_id: socks, quantity: 1, unit_price_millimes: 1, total: 1 }], {
      payments: [{ method_id: cash, amount_millimes: 1_999 }],
    });
    expect((await sale(id)).total_millimes).toBe(1_999);
  });

  it("is idempotent: replaying the same key returns the same sale without selling twice", async () => {
    const key = randomUUID();
    const before = await stock(socks);
    const a = await finalize(cashier, [{ variant_id: socks, quantity: 2 }], { key, payments: [{ method_id: cash, amount_millimes: 3_998 }] });
    const b = await finalize(cashier, [{ variant_id: socks, quantity: 2 }], { key, payments: [{ method_id: cash, amount_millimes: 3_998 }] });
    expect(b).toBe(a);
    expect(await stock(socks)).toBe(before - 2);
  });

  it("rolls everything back when stock is insufficient, without burning a sale number", async () => {
    const count = async () => (await db.query<{ n: number }>("select count(*)::int as n from public.sales where organization_id = $1", [org])).rows[0].n;
    const before = await count();
    const lastNumber = (await db.query<{ n: number }>("select max(number)::int as n from public.sales where organization_id = $1", [org])).rows[0].n;
    await expect(
      finalize(cashier, [{ variant_id: socks, quantity: 1 }, { variant_id: shirt, quantity: 999 }], {
        payments: [{ method_id: cash, amount_millimes: 1 }],
        customer,
      }),
    ).rejects.toThrow("insufficient_stock");
    expect(await count()).toBe(before);
    const next = await finalize(cashier, [{ variant_id: service, quantity: 1 }], { payments: [{ method_id: cash, amount_millimes: 5_000 }] });
    expect((await sale(next)).number).toBe(lastNumber + 1);
  });

  it("does not move stock for non-tracked articles (services)", async () => {
    const id = await finalize(cashier, [{ variant_id: service, quantity: 3 }], { payments: [{ method_id: cash, amount_millimes: 15_000 }] });
    expect((await db.query("select * from public.stock_movements where source_id = $1", [id])).rows).toEqual([]);
  });

  it("caps cashier discounts at the organization setting; owners are not capped", async () => {
    await expect(finalize(cashier, [{ variant_id: socks, quantity: 1, discount_bps: 1500 }], { customer })).rejects.toThrow(
      "discount_not_allowed",
    );
    await expect(finalize(cashier, [{ variant_id: shirt, quantity: 1 }], { discount: 2_600, customer })).rejects.toThrow(
      "discount_not_allowed",
    );
    await queryAs(db, owner, "update public.organizations set cashier_max_discount_bps = 2000 where id = $1", [org]);
    await finalize(cashier, [{ variant_id: socks, quantity: 1, discount_bps: 1500 }], { customer });
    await finalize(owner, [{ variant_id: socks, quantity: 1, discount_bps: 5000 }], { customer });
    await expect(
      queryAs(db, cashier, "update public.organizations set cashier_max_discount_bps = 10000 where id = $1 returning id", [org]),
    ).resolves.toEqual([]);
  });

  it("validates lines, discounts and payments", async () => {
    for (const [lines, opts, error] of [
      [[], {}, "invalid_lines"],
      [[{ variant_id: socks, quantity: 0 }], {}, "invalid_lines"],
      [[{ variant_id: socks, quantity: 1.5 }], {}, "invalid_lines"],
      [[{ variant_id: socks, quantity: 1 }, { variant_id: socks, quantity: 2 }], {}, "duplicate_line"],
      [[{ variant_id: foreignVariant, quantity: 1 }], {}, "invalid_reference"],
      [[{ variant_id: socks, quantity: 1 }], { discount: 5_000, customer }, "invalid_discount"],
      [[{ variant_id: socks, quantity: 1 }], { payments: [{ method_id: cash, amount_millimes: 2_000 }] }, "payment_exceeds_balance"],
      [[{ variant_id: socks, quantity: 1 }], { payments: [{ method_id: otherCash, amount_millimes: 1_999 }] }, "invalid_payment"],
      [[{ variant_id: socks, quantity: 1 }], { payments: [{ method_id: cash, amount_millimes: -1 }] }, "invalid_payment"],
    ] as const) {
      await expect(finalize(owner, lines as unknown as Line[], opts as never), JSON.stringify(lines)).rejects.toThrow(error);
    }
  });
});

describe("credit sales and payments", () => {
  it("requires a customer for an unpaid balance, then accepts payments up to the balance", async () => {
    await expect(finalize(cashier, [{ variant_id: shirt, quantity: 1 }], { payments: [{ method_id: cash, amount_millimes: 10_000 }] })).rejects.toThrow(
      "customer_required_for_credit",
    );
    const id = await finalize(cashier, [{ variant_id: shirt, quantity: 1 }], {
      customer,
      payments: [{ method_id: cash, amount_millimes: 10_000 }],
    });
    await expect(pay(cashier, id, card, 15_001)).rejects.toThrow("payment_exceeds_balance");
    const key = randomUUID();
    const p1 = await pay(cashier, id, card, 5_000, key);
    expect(await pay(cashier, id, card, 5_000, key)).toBe(p1);
    await pay(manager, id, cash, 10_000);
    expect(await sale(id)).toMatchObject({ total_millimes: 25_000, paid_millimes: 25_000 });

    const balances = await queryAs<{ customer_name: string; balance_millimes: number }>(
      db,
      cashier,
      "select customer_name, balance_millimes from public.customer_balances($1)",
      [org],
    );
    for (const b of balances) expect(b.balance_millimes).not.toBe(0);
  });
});

describe("drafts", () => {
  it("save, update, finalize by id; cannot be finalized twice or after cancellation", async () => {
    const before = await stock(socks);
    const [{ id: draft }] = await queryAs<{ id: string }>(
      db,
      cashier,
      "select public.save_sale_draft($1, null, $2, null, $3::jsonb, 0, 'brouillon') as id",
      [org, location, JSON.stringify([{ variant_id: socks, quantity: 1 }])],
    );
    await queryAs(db, cashier, "select public.save_sale_draft($1, $2, $3, null, $4::jsonb, 0, null)", [
      org,
      draft,
      location,
      JSON.stringify([{ variant_id: socks, quantity: 4 }]),
    ]);
    expect(await stock(socks)).toBe(before);
    expect((await sale(draft)).status).toBe("draft");

    await finalize(cashier, [{ variant_id: socks, quantity: 4 }], { saleId: draft, payments: [{ method_id: cash, amount_millimes: 7_996 }] });
    expect(await stock(socks)).toBe(before - 4);
    await expect(finalize(cashier, [{ variant_id: socks, quantity: 1 }], { saleId: draft, customer })).rejects.toThrow("sale_not_draft");

    const [{ id: other }] = await queryAs<{ id: string }>(
      db,
      cashier,
      "select public.save_sale_draft($1, null, $2, null, $3::jsonb, 0, null) as id",
      [org, location, JSON.stringify([{ variant_id: socks, quantity: 1 }])],
    );
    await queryAs(db, cashier, "select public.cancel_sale_draft($1)", [other]);
    await expect(finalize(cashier, [{ variant_id: socks, quantity: 1 }], { saleId: other, customer })).rejects.toThrow("sale_not_draft");
  });
});

describe("returns and refunds", () => {
  it("owner/manager only; restock optional; cumulative amounts; refund limited to the overpaid amount", async () => {
    // 3 socks with 333 bps discount: net total not divisible by 3.
    const id = await finalize(owner, [{ variant_id: socks, quantity: 3, discount_bps: 333 }], { customer });
    await pay(owner, id, cash, (await sale(id)).total_millimes);
    const [item] = await items(id);
    const stockBefore = await stock(socks);

    await expect(returnSale(cashier, id, [{ sale_item_id: item.id, quantity: 1, restock: true }])).rejects.toThrow("forbidden");
    await expect(returnSale(otherOwner, id, [{ sale_item_id: item.id, quantity: 1, restock: true }])).rejects.toThrow("sale_not_found");

    await returnSale(manager, id, [{ sale_item_id: item.id, quantity: 1, restock: true }], { method: cash, amount: 1 });
    expect(await stock(socks)).toBe(stockBefore + 1);

    // Refund more than overpaid is refused (whole return rolled back).
    await expect(
      returnSale(manager, id, [{ sale_item_id: item.id, quantity: 1, restock: false }], { method: cash, amount: 999_999 }),
    ).rejects.toThrow("refund_exceeds_balance");
    await returnSale(manager, id, [{ sale_item_id: item.id, quantity: 1, restock: false }]);
    expect(await stock(socks)).toBe(stockBefore + 1);
    await returnSale(manager, id, [{ sale_item_id: item.id, quantity: 1, restock: true }]);
    await expect(returnSale(manager, id, [{ sale_item_id: item.id, quantity: 1, restock: true }])).rejects.toThrow(
      "return_exceeds_sold",
    );

    const s = await sale(id);
    expect(s.returned_millimes).toBe(item.net_total_millimes);
    // Customer paid the full total and got 1 millime back so far: shop owes the rest.
    expect(s.total_millimes - s.returned_millimes - s.paid_millimes).toBe(-(item.net_total_millimes - 1));
    await queryAs(db, owner, "select public.record_sale_refund($1, $2, $3, $4)", [id, cash, item.net_total_millimes - 1, randomUUID()]);
    await expect(queryAs(db, owner, "select public.record_sale_refund($1, $2, 1, $3)", [id, cash, randomUUID()])).rejects.toThrow(
      "refund_exceeds_balance",
    );
    expect((await sale(id)).paid_millimes).toBe(s.total_millimes - s.returned_millimes);
  });
});

describe("immutability and isolation", () => {
  it("finalized sales, lines, payments and returns cannot be changed", async () => {
    const id = await finalize(owner, [{ variant_id: socks, quantity: 1 }], { payments: [{ method_id: cash, amount_millimes: 1_999 }] });
    await expect(queryAs(db, owner, "update public.sales set total_millimes = 1 where id = $1", [id])).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, owner, "delete from public.sale_payments where sale_id = $1", [id])).rejects.toThrow(/permission denied/);
    await expect(db.query("update public.sales set total_millimes = 1, subtotal_millimes = 1 where id = $1", [id])).rejects.toThrow(
      "sale_immutable",
    );
    await expect(db.query("update public.sale_items set unit_price_millimes = 1 where sale_id = $1", [id])).rejects.toThrow("sale_immutable");
    await expect(db.query("delete from public.sale_items where sale_id = $1", [id])).rejects.toThrow("sale_immutable");
    await expect(db.query("delete from public.sale_payments where sale_id = $1", [id])).rejects.toThrow("record_immutable");
    await expect(db.query("delete from public.sales where id = $1", [id])).rejects.toThrow("sale_immutable");
  });

  it("other tenants cannot read, pay, or reuse our variants and payment methods", async () => {
    const id = await finalize(owner, [{ variant_id: socks, quantity: 1 }], { payments: [{ method_id: cash, amount_millimes: 1_999 }] });
    for (const table of ["sales", "sale_items", "sale_payments", "sale_returns", "customers", "payment_methods"]) {
      expect(await queryAs(db, otherOwner, `select * from public.${table} where organization_id = $1`, [org]), table).toEqual([]);
    }
    await expect(pay(otherOwner, id, otherCash, 1)).rejects.toThrow("sale_not_found");
    await expect(finalize(otherOwner, [{ variant_id: socks, quantity: 1 }], { org: otherOrg })).rejects.toThrow("invalid_reference");
    await expect(finalize(otherOwner, [{ variant_id: socks, quantity: 1 }], { org })).rejects.toThrow("forbidden");
    expect(await queryAs(db, otherOwner, "select public.sales_daily_summary($1, current_date) as s", [org])).toEqual([{ s: null }]);
  });
});

describe("reports and integrity", () => {
  it("daily summary uses the organization timezone and documented definitions", async () => {
    const [{ day }] = (await db.query<{ day: string }>("select ((now() at time zone 'Africa/Tunis')::date)::text as day")).rows;
    const [{ s }] = await queryAs<{ s: Record<string, number> & { payments: { label: string; net_millimes: number }[] } }>(
      db,
      cashier,
      "select public.sales_daily_summary($1, $2::date) as s",
      [org, day],
    );
    const totals = await db.query<{ total: number; returns: number }>(
      `select (select coalesce(sum(total_millimes),0)::bigint from public.sales where organization_id = $1 and status = 'finalized') as total,
              (select coalesce(sum(amount_millimes),0)::bigint from public.sale_returns where organization_id = $1) as returns`,
      [org],
    );
    expect(s.sales_total_millimes).toBe(totals.rows[0].total);
    expect(s.returns_millimes).toBe(totals.rows[0].returns);
    expect(s.net_sales_millimes).toBe(totals.rows[0].total - totals.rows[0].returns);
    const paid = await db.query<{ net: number }>(
      "select coalesce(sum(paid_millimes),0)::bigint as net from public.sales where organization_id = $1",
      [org],
    );
    expect(s.payments.reduce((n, p) => n + p.net_millimes, 0)).toBe(paid.rows[0].net);
  });

  it("aggregates, stock and ledger are consistent", async () => {
    expect(await queryAs(db, owner, "select * from public.check_sales_consistency($1)", [org])).toEqual([]);
    expect(await queryAs(db, owner, "select * from public.check_stock_reconciliation($1)", [org])).toEqual([]);
  });
});

describe.runIf(usingRealPostgres)("concurrency (real PostgreSQL)", () => {
  async function overlapping<T>(user: TestUser, sql: string, params: unknown[], second: () => Promise<T>) {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => (started = resolve));
    const first = asUser(db, user, async (tx) => {
      const r = await tx.query(sql, params);
      started();
      await tx.query("select pg_sleep(0.6)");
      return r.rows;
    });
    first.catch(() => started());
    await ready;
    const results = await Promise.allSettled([first, second()]);
    return results;
  }

  it("two simultaneous sales cannot both sell the last unit", async () => {
    const last = await variant(owner, org, `Dernier ${randomUUID().slice(0, 6)}`, 10_000);
    await queryAs(db, owner, "select public.record_opening_stock($1, $2, $3::jsonb, $4)", [
      org,
      location,
      JSON.stringify([{ variant_id: last, quantity: 1 }]),
      randomUUID(),
    ]);
    const lines = JSON.stringify([{ variant_id: last, quantity: 1 }]);
    const payments = JSON.stringify([{ method_id: cash, amount_millimes: 10_000 }]);
    const [first, second] = await overlapping(
      cashier,
      "select public.finalize_sale($1, null, $2, null, $3::jsonb, 0, null, $4::jsonb, $5)",
      [org, location, lines, payments, randomUUID()],
      () => finalize(manager, [{ variant_id: last, quantity: 1 }], { payments: [{ method_id: cash, amount_millimes: 10_000 }] }),
    );
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    expect(String((second as PromiseRejectedResult).reason)).toMatch("insufficient_stock");
    expect(await stock(last)).toBe(0);
  });

  it("a double-submitted sale (same key, concurrent) is recorded once", async () => {
    const key = randomUUID();
    const before = await stock(socks);
    const lines = JSON.stringify([{ variant_id: socks, quantity: 1 }]);
    const payments = JSON.stringify([{ method_id: cash, amount_millimes: 1_999 }]);
    const [first, second] = await overlapping(
      cashier,
      "select public.finalize_sale($1, null, $2, null, $3::jsonb, 0, null, $4::jsonb, $5) as id",
      [org, location, lines, payments, key],
      () => finalize(cashier, [{ variant_id: socks, quantity: 1 }], { key, payments: [{ method_id: cash, amount_millimes: 1_999 }] }),
    );
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("fulfilled");
    expect((second as PromiseFulfilledResult<string>).value).toBe(
      ((first as PromiseFulfilledResult<{ id: string }[]>).value)[0].id,
    );
    expect(await stock(socks)).toBe(before - 1);
  });

  it("two simultaneous payments cannot both settle the same balance", async () => {
    const id = await finalize(owner, [{ variant_id: socks, quantity: 1 }], { customer });
    const [first, second] = await overlapping(
      cashier,
      "select public.record_sale_payment($1, $2, 1999, $3)",
      [id, cash, randomUUID()],
      () => pay(manager, id, card, 1_999),
    );
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    expect(String((second as PromiseRejectedResult).reason)).toMatch("payment_exceeds_balance");
    expect((await sale(id)).paid_millimes).toBe(1_999);
    expect(await queryAs(db, owner, "select * from public.check_sales_consistency($1)", [org])).toEqual([]);
  });
});

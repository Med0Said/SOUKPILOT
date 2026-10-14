/**
 * Milestone 5 purchasing: orders never move stock, receipts against orders
 * (partial, capped, idempotent, concurrent), supplier payments and balances,
 * immutability, isolation, consistency.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
let supplier: string;
let otherSupplier: string;
let transfer: string;
let shirt: string;
let jeans: string;

async function variant(name: string, price: number): Promise<string> {
  const [{ id }] = await queryAs<{ id: string }>(db, owner, "select public.create_product($1, $2::jsonb) as id", [
    org,
    JSON.stringify({ name, option_names: [], variants: [{ option_values: [], price_millimes: price }] }),
  ]);
  return (await db.query<{ id: string }>("select id from public.product_variants where product_id = $1", [id])).rows[0].id;
}

const stock = async (v: string) =>
  (await db.query<{ q: number }>("select quantity as q from public.stock_levels where location_id = $1 and variant_id = $2", [location, v]))
    .rows[0]?.q ?? 0;

const draft = (user: TestUser, lines: unknown[], opts: { id?: string; supplier?: string; org?: string } = {}) =>
  queryAs<{ id: string }>(db, user, "select public.save_purchase_order($1, $2, $3, $4, null, 'REF-1', null, $5::jsonb) as id", [
    opts.org ?? org,
    opts.id ?? null,
    opts.supplier ?? supplier,
    location,
    JSON.stringify(lines),
  ]).then((r) => r[0].id);

const place = (user: TestUser, id: string) =>
  queryAs<{ n: number }>(db, user, "select public.place_purchase_order($1) as n", [id]).then((r) => r[0].n);

const items = (poId: string) =>
  db
    .query<{ id: string; variant_id: string; quantity: number; received_quantity: number }>(
      "select id, variant_id, quantity, received_quantity from public.purchase_order_items where purchase_order_id = $1 order by line_no",
      [poId],
    )
    .then((r) => r.rows);

const receive = (user: TestUser, poId: string, lines: unknown[], key = randomUUID(), updateCosts = false) =>
  queryAs<{ id: string }>(db, user, "select public.receive_purchase_order($1, $2::jsonb, 'BL-77', null, $3, $4) as id", [
    poId,
    JSON.stringify(lines),
    updateCosts,
    key,
  ]).then((r) => r[0].id);

const status = (poId: string) =>
  db.query<{ status: string }>("select status from public.purchase_orders where id = $1", [poId]).then((r) => r.rows[0].status);

const payment = (user: TestUser, amount: number, kind = "payment", key = randomUUID(), sup = supplier) =>
  queryAs<{ id: string }>(
    db,
    user,
    "select public.record_supplier_payment($1, $2, $3, $4, $5, current_date, 'CHQ 123', null, null, $6) as id",
    [org, sup, transfer, kind, amount, key],
  ).then((r) => r[0].id);

const balance = async (user = owner) => {
  const rows = await queryAs<{ supplier_id: string; purchases_millimes: number; paid_millimes: number; balance_millimes: number }>(
    db,
    user,
    "select * from public.supplier_balances($1)",
    [org],
  );
  return rows.find((r) => r.supplier_id === supplier);
};

beforeAll(async () => {
  db = await createTestDb();
  owner = await createUser(db, "owner@achat.tn");
  manager = await createUser(db, "manager@achat.tn");
  cashier = await createUser(db, "cashier@achat.tn");
  otherOwner = await createUser(db, "owner@autre.tn");
  org = await createOrganization(db, owner, "Boutique Achats");
  otherOrg = await createOrganization(db, otherOwner, "Autre");
  await addMember(db, org, manager, "manager");
  await addMember(db, org, cashier, "cashier");
  location = (await db.query<{ id: string }>("select id from public.locations where organization_id = $1", [org])).rows[0].id;
  [{ id: supplier }] = await queryAs<{ id: string }>(
    db,
    owner,
    "insert into public.suppliers (organization_id, name) values ($1, 'Grossiste Sfax') returning id",
    [org],
  );
  [{ id: otherSupplier }] = await queryAs<{ id: string }>(
    db,
    otherOwner,
    "insert into public.suppliers (organization_id, name) values ($1, 'Fournisseur autre') returning id",
    [otherOrg],
  );
  transfer = (
    await db.query<{ id: string }>("select id from public.payment_methods where organization_id = $1 and kind = 'transfer'", [org])
  ).rows[0].id;
  shirt = await variant("Chemise", 30_000);
  jeans = await variant("Jean", 60_000);
});

afterAll(async () => {
  await db.close();
});

describe("purchase orders", () => {
  it("drafts are editable, placing numbers them, and neither moves stock", async () => {
    const id = await draft(manager, [{ variant_id: shirt, quantity: 5, unit_cost_millimes: 12_000 }]);
    await draft(manager, [
      { variant_id: shirt, quantity: 10, unit_cost_millimes: 12_000 },
      { variant_id: jeans, quantity: 4, unit_cost_millimes: 25_500 },
    ], { id });
    const po = (await db.query<{ ordered_total_millimes: number; number: number | null }>(
      "select ordered_total_millimes, number from public.purchase_orders where id = $1",
      [id],
    )).rows[0];
    expect(po).toEqual({ ordered_total_millimes: 10 * 12_000 + 4 * 25_500, number: null });

    expect(await place(manager, id)).toBe(1);
    expect(await status(id)).toBe("ordered");
    expect(await stock(shirt)).toBe(0);
    await expect(draft(manager, [{ variant_id: shirt, quantity: 1, unit_cost_millimes: 1 }], { id })).rejects.toThrow(
      "purchase_order_locked",
    );
    await expect(db.query("update public.purchase_order_items set quantity = 99 where purchase_order_id = $1", [id])).rejects.toThrow(
      "purchase_order_locked",
    );
  });

  it("requires a cost per line, an active supplier of the organization, owner/manager role", async () => {
    await expect(draft(owner, [{ variant_id: shirt, quantity: 1 }])).rejects.toThrow("unit_cost_required");
    await expect(draft(cashier, [{ variant_id: shirt, quantity: 1, unit_cost_millimes: 1 }])).rejects.toThrow("forbidden");
    await expect(draft(owner, [{ variant_id: shirt, quantity: 1, unit_cost_millimes: 1 }], { supplier: otherSupplier })).rejects.toThrow(
      "invalid_reference",
    );
    await expect(
      draft(otherOwner, [{ variant_id: shirt, quantity: 1, unit_cost_millimes: 1 }], { org: otherOrg, supplier: otherSupplier }),
    ).rejects.toThrow("invalid_reference");
  });
});

describe("receiving against an order", () => {
  let poId: string;

  beforeAll(async () => {
    poId = await draft(owner, [
      { variant_id: shirt, quantity: 10, unit_cost_millimes: 12_000 },
      { variant_id: jeans, quantity: 4, unit_cost_millimes: 25_500 },
    ]);
    await place(owner, poId);
  });

  it("partial receipt moves stock, tracks received quantities and is idempotent", async () => {
    const [shirtItem, jeansItem] = await items(poId);
    const key = randomUUID();
    const receipt = await receive(manager, poId, [{ purchase_order_item_id: shirtItem.id, quantity: 6 }], key);
    expect(await receive(manager, poId, [{ purchase_order_item_id: shirtItem.id, quantity: 6 }], key)).toBe(receipt);
    expect(await stock(shirt)).toBe(6);
    expect(await status(poId)).toBe("partially_received");
    expect((await items(poId)).map((i) => i.received_quantity)).toEqual([6, 0]);

    const r = (await db.query<{ total_cost_millimes: number; supplier_id: string; purchase_order_id: string }>(
      "select total_cost_millimes, supplier_id, purchase_order_id from public.stock_receipts where id = $1",
      [receipt],
    )).rows[0];
    expect(r).toEqual({ total_cost_millimes: 72_000, supplier_id: supplier, purchase_order_id: poId });
    void jeansItem;
  });

  it("never receives more than ordered", async () => {
    const [shirtItem] = await items(poId);
    await expect(receive(owner, poId, [{ purchase_order_item_id: shirtItem.id, quantity: 5 }])).rejects.toThrow(
      "receipt_exceeds_ordered",
    );
    expect(await stock(shirt)).toBe(6);
  });

  it("completing every line marks the order received, with an optional cost override and cost update", async () => {
    const [shirtItem, jeansItem] = await items(poId);
    await receive(
      owner,
      poId,
      [
        { purchase_order_item_id: shirtItem.id, quantity: 4 },
        { purchase_order_item_id: jeansItem.id, quantity: 4, unit_cost_millimes: 26_000 },
      ],
      randomUUID(),
      true,
    );
    expect(await status(poId)).toBe("received");
    expect(await stock(jeans)).toBe(4);
    const cost = await db.query<{ cost_millimes: number }>("select cost_millimes from public.product_variant_costs where variant_id = $1", [jeans]);
    expect(cost.rows[0].cost_millimes).toBe(26_000);
    await expect(receive(owner, poId, [{ purchase_order_item_id: shirtItem.id, quantity: 1 }])).rejects.toThrow("purchase_order_not_open");
  });

  it("rejects lines of another order and receipts by cashiers or other tenants", async () => {
    const other = await draft(owner, [{ variant_id: shirt, quantity: 1, unit_cost_millimes: 1 }]);
    await place(owner, other);
    const [foreignItem] = await items(poId);
    await expect(receive(owner, other, [{ purchase_order_item_id: foreignItem.id, quantity: 1 }])).rejects.toThrow("invalid_reference");
    const [item] = await items(other);
    await expect(receive(cashier, other, [{ purchase_order_item_id: item.id, quantity: 1 }])).rejects.toThrow("forbidden");
    await expect(receive(otherOwner, other, [{ purchase_order_item_id: item.id, quantity: 1 }])).rejects.toThrow(
      "purchase_order_not_found",
    );
  });

  it("cancel only when nothing was received; close a partial order", async () => {
    const a = await draft(owner, [{ variant_id: shirt, quantity: 3, unit_cost_millimes: 1_000 }]);
    await queryAs(db, owner, "select public.cancel_purchase_order($1)", [a]);
    expect(await status(a)).toBe("cancelled");

    const b = await draft(owner, [{ variant_id: shirt, quantity: 3, unit_cost_millimes: 1_000 }]);
    await place(owner, b);
    const [item] = await items(b);
    await receive(owner, b, [{ purchase_order_item_id: item.id, quantity: 1 }]);
    await expect(queryAs(db, owner, "select public.cancel_purchase_order($1)", [b])).rejects.toThrow("purchase_order_not_cancellable");
    await queryAs(db, owner, "select public.close_purchase_order($1)", [b]);
    expect(await status(b)).toBe("closed");
    await expect(receive(owner, b, [{ purchase_order_item_id: item.id, quantity: 1 }])).rejects.toThrow("purchase_order_not_open");
  });
});

describe("supplier payments and balances", () => {
  it("balance = goods received at receipt cost − payments + refunds", async () => {
    const before = await balance();
    expect(before?.purchases_millimes).toBeGreaterThan(0);
    const key = randomUUID();
    const p = await payment(manager, 50_000, "payment", key);
    expect(await payment(manager, 50_000, "payment", key)).toBe(p);
    await payment(manager, 5_000, "refund");
    const after = await balance();
    expect(after).toMatchObject({
      purchases_millimes: before!.purchases_millimes,
      paid_millimes: before!.paid_millimes + 45_000,
      balance_millimes: before!.balance_millimes - 45_000,
    });
  });

  it("direct receipts with a supplier count as purchases too", async () => {
    const before = await balance();
    await queryAs(db, owner, "select public.post_stock_receipt($1, $2, $3, null, null, $4::jsonb, false, $5)", [
      org,
      location,
      supplier,
      JSON.stringify([{ variant_id: shirt, quantity: 2, unit_cost_millimes: 11_000 }]),
      randomUUID(),
    ]);
    expect((await balance())!.purchases_millimes).toBe(before!.purchases_millimes + 22_000);
  });

  it("is owner/manager only and tenant-isolated", async () => {
    await expect(payment(cashier, 1)).rejects.toThrow("forbidden");
    expect(await queryAs(db, cashier, "select * from public.supplier_balances($1)", [org])).toEqual([]);
    expect(await queryAs(db, cashier, "select * from public.purchase_orders")).toEqual([]);
    expect(await queryAs(db, otherOwner, "select * from public.supplier_payments where organization_id = $1", [org])).toEqual([]);
    await expect(payment(owner, 1, "payment", randomUUID(), otherSupplier)).rejects.toThrow("invalid_reference");
    await expect(
      queryAs(db, owner, "select public.record_supplier_payment($1, $2, $3, 'payment', 1, current_date, null, null, null, $4)", [
        org,
        supplier,
        randomUUID(),
        randomUUID(),
      ]),
    ).rejects.toThrow("invalid_payment");
  });

  it("payments and receipt lines are immutable", async () => {
    await expect(db.query("delete from public.supplier_payments")).rejects.toThrow("record_immutable");
    await expect(db.query("update public.stock_receipt_lines set quantity = 1")).rejects.toThrow("record_immutable");
  });

  it("everything reconciles", async () => {
    expect(await queryAs(db, owner, "select * from public.check_purchasing_consistency($1)", [org])).toEqual([]);
    expect(await queryAs(db, owner, "select * from public.check_stock_reconciliation($1)", [org])).toEqual([]);
  });
});

describe.runIf(usingRealPostgres)("concurrency (real PostgreSQL)", () => {
  it("two simultaneous receipts cannot exceed the ordered quantity", async () => {
    const poId = await draft(owner, [{ variant_id: jeans, quantity: 5, unit_cost_millimes: 1_000 }]);
    await place(owner, poId);
    const [item] = await items(poId);
    const before = await stock(jeans);

    let started!: () => void;
    const ready = new Promise<void>((resolve) => (started = resolve));
    const first = asUser(db, owner, async (tx) => {
      await tx.query("select public.receive_purchase_order($1, $2::jsonb, null, null, false, $3)", [
        poId,
        JSON.stringify([{ purchase_order_item_id: item.id, quantity: 4 }]),
        randomUUID(),
      ]);
      started();
      await tx.query("select pg_sleep(0.6)");
    });
    first.catch(() => started());
    await ready;
    const [a, b] = await Promise.allSettled([first, receive(manager, poId, [{ purchase_order_item_id: item.id, quantity: 4 }])]);
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("rejected");
    expect(String((b as PromiseRejectedResult).reason)).toMatch("receipt_exceeds_ordered");
    expect(await stock(jeans)).toBe(before + 4);
    expect(await queryAs(db, owner, "select * from public.check_purchasing_consistency($1)", [org])).toEqual([]);
  });
});

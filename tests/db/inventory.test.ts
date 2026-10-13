/**
 * Milestone 3 inventory: ledger, balances, documents, approvals, counts,
 * transfers, isolation, idempotency and (on a real server) concurrency.
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
let main: string;
let depot: string;
let closed: string;
let small: string;
let medium: string;
let untracked: string;
let foreignVariant: string;

type Line = Record<string, unknown>;

async function variantIds(user: TestUser, organizationId: string, payload: unknown): Promise<string[]> {
  const [{ id }] = await queryAs<{ id: string }>(db, user, "select public.create_product($1, $2::jsonb) as id", [
    organizationId,
    JSON.stringify(payload),
  ]);
  const rows = await db.query<{ id: string }>(
    "select id from public.product_variants where product_id = $1 order by option_values",
    [id],
  );
  return rows.rows.map((r) => r.id);
}

async function level(location: string, variant: string): Promise<number> {
  const rows = await db.query<{ quantity: number }>(
    "select quantity from public.stock_levels where location_id = $1 and variant_id = $2",
    [location, variant],
  );
  return rows.rows[0]?.quantity ?? 0;
}

const receipt = (user: TestUser, lines: Line[], opts: { key?: string; org?: string; location?: string; updateCosts?: boolean } = {}) =>
  queryAs<{ id: string }>(
    db,
    user,
    "select public.post_stock_receipt($1, $2, null, 'BL-1', null, $3::jsonb, $4, $5) as id",
    [opts.org ?? org, opts.location ?? main, JSON.stringify(lines), opts.updateCosts ?? false, opts.key ?? randomUUID()],
  ).then((r) => r[0].id);

const opening = (user: TestUser, lines: Line[], key = randomUUID(), location = main) =>
  queryAs<{ id: string }>(db, user, "select public.record_opening_stock($1, $2, $3::jsonb, $4) as id", [
    org,
    location,
    JSON.stringify(lines),
    key,
  ]).then((r) => r[0].id);

const propose = (user: TestUser, lines: Line[], reason = "Casse en réserve", location = main) =>
  queryAs<{ id: string }>(db, user, "select public.create_stock_adjustment($1, $2, $3, $4::jsonb, $5) as id", [
    org,
    location,
    reason,
    JSON.stringify(lines),
    randomUUID(),
  ]).then((r) => r[0].id);

const review = (user: TestUser, id: string, approve: boolean) =>
  queryAs(db, user, "select public.review_stock_adjustment($1, $2)", [id, approve]);

const transfer = (user: TestUser, from: string, to: string, lines: Line[], key = randomUUID()) =>
  queryAs<{ id: string }>(db, user, "select public.post_stock_transfer($1, $2, $3, null, $4::jsonb, $5) as id", [
    org,
    from,
    to,
    JSON.stringify(lines),
    key,
  ]).then((r) => r[0].id);

async function reconciliation(organizationId = org, user = owner) {
  return queryAs(db, user, "select * from public.check_stock_reconciliation($1)", [organizationId]);
}

beforeAll(async () => {
  db = await createTestDb();
  owner = await createUser(db, "owner@stock.tn");
  manager = await createUser(db, "manager@stock.tn");
  cashier = await createUser(db, "cashier@stock.tn");
  otherOwner = await createUser(db, "owner@other.tn");
  org = await createOrganization(db, owner, "Stock Shop");
  otherOrg = await createOrganization(db, otherOwner, "Other Shop");
  await addMember(db, org, manager, "manager");
  await addMember(db, org, cashier, "cashier");

  main = (await db.query<{ id: string }>("select id from public.locations where organization_id = $1", [org])).rows[0].id;
  [depot] = (
    await queryAs<{ id: string }>(db, owner, "insert into public.locations (organization_id, name) values ($1, 'Dépôt') returning id", [org])
  ).map((r) => r.id);
  [closed] = (
    await queryAs<{ id: string }>(
      db,
      owner,
      "insert into public.locations (organization_id, name, is_active) values ($1, 'Fermé', false) returning id",
      [org],
    )
  ).map((r) => r.id);

  [medium, small] = await variantIds(owner, org, {
    name: "Chemise",
    option_names: ["Taille"],
    variants: [
      { option_values: ["S"], price_millimes: 30000, low_stock_threshold: 3 },
      { option_values: ["M"], price_millimes: 30000 },
    ],
  });
  [untracked] = await variantIds(owner, org, {
    name: "Retouche",
    track_stock: false,
    option_names: [],
    variants: [{ option_values: [], price_millimes: 5000 }],
  });
  [foreignVariant] = await variantIds(otherOwner, otherOrg, {
    name: "Ailleurs",
    option_names: [],
    variants: [{ option_values: [], price_millimes: 1 }],
  });
});

afterAll(async () => {
  await db.close();
});

describe("opening stock", () => {
  it("records the first quantity and cost, once", async () => {
    const key = randomUUID();
    const id = await opening(owner, [{ variant_id: small, quantity: 10, unit_cost_millimes: 15000 }], key);
    expect(await level(main, small)).toBe(10);
    // Replay with the same key: same document, no second movement.
    expect(await opening(owner, [{ variant_id: small, quantity: 10 }], key)).toBe(id);
    expect(await level(main, small)).toBe(10);

    const cost = await db.query<{ cost_millimes: number }>(
      "select cost_millimes from public.product_variant_costs where variant_id = $1",
      [small],
    );
    expect(cost.rows[0].cost_millimes).toBe(15000);

    await expect(opening(owner, [{ variant_id: small, quantity: 5 }])).rejects.toThrow("opening_already_recorded");
    expect(await level(main, small)).toBe(10);
  });

  it("is refused to cashiers", async () => {
    await expect(opening(cashier, [{ variant_id: medium, quantity: 1 }])).rejects.toThrow("forbidden");
  });
});

describe("goods receipt", () => {
  it("adds stock, optionally updates costs, and is idempotent", async () => {
    const key = randomUUID();
    const id = await receipt(
      manager,
      [
        { variant_id: small, quantity: 5, unit_cost_millimes: 16000 },
        { variant_id: medium, quantity: 3 },
      ],
      { key, updateCosts: true },
    );
    expect(await level(main, small)).toBe(15);
    expect(await level(main, medium)).toBe(3);
    expect(await receipt(manager, [{ variant_id: small, quantity: 5 }], { key })).toBe(id);
    expect(await level(main, small)).toBe(15);

    const cost = await db.query<{ cost_millimes: number | null }>(
      "select cost_millimes from public.product_variant_costs where variant_id = $1",
      [small],
    );
    expect(cost.rows[0].cost_millimes).toBe(16000);
  });

  it("numbers documents sequentially per organization", async () => {
    await receipt(owner, [{ variant_id: medium, quantity: 1 }]);
    const numbers = await db.query<{ number: number }>(
      "select number from public.stock_receipts where organization_id = $1 order by number",
      [org],
    );
    expect(numbers.rows.map((r) => r.number)).toEqual([1, 2]);
    expect(await level(main, medium)).toBe(4);
  });

  it("rejects invalid lines without changing stock", async () => {
    const before = await level(main, small);
    for (const [lines, error] of [
      [[{ variant_id: small, quantity: 0 }], "invalid_lines"],
      [[{ variant_id: small, quantity: -3 }], "invalid_lines"],
      [[{ variant_id: small, quantity: 1.5 }], "invalid_lines"],
      [[{ variant_id: small, quantity: "2" }], "invalid_lines"],
      [[{ variant_id: small, quantity: 1, unit_cost_millimes: -1 }], "invalid_lines"],
      [[{ variant_id: small, quantity: 1 }, { variant_id: small, quantity: 2 }], "duplicate_line"],
      [[], "invalid_lines"],
      [[{ variant_id: foreignVariant, quantity: 1 }], "invalid_reference"],
      [[{ variant_id: untracked, quantity: 1 }], "stock_not_tracked"],
    ] as const) {
      await expect(receipt(owner, lines as unknown as Line[]), JSON.stringify(lines)).rejects.toThrow(error);
    }
    await expect(receipt(owner, [{ variant_id: small, quantity: 1 }], { location: closed })).rejects.toThrow("location_inactive");
    expect(await level(main, small)).toBe(before);
  });

  it("is restricted to owner/manager of the organization", async () => {
    await expect(receipt(cashier, [{ variant_id: small, quantity: 1 }])).rejects.toThrow("forbidden");
    await expect(receipt(otherOwner, [{ variant_id: small, quantity: 1 }])).rejects.toThrow("forbidden");
    // Even with its own organization id, another tenant cannot touch our variant or location.
    await expect(
      receipt(otherOwner, [{ variant_id: small, quantity: 1 }], { org: otherOrg, location: main }),
    ).rejects.toThrow("invalid_reference");
  });
});

describe("adjustments with approval", () => {
  it("a cashier proposes, only owner/manager approve, stock moves on approval only", async () => {
    const before = await level(main, small);
    const id = await propose(cashier, [{ variant_id: small, quantity_delta: -2 }]);
    expect(await level(main, small)).toBe(before);
    await expect(review(cashier, id, true)).rejects.toThrow("forbidden");
    await expect(review(otherOwner, id, true)).rejects.toThrow("adjustment_not_found");
    await review(manager, id, true);
    expect(await level(main, small)).toBe(before - 2);
    await expect(review(manager, id, true)).rejects.toThrow("adjustment_not_pending");

    const movement = await db.query<{ reason: string; actor_id: string; movement_type: string }>(
      "select reason, actor_id, movement_type from public.stock_movements where source_id = $1",
      [id],
    );
    expect(movement.rows).toEqual([{ reason: "Casse en réserve", actor_id: manager.id, movement_type: "adjustment" }]);
  });

  it("requires a reason and refuses approvals that would make stock negative", async () => {
    await expect(propose(manager, [{ variant_id: small, quantity_delta: 1 }], " ")).rejects.toThrow("reason_required");
    const before = await level(main, small);
    const id = await propose(manager, [{ variant_id: small, quantity_delta: -1000 }], "Erreur de saisie");
    await expect(review(owner, id, true)).rejects.toThrow("insufficient_stock");
    expect(await level(main, small)).toBe(before);
    const status = await db.query<{ status: string }>("select status from public.stock_adjustments where id = $1", [id]);
    expect(status.rows[0].status).toBe("pending");
    await review(owner, id, false);
    expect(await level(main, small)).toBe(before);
  });
});

describe("transfers", () => {
  it("moves stock between locations atomically", async () => {
    const mainBefore = await level(main, small);
    await transfer(owner, main, depot, [{ variant_id: small, quantity: 4 }]);
    expect(await level(main, small)).toBe(mainBefore - 4);
    expect(await level(depot, small)).toBe(4);
  });

  it("refuses over-transfers, same-location and inactive locations without side effects", async () => {
    const mainBefore = await level(main, small);
    const depotBefore = await level(depot, small);
    await expect(transfer(owner, main, depot, [{ variant_id: small, quantity: 999 }])).rejects.toThrow("insufficient_stock");
    await expect(transfer(owner, main, main, [{ variant_id: small, quantity: 1 }])).rejects.toThrow("same_location");
    await expect(transfer(owner, main, closed, [{ variant_id: small, quantity: 1 }])).rejects.toThrow("location_inactive");
    await expect(transfer(cashier, main, depot, [{ variant_id: small, quantity: 1 }])).rejects.toThrow("forbidden");
    expect(await level(main, small)).toBe(mainBefore);
    expect(await level(depot, small)).toBe(depotBefore);
  });
});

describe("stock counts", () => {
  it("applies counted − expected-at-count-time, keeps later movements, ignores uncounted items", async () => {
    const [{ id: countId }] = await queryAs<{ id: string }>(
      db,
      owner,
      "select public.create_stock_count($1, $2, 'Inventaire mensuel', null, $3) as id",
      [org, main, randomUUID()],
    );
    await expect(
      queryAs(db, owner, "select public.create_stock_count($1, $2, null, null, $3)", [org, main, randomUUID()]),
    ).rejects.toThrow("count_already_open");

    const bookBefore = await level(main, small);
    const mediumBefore = await level(main, medium);
    // Cashier counts 2 fewer S than the books say.
    await queryAs(db, cashier, "select public.record_stock_count($1, $2::jsonb)", [
      countId,
      JSON.stringify([{ variant_id: small, counted_quantity: bookBefore - 2 }]),
    ]);
    // Goods arrive after S was counted: must survive the approval.
    await receipt(owner, [{ variant_id: small, quantity: 6 }]);

    await queryAs(db, cashier, "select public.submit_stock_count($1)", [countId]);
    await expect(
      queryAs(db, cashier, "select public.record_stock_count($1, $2::jsonb)", [
        countId,
        JSON.stringify([{ variant_id: small, counted_quantity: 1 }]),
      ]),
    ).rejects.toThrow("count_not_in_progress");
    await expect(queryAs(db, cashier, "select public.review_stock_count($1, true)", [countId])).rejects.toThrow("forbidden");

    const [{ adjusted }] = await queryAs<{ adjusted: number }>(
      db,
      manager,
      "select public.review_stock_count($1, true) as adjusted",
      [countId],
    );
    expect(adjusted).toBe(1);
    expect(await level(main, small)).toBe(bookBefore - 2 + 6);
    expect(await level(main, medium)).toBe(mediumBefore);
    await expect(queryAs(db, manager, "select public.review_stock_count($1, true)", [countId])).rejects.toThrow(
      "count_not_submitted",
    );
  });

  it("rejecting sends the count back for recounting; an empty count cannot be submitted", async () => {
    const [{ id: countId }] = await queryAs<{ id: string }>(
      db,
      owner,
      "select public.create_stock_count($1, $2, null, array[$3]::uuid[], $4) as id",
      [org, main, medium, randomUUID()],
    );
    await expect(queryAs(db, cashier, "select public.submit_stock_count($1)", [countId])).rejects.toThrow("count_empty");
    await queryAs(db, cashier, "select public.record_stock_count($1, $2::jsonb)", [
      countId,
      JSON.stringify([{ variant_id: medium, counted_quantity: 0 }]),
    ]);
    await queryAs(db, cashier, "select public.submit_stock_count($1)", [countId]);
    await queryAs(db, owner, "select public.review_stock_count($1, false)", [countId]);
    const status = await db.query<{ status: string }>("select status from public.stock_counts where id = $1", [countId]);
    expect(status.rows[0].status).toBe("in_progress");
    await queryAs(db, owner, "select public.cancel_stock_count($1)", [countId]);
  });

  it("other tenants cannot read or record counts", async () => {
    const [{ id: countId }] = await queryAs<{ id: string }>(
      db,
      owner,
      "select public.create_stock_count($1, $2, null, null, $3) as id",
      [org, depot, randomUUID()],
    );
    await expect(
      queryAs(db, otherOwner, "select public.record_stock_count($1, $2::jsonb)", [
        countId,
        JSON.stringify([{ variant_id: small, counted_quantity: 0 }]),
      ]),
    ).rejects.toThrow("count_not_found");
    expect(await queryAs(db, otherOwner, "select * from public.stock_count_items where count_id = $1", [countId])).toEqual([]);
    await queryAs(db, owner, "select public.cancel_stock_count($1)", [countId]);
  });
});

describe("ledger protection and visibility", () => {
  it("nobody writes the ledger or balances directly; history is immutable", async () => {
    await expect(
      queryAs(
        db,
        owner,
        `insert into public.stock_movements (organization_id, location_id, variant_id, quantity_delta, quantity_after, movement_type, source_type, source_id)
         values ($1, $2, $3, 100, 100, 'adjustment', 'stock_adjustment', gen_random_uuid())`,
        [org, main, small],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      queryAs(db, owner, "update public.stock_levels set quantity = 999 where variant_id = $1", [small]),
    ).rejects.toThrow(/permission denied/);
    await expect(db.query("update public.stock_movements set quantity_delta = 1")).rejects.toThrow("stock_ledger_immutable");
    await expect(db.query("delete from public.stock_movements")).rejects.toThrow("stock_ledger_immutable");
    await expect(
      db.query("update public.stock_levels set quantity = -1 where variant_id = $1", [small]),
    ).rejects.toThrow(/check constraint/);
  });

  it("cashiers see quantities and history but not receipt costs", async () => {
    expect((await queryAs(db, cashier, "select * from public.stock_levels")).length).toBeGreaterThan(0);
    expect((await queryAs(db, cashier, "select * from public.stock_movements")).length).toBeGreaterThan(0);
    expect(await queryAs(db, cashier, "select * from public.stock_receipt_lines")).toEqual([]);
    expect(await queryAs(db, cashier, "select * from public.stock_opening_costs")).toEqual([]);
    await expect(queryAs(db, cashier, "select * from public.stock_valuation($1)", [org])).rejects.toThrow("forbidden");
  });

  it("other tenants see no stock data", async () => {
    for (const table of ["stock_levels", "stock_movements", "stock_receipts", "stock_adjustments", "stock_counts", "stock_transfers"]) {
      expect(await queryAs(db, otherOwner, `select * from public.${table} where organization_id = $1`, [org]), table).toEqual([]);
    }
    expect(await queryAs(db, otherOwner, "select * from public.search_variants($1, 'chemise')", [org])).toEqual([]);
    expect(await queryAs(db, otherOwner, "select * from public.stock_overview($1)", [org])).toEqual([]);
  });
});

describe("reports", () => {
  it("overview flags low stock against the variant threshold", async () => {
    // S threshold is 3: bring total S across active locations to exactly 3.
    const total = (await level(main, small)) + (await level(depot, small));
    const id = await propose(owner, [{ variant_id: small, quantity_delta: -(await level(main, small)) }], "Remise à zéro test");
    await review(owner, id, true);
    const depotQty = await level(depot, small);
    const fix = await propose(owner, [{ variant_id: small, quantity_delta: 3 - depotQty }], "Ajustement test", depot);
    await review(owner, fix, true);
    expect(total).toBeGreaterThan(3);

    const low = await queryAs<{ variant_id: string; quantity: number; is_low: boolean }>(
      db,
      cashier,
      "select variant_id, quantity, is_low from public.stock_overview($1, null, '', true)",
      [org],
    );
    expect(low).toEqual([{ variant_id: small, quantity: 3, is_low: true }]);
  });

  it("valuation uses current costs and counts variants without a cost", async () => {
    const [valuation] = await queryAs<{
      total_quantity: number;
      valued_quantity: number;
      total_value_millimes: number;
      variants_without_cost: number;
    }>(db, manager, "select * from public.stock_valuation($1)", [org]);
    const s = (await level(main, small)) + (await level(depot, small));
    const m = (await level(main, medium)) + (await level(depot, medium));
    expect(valuation).toMatchObject({
      total_quantity: s + m,
      valued_quantity: s,
      total_value_millimes: s * 16000,
      variants_without_cost: m > 0 ? 1 : 0,
    });
  });

  it("balances always reconcile with the ledger", async () => {
    expect(await reconciliation()).toEqual([]);
  });
});

describe.runIf(usingRealPostgres)("concurrency (real PostgreSQL)", () => {
  async function freshVariant(quantity: number): Promise<string> {
    const [variant] = await variantIds(owner, org, {
      name: `Concurrent ${randomUUID().slice(0, 8)}`,
      option_names: [],
      variants: [{ option_values: [], price_millimes: 1000 }],
    });
    if (quantity > 0) await opening(owner, [{ variant_id: variant, quantity }]);
    return variant;
  }

  /**
   * Runs `sql` as `user` in a transaction that stays open for `holdMs` after
   * the statement, then starts `second` while the first still holds its locks.
   * Forces the overlap that a naive Promise.all would only hit by chance.
   */
  async function overlapping<T>(
    user: TestUser,
    sql: string,
    params: unknown[],
    second: () => Promise<T>,
    holdMs = 600,
  ): Promise<[PromiseSettledResult<unknown>, PromiseSettledResult<T>]> {
    let started!: () => void;
    const firstStatementDone = new Promise<void>((resolve) => (started = resolve));
    const first = asUser(db, user, async (tx) => {
      const result = await tx.query(sql, params);
      started();
      await tx.query(`select pg_sleep(${holdMs / 1000})`);
      return result.rows;
    });
    first.catch(() => started());
    await firstStatementDone;
    const secondPromise = second();
    return [await Promise.allSettled([first]).then((r) => r[0]), await Promise.allSettled([secondPromise]).then((r) => r[0])];
  }

  it("two simultaneous withdrawals cannot both take the last units", async () => {
    const variant = await freshVariant(10);
    const a = await propose(owner, [{ variant_id: variant, quantity_delta: -6 }], "Sortie A");
    const b = await propose(owner, [{ variant_id: variant, quantity_delta: -6 }], "Sortie B");
    const [first, second] = await overlapping(owner, "select public.review_stock_adjustment($1, true)", [a], () =>
      review(manager, b, true),
    );
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    expect(String((second as PromiseRejectedResult).reason)).toMatch("insufficient_stock");
    expect(await level(main, variant)).toBe(4);
    expect(await reconciliation()).toEqual([]);
  });

  it("the same receipt submitted twice at the same time is applied once", async () => {
    const variant = await freshVariant(0);
    const key = randomUUID();
    const [first, second] = await overlapping(
      owner,
      "select public.post_stock_receipt($1, $2, null, null, null, $3::jsonb, false, $4) as id",
      [org, main, JSON.stringify([{ variant_id: variant, quantity: 7 }]), key],
      () => receipt(manager, [{ variant_id: variant, quantity: 7 }], { key }),
    );
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("fulfilled");
    const firstId = ((first as PromiseFulfilledResult<{ id: string }[]>).value)[0].id;
    expect((second as PromiseFulfilledResult<string>).value).toBe(firstId);
    expect(await level(main, variant)).toBe(7);
  });

  it("two simultaneous opening stocks for the same variant: only one succeeds", async () => {
    const variant = await freshVariant(0);
    const [first, second] = await overlapping(
      owner,
      "select public.record_opening_stock($1, $2, $3::jsonb, $4)",
      [org, main, JSON.stringify([{ variant_id: variant, quantity: 5 }]), randomUUID()],
      () => opening(manager, [{ variant_id: variant, quantity: 8 }]),
    );
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    expect(String((second as PromiseRejectedResult).reason)).toMatch("opening_already_recorded");
    expect(await level(main, variant)).toBe(5);
  });

  it("opposite transfers of several variants never deadlock and keep totals", async () => {
    const v1 = await freshVariant(50);
    const v2 = await freshVariant(50);
    await transfer(owner, main, depot, [
      { variant_id: v1, quantity: 25 },
      { variant_id: v2, quantity: 25 },
    ]);
    const jobs = Array.from({ length: 10 }, (_, i) =>
      i % 2 === 0
        ? transfer(owner, main, depot, [
            { variant_id: v2, quantity: 1 },
            { variant_id: v1, quantity: 1 },
          ])
        : transfer(manager, depot, main, [
            { variant_id: v1, quantity: 1 },
            { variant_id: v2, quantity: 1 },
          ]),
    );
    const results = await Promise.allSettled(jobs);
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    for (const v of [v1, v2]) {
      expect((await level(main, v)) + (await level(depot, v))).toBe(50);
    }
    expect(await reconciliation()).toEqual([]);
  });
});

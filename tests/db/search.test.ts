/**
 * Phase 2 search: accent-insensitive matching, sorting, list filters
 * (sales by local day, unpaid balance, customers with balances), the global
 * search behind the command palette, and RLS (cashiers never see suppliers
 * or purchase orders; other organizations never leak).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createOrganization, createTestDb, createUser, queryAs, type TestDb, type TestUser } from "./harness";

let db: TestDb;
let owner: TestUser;
let cashier: TestUser;
let otherOwner: TestUser;
let org: string;
let otherOrg: string;
let location: string;
let cash: string;
let creme: string; // "Crème hydratante", 32 000
let cafe: string; // "CAFÉ moulu", 9 500, SKU CAF-250
let tshirt: string; // "T-shirt 100% coton", 25 000
let leila: string;
let supplier: string;
let poNumber: number;
let creditSale: string;
let cashSale: string;

async function product(user: TestUser, organizationId: string, name: string, price: number, extra: Record<string, unknown> = {}) {
  const [{ id }] = await queryAs<{ id: string }>(db, user, "select public.create_product($1, $2::jsonb) as id", [
    organizationId,
    JSON.stringify({ name, option_names: [], variants: [{ option_values: [], price_millimes: price, ...extra }] }),
  ]);
  return (await db.query<{ id: string }>("select id from public.product_variants where product_id = $1", [id])).rows[0].id;
}

const productId = async (variantId: string) =>
  (await db.query<{ id: string }>("select product_id as id from public.product_variants where id = $1", [variantId])).rows[0].id;

function finalize(user: TestUser, variantId: string, quantity: number, paid: number, customer: string | null = null) {
  return queryAs<{ id: string }>(db, user, "select public.finalize_sale($1, null, $2, $3, $4::jsonb, 0, null, $5::jsonb, $6) as id", [
    org,
    location,
    customer,
    JSON.stringify([{ variant_id: variantId, quantity }]),
    JSON.stringify(paid > 0 ? [{ method_id: cash, amount_millimes: paid }] : []),
    randomUUID(),
  ]).then((r) => r[0].id);
}

/** Moves a finalized sale to another instant (test setup only: bypasses the immutability trigger). */
async function backdate(saleId: string, at: string) {
  await db.transaction(async (tx) => {
    await tx.exec("set local session_replication_role = replica");
    await tx.query("update public.sales set finalized_at = $2, created_at = $2 where id = $1", [saleId, at]);
  });
}

beforeAll(async () => {
  db = await createTestDb();
  owner = await createUser(db, "owner@recherche.tn");
  cashier = await createUser(db, "cashier@recherche.tn");
  otherOwner = await createUser(db, "owner@ailleurs.tn");
  org = await createOrganization(db, owner, "Boutique Recherche");
  otherOrg = await createOrganization(db, otherOwner, "Ailleurs");
  await addMember(db, org, cashier, "cashier");
  location = (await db.query<{ id: string }>("select id from public.locations where organization_id = $1", [org])).rows[0].id;
  cash = (
    await db.query<{ id: string }>("select id from public.payment_methods where organization_id = $1 and kind = 'cash'", [org])
  ).rows[0].id;

  creme = await product(owner, org, "Crème hydratante", 32_000);
  cafe = await product(owner, org, "CAFÉ moulu", 9_500, { sku: "CAF-250", barcode: "6199990000017" });
  tshirt = await product(owner, org, "T-shirt 100% coton", 25_000);
  await product(otherOwner, otherOrg, "Crème ailleurs", 1_000);

  await queryAs(db, owner, "select public.record_opening_stock($1, $2, $3::jsonb, $4)", [
    org,
    location,
    JSON.stringify([
      { variant_id: creme, quantity: 3 },
      { variant_id: cafe, quantity: 40 },
      { variant_id: tshirt, quantity: 12 },
    ]),
    randomUUID(),
  ]);

  [{ id: leila }] = await queryAs<{ id: string }>(
    db,
    owner,
    "insert into public.customers (organization_id, name, phone) values ($1, 'Leïla Ben Ammar', '+216 22 333 444') returning id",
    [org],
  );
  await queryAs(db, owner, "insert into public.customers (organization_id, name) values ($1, 'Karim Trabelsi')", [org]);
  await queryAs(db, otherOwner, "insert into public.customers (organization_id, name) values ($1, 'Leila Ailleurs')", [otherOrg]);

  [{ id: supplier }] = await queryAs<{ id: string }>(
    db,
    owner,
    "insert into public.suppliers (organization_id, name) values ($1, 'Société Générale Textile') returning id",
    [org],
  );
  const [{ id: po }] = await queryAs<{ id: string }>(
    db,
    owner,
    "select public.save_purchase_order($1, null, $2, $3, null, null, null, $4::jsonb) as id",
    [org, supplier, location, JSON.stringify([{ variant_id: tshirt, quantity: 5, unit_cost_millimes: 12_000 }])],
  );
  [{ n: poNumber }] = await queryAs<{ n: number }>(db, owner, "select public.place_purchase_order($1) as n", [po]);

  creditSale = await finalize(cashier, creme, 2, 20_000, leila); // 64 000, 44 000 due
  cashSale = await finalize(cashier, tshirt, 1, 25_000); // 25 000, paid
  // 2026-03-10 23:30 UTC = 2026-03-11 00:30 in Tunis (UTC+1).
  await backdate(creditSale, "2026-03-10T23:30:00Z");
  await backdate(cashSale, "2026-03-10T12:00:00Z");
});

afterAll(async () => {
  await db.close();
});

describe("accent- and case-insensitive product search", () => {
  type Row = { name: string; total_count: number };
  const search = (q: string, sort = "name") =>
    queryAs<Row>(db, cashier, "select name, total_count from public.search_products($1, $2, p_sort => $3)", [org, q, sort]);

  it.each([
    ["creme", "Crème hydratante"],
    ["CRÈME", "Crème hydratante"],
    ["cafe", "CAFÉ moulu"],
    ["Café", "CAFÉ moulu"],
    ["caf-2", "CAFÉ moulu"], // SKU, case-insensitive
    ["6199990000017", "CAFÉ moulu"], // exact barcode
    ["100%", "T-shirt 100% coton"], // % is literal
  ])("%s → %s", async (q, expected) => {
    expect((await search(q)).map((r) => r.name)).toEqual([expected]);
  });

  it("never returns another organization's products", async () => {
    expect((await search("ailleurs")).length).toBe(0);
  });

  it("sorts by name, price and recency", async () => {
    expect((await search("")).map((r) => r.name)).toEqual(["CAFÉ moulu", "Crème hydratante", "T-shirt 100% coton"]);
    expect((await search("", "name_desc")).map((r) => r.name)).toEqual(["T-shirt 100% coton", "Crème hydratante", "CAFÉ moulu"]);
    expect((await search("", "price_asc")).map((r) => r.name)).toEqual(["CAFÉ moulu", "T-shirt 100% coton", "Crème hydratante"]);
    expect((await search("", "price_desc")).map((r) => r.name)).toEqual(["Crème hydratante", "T-shirt 100% coton", "CAFÉ moulu"]);
    expect((await search("", "recent")).map((r) => r.name)).toEqual(["T-shirt 100% coton", "CAFÉ moulu", "Crème hydratante"]);
    expect((await search("", "nonsense"))[0].total_count).toBe(3);
  });

  it("the cart / stock variant picker is accent-insensitive too", async () => {
    const rows = await queryAs<{ product_name: string }>(db, cashier, "select product_name from public.search_variants($1, 'creme')", [org]);
    expect(rows.map((r) => r.product_name)).toEqual(["Crème hydratante"]);
  });
});

describe("stock_overview", () => {
  it("is accent-insensitive and sorts by quantity", async () => {
    const q = (sort: string, query = "") =>
      queryAs<{ product_name: string; quantity: number }>(
        db,
        cashier,
        "select product_name, quantity from public.stock_overview($1, p_query => $2, p_sort => $3)",
        [org, query, sort],
      );
    expect((await q("name", "CREME")).map((r) => r.product_name)).toEqual(["Crème hydratante"]);
    expect((await q("quantity_asc")).map((r) => r.quantity)).toEqual([1, 11, 40]);
    expect((await q("quantity_desc")).map((r) => r.quantity)).toEqual([40, 11, 1]);
  });
});

describe("search_customers", () => {
  type Row = { name: string; balance_millimes: number; sales_count: number; total_count: number };
  const q = (query: string, opts: { due?: boolean; sort?: string; user?: TestUser } = {}) =>
    queryAs<Row>(
      db,
      opts.user ?? cashier,
      "select name, balance_millimes, sales_count, total_count from public.search_customers($1, $2, $3, $4)",
      [org, query, opts.due ?? false, opts.sort ?? "name"],
    );

  it("finds customers by name without accents or by phone, with their balance", async () => {
    expect(await q("leila")).toEqual([{ name: "Leïla Ben Ammar", balance_millimes: 44_000, sales_count: 1, total_count: 1 }]);
    expect((await q("333 4")).map((r) => r.name)).toEqual(["Leïla Ben Ammar"]);
  });

  it("filters customers who owe money and sorts by balance", async () => {
    expect((await q("", { due: true })).map((r) => r.name)).toEqual(["Leïla Ben Ammar"]);
    expect((await q("", { sort: "balance_desc" })).map((r) => r.name)).toEqual(["Leïla Ben Ammar", "Karim Trabelsi"]);
  });

  it("is scoped to the caller's organizations", async () => {
    expect(await queryAs(db, otherOwner, "select * from public.search_customers($1)", [org])).toEqual([]);
  });
});

describe("search_sales", () => {
  type Row = { sale_id: string; due_millimes: number; customer_name: string | null };
  const q = (args: { from?: string; to?: string; due?: boolean; query?: string; sort?: string; customer?: string; user?: TestUser }) =>
    queryAs<Row>(
      db,
      args.user ?? cashier,
      `select sale_id, due_millimes, customer_name
       from public.search_sales($1, 'finalized', $2::date, $3::date, $4, $5, $6, $7)`,
      [org, args.from ?? null, args.to ?? null, args.customer ?? null, args.due ?? false, args.query ?? "", args.sort ?? "recent"],
    );

  it("filters by calendar day in the organization's time zone (Africa/Tunis)", async () => {
    expect((await q({ from: "2026-03-11", to: "2026-03-11" })).map((r) => r.sale_id)).toEqual([creditSale]);
    expect((await q({ from: "2026-03-10", to: "2026-03-10" })).map((r) => r.sale_id)).toEqual([cashSale]);
    expect((await q({ from: "2026-03-10", to: "2026-03-11" })).length).toBe(2);
    expect((await q({ from: "2026-03-12" })).length).toBe(0);
  });

  it("filters unpaid sales, by customer, number or customer name", async () => {
    expect(await q({ due: true })).toEqual([{ sale_id: creditSale, due_millimes: 44_000, customer_name: "Leïla Ben Ammar" }]);
    expect((await q({ customer: leila })).map((r) => r.sale_id)).toEqual([creditSale]);
    expect((await q({ query: "leila" })).map((r) => r.sale_id)).toEqual([creditSale]);
    const number = (await db.query<{ number: number }>("select number from public.sales where id = $1", [cashSale])).rows[0].number;
    expect((await q({ query: `n° ${String(number).padStart(6, "0")}` })).map((r) => r.sale_id)).toEqual([cashSale]);
  });

  it("sorts by date and amount", async () => {
    expect((await q({ sort: "recent" })).map((r) => r.sale_id)).toEqual([creditSale, cashSale]);
    expect((await q({ sort: "oldest" })).map((r) => r.sale_id)).toEqual([cashSale, creditSale]);
    expect((await q({ sort: "total_asc" })).map((r) => r.sale_id)).toEqual([cashSale, creditSale]);
  });

  it("returns nothing for an organization the caller does not belong to", async () => {
    expect(await q({ user: otherOwner })).toEqual([]);
  });
});

describe("global_search (command palette)", () => {
  type Row = { kind: string; id: string; label: string | null; number: number | null };
  const search = (user: TestUser, query: string, organizationId = org) =>
    queryAs<Row>(db, user, "select kind, id, label, number from public.global_search($1, $2)", [organizationId, query]);

  it("finds products and customers without accents", async () => {
    expect((await search(cashier, "creme")).map((r) => [r.kind, r.label])).toEqual([["product", "Crème hydratante"]]);
    expect((await search(cashier, "leila")).map((r) => [r.kind, r.label])).toEqual([["customer", "Leïla Ben Ammar"]]);
  });

  it("shows suppliers and purchase orders to the owner only (RLS)", async () => {
    expect((await search(owner, "societe")).map((r) => [r.kind, r.id])).toEqual([["supplier", supplier]]);
    expect(await search(cashier, "societe")).toEqual([]);
    const byNumber = await search(owner, `BC-${String(poNumber).padStart(6, "0")}`);
    expect(byNumber.some((r) => r.kind === "purchase_order" && r.number === poNumber)).toBe(true);
    expect((await search(cashier, String(poNumber))).some((r) => r.kind === "purchase_order")).toBe(false);
  });

  it("finds a sale by its number", async () => {
    const number = (await db.query<{ number: number }>("select number from public.sales where id = $1", [creditSale])).rows[0].number;
    expect((await search(cashier, String(number))).filter((r) => r.kind === "sale").map((r) => r.id)).toEqual([creditSale]);
  });

  it("ignores one-letter queries and other organizations", async () => {
    expect(await search(owner, "c")).toEqual([]);
    expect(await search(otherOwner, "creme")).toEqual([]);
    expect((await search(otherOwner, "creme", otherOrg)).map((r) => r.label)).toEqual(["Crème ailleurs"]);
  });

  it("anon cannot search; the search key helper works for signed-in users", async () => {
    await expect(queryAs(db, cashier, "select private.search_key('É')")).resolves.toEqual([{ search_key: "e" }]);
    const anonCanSearch = await db.query<{ ok: boolean }>(
      "select has_function_privilege('anon', 'public.global_search(uuid, text, integer)', 'execute') as ok",
    );
    expect(anonCanSearch.rows[0].ok).toBe(false);
  });
});

describe("product ids", () => {
  it("global search returns the product id the catalog links to", async () => {
    const [row] = await queryAs<{ id: string }>(db, cashier, "select id from public.global_search($1, 'moulu')", [org]);
    expect(row.id).toBe(await productId(cafe));
  });
});

describe("search functions can be inlined by the planner (audit P3)", () => {
  // A SET clause (e.g. search_path) stops Postgres from inlining an SQL
  // function, so the query is planned without the caller's constants: 3x
  // slower at 10 000 articles. These are SECURITY INVOKER (RLS applies) and
  // use schema-qualified names only; SECURITY DEFINER functions keep their SET.
  const INVOKER_SEARCH = ["search_products", "search_variants", "stock_overview", "search_customers", "search_sales", "global_search"];

  it("read-only search functions carry no SET clause and stay SECURITY INVOKER", async () => {
    const rows = await db.query<{ proname: string; proconfig: string[] | null; prosecdef: boolean; provolatile: string }>(
      "select proname, proconfig, prosecdef, provolatile from pg_proc where pronamespace = 'public'::regnamespace and proname = any($1) order by proname",
      [INVOKER_SEARCH],
    );
    expect(rows.rows.map((r) => r.proname)).toEqual([...INVOKER_SEARCH].sort());
    for (const r of rows.rows) expect({ fn: r.proname, config: r.proconfig, definer: r.prosecdef, volatility: r.provolatile }).toEqual({ fn: r.proname, config: null, definer: false, volatility: "s" });
  });

  it("every SECURITY DEFINER function still pins search_path", async () => {
    const rows = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p
       where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prosecdef
         and not coalesce(p.proconfig @> array['search_path=""'], false)`,
    );
    expect(rows.rows).toEqual([]);
  });
});

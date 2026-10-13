/**
 * Milestone 2 catalog: products, variants, costs, categories, suppliers,
 * search, CSV import commit, rate limits — against the real migrations.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  asAnon,
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

type Variant = {
  sku?: string | null;
  barcode?: string | null;
  option_values?: string[];
  price_millimes: number;
  cost_millimes?: number | null;
  low_stock_threshold?: number | null;
};

function product(name: string, variants: Variant[], extra: Record<string, unknown> = {}) {
  return { name, option_names: [], track_stock: true, variants, ...extra };
}

async function createProduct(user: TestUser, organizationId: string, payload: unknown): Promise<string> {
  const rows = await queryAs<{ id: string }>(db, user, "select public.create_product($1, $2::jsonb) as id", [
    organizationId,
    JSON.stringify(payload),
  ]);
  return rows[0].id;
}

beforeAll(async () => {
  db = await createTestDb();
  owner = await createUser(db, "owner@boutique.tn");
  manager = await createUser(db, "manager@boutique.tn");
  cashier = await createUser(db, "cashier@boutique.tn");
  otherOwner = await createUser(db, "owner@autre.tn");
  org = await createOrganization(db, owner, "Boutique Mode");
  otherOrg = await createOrganization(db, otherOwner, "Autre Boutique");
  await addMember(db, org, manager, "manager");
  await addMember(db, org, cashier, "cashier");
});

afterAll(async () => {
  await db.close();
});

describe("create_product", () => {
  it("creates a product with variants and cost rows atomically", async () => {
    const id = await createProduct(
      manager,
      org,
      product(
        "T-shirt col V",
        [
          { sku: "TSV-S-NOIR", barcode: "6190000000011", option_values: ["S", "Noir"], price_millimes: 25000, cost_millimes: 12500 },
          { sku: "TSV-M-NOIR", option_values: ["M", "Noir"], price_millimes: 25000 },
        ],
        { option_names: ["Taille", "Couleur"] },
      ),
    );
    const variants = await db.query<{ sku: string; cost_millimes: number | null }>(
      `select v.sku, c.cost_millimes from public.product_variants v
       join public.product_variant_costs c on c.variant_id = v.id
       where v.product_id = $1 order by v.sku`,
      [id],
    );
    expect(variants.rows).toEqual([
      { sku: "TSV-M-NOIR", cost_millimes: null },
      { sku: "TSV-S-NOIR", cost_millimes: 12500 },
    ]);
  });

  it("is refused to cashiers, other tenants and anonymous callers", async () => {
    await expect(createProduct(cashier, org, product("X", [{ price_millimes: 1 }]))).rejects.toThrow("forbidden");
    await expect(createProduct(otherOwner, org, product("X", [{ price_millimes: 1 }]))).rejects.toThrow("forbidden");
    await expect(
      asAnon(db, (tx) => tx.query("select public.create_product($1, '{}'::jsonb)", [org])),
    ).rejects.toThrow(/permission denied/);
  });

  it("rejects duplicate SKUs case-insensitively within an organization, but not across tenants", async () => {
    await expect(
      createProduct(owner, org, product("Autre", [{ sku: "tsv-s-noir", price_millimes: 1000 }])),
    ).rejects.toThrow("duplicate_sku");
    await expect(
      createProduct(otherOwner, otherOrg, product("Chez l'autre", [{ sku: "TSV-S-NOIR", price_millimes: 1000 }])),
    ).resolves.toBeTruthy();
  });

  it("rejects duplicate barcodes and duplicate option combinations", async () => {
    await expect(
      createProduct(owner, org, product("Code", [{ barcode: "6190000000011", price_millimes: 1000 }])),
    ).rejects.toThrow("duplicate_barcode");
    await expect(
      createProduct(
        owner,
        org,
        product(
          "Jean",
          [
            { option_values: ["38"], price_millimes: 60000 },
            { option_values: ["38"], price_millimes: 60000 },
          ],
          { option_names: ["Taille"] },
        ),
      ),
    ).rejects.toThrow("duplicate_variant_options");
  });

  it("rejects invalid data without leaving a partial product", async () => {
    const before = await db.query<{ n: number }>("select count(*)::int as n from public.products");
    await expect(
      createProduct(owner, org, product("Prix négatif", [{ price_millimes: 1000 }, { price_millimes: -5 }])),
    ).rejects.toThrow("invalid_product");
    await expect(createProduct(owner, org, product("Sans variante", []))).rejects.toThrow("invalid_variant_count");
    await expect(
      createProduct(owner, org, product("Options", [{ option_values: ["S"], price_millimes: 1 }])),
    ).rejects.toThrow("variant_options_mismatch");
    const after = await db.query<{ n: number }>("select count(*)::int as n from public.products");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("cannot reference another tenant's category or supplier", async () => {
    const [{ id: foreignCategory }] = await queryAs<{ id: string }>(
      db,
      otherOwner,
      "insert into public.categories (organization_id, name) values ($1, 'Chaussures') returning id",
      [otherOrg],
    );
    await expect(
      createProduct(owner, org, product("Basket", [{ price_millimes: 1000 }], { category_id: foreignCategory })),
    ).rejects.toThrow("invalid_reference");
  });
});

describe("direct table access", () => {
  let productId: string;
  let variantId: string;

  beforeAll(async () => {
    productId = await createProduct(
      owner,
      org,
      product("Rouge à lèvres", [{ sku: "RAL-01", option_values: ["Rose"], price_millimes: 18500, cost_millimes: 9000 }], {
        option_names: ["Teinte"],
      }),
    );
    variantId = (
      await db.query<{ id: string }>("select id from public.product_variants where product_id = $1", [productId])
    ).rows[0].id;
  });

  it("cashiers read products and variants but never purchase costs", async () => {
    expect(await queryAs(db, cashier, "select id from public.products where id = $1", [productId])).toHaveLength(1);
    expect(await queryAs(db, cashier, "select id from public.product_variants where id = $1", [variantId])).toHaveLength(1);
    expect(await queryAs(db, cashier, "select * from public.product_variant_costs")).toEqual([]);
    const forManager = await queryAs<{ cost_millimes: number }>(
      db,
      manager,
      "select cost_millimes from public.product_variant_costs where variant_id = $1",
      [variantId],
    );
    expect(forManager).toEqual([{ cost_millimes: 9000 }]);
  });

  it("other tenants see nothing", async () => {
    expect(await queryAs(db, otherOwner, "select * from public.products where organization_id = $1", [org])).toEqual([]);
    expect(await queryAs(db, otherOwner, "select * from public.product_variants where id = $1", [variantId])).toEqual([]);
    const updated = await queryAs(
      db,
      otherOwner,
      "update public.product_variants set price_millimes = 1 where id = $1 returning id",
      [variantId],
    );
    expect(updated).toEqual([]);
  });

  it("cashiers cannot change prices; managers can, and the change is audited", async () => {
    expect(
      await queryAs(db, cashier, "update public.product_variants set price_millimes = 1 where id = $1 returning id", [
        variantId,
      ]),
    ).toEqual([]);
    await queryAs(db, manager, "update public.product_variants set price_millimes = 19900 where id = $1", [variantId]);
    const audit = await db.query<{ actor_id: string; details: { price_millimes: number[] } }>(
      `select actor_id, details from public.audit_logs
       where entity_id = $1 and action = 'variant.updated' order by created_at desc limit 1`,
      [variantId],
    );
    expect(audit.rows[0]).toEqual({ actor_id: manager.id, details: { price_millimes: [18500, 19900] } });
  });

  it("products cannot be inserted directly, deleted, or have their options changed", async () => {
    await expect(
      queryAs(db, owner, "insert into public.products (organization_id, name) values ($1, 'Direct')", [org]),
    ).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, owner, "delete from public.products where id = $1", [productId])).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      queryAs(db, owner, "update public.products set option_names = '{Couleur}' where id = $1", [productId]),
    ).rejects.toThrow(/permission denied/);
  });

  it("a variant added directly must match the product's options", async () => {
    await expect(
      queryAs(
        db,
        manager,
        `insert into public.product_variants (organization_id, product_id, option_values, price_millimes)
         values ($1, $2, '{Rose,Mat}', 1000)`,
        [org, productId],
      ),
    ).rejects.toThrow("variant_options_mismatch");
    const added = await queryAs(
      db,
      manager,
      `insert into public.product_variants (organization_id, product_id, option_values, price_millimes)
       values ($1, $2, '{Nude}', 18500) returning id`,
      [org, productId],
    );
    expect(added).toHaveLength(1);
  });

  it("save_variant updates price and cost together, and is all-or-nothing", async () => {
    const save = (user: TestUser, variant: Record<string, unknown>, id: string | null = variantId) =>
      queryAs<{ id: string }>(db, user, "select public.save_variant($1, $2, $3, $4::jsonb) as id", [
        org,
        productId,
        id,
        JSON.stringify(variant),
      ]);
    const base = { sku: "RAL-01", option_values: ["Rose"], price_millimes: 20500, cost_millimes: 9500 };
    await save(manager, base);
    const after = await db.query<{ price_millimes: number; cost_millimes: number }>(
      `select v.price_millimes, c.cost_millimes from public.product_variants v
       join public.product_variant_costs c on c.variant_id = v.id where v.id = $1`,
      [variantId],
    );
    expect(after.rows[0]).toEqual({ price_millimes: 20500, cost_millimes: 9500 });

    // Invalid cost → nothing changes (price update rolled back too).
    await expect(save(manager, { ...base, price_millimes: 1, cost_millimes: -1 })).rejects.toThrow("invalid_product");
    const unchanged = await db.query<{ price_millimes: number }>("select price_millimes from public.product_variants where id = $1", [
      variantId,
    ]);
    expect(unchanged.rows[0].price_millimes).toBe(20500);

    await expect(save(cashier, base)).rejects.toThrow("forbidden");
    await expect(
      queryAs(db, otherOwner, "select public.save_variant($1, $2, $3, $4::jsonb)", [otherOrg, productId, variantId, JSON.stringify(base)]),
    ).rejects.toThrow("invalid_reference");
  });

  it("a variant cannot be attached to another tenant's product", async () => {
    await expect(
      queryAs(
        db,
        otherOwner,
        `insert into public.product_variants (organization_id, product_id, option_values, price_millimes)
         values ($1, $2, '{Noir}', 1000)`,
        [otherOrg, productId],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("deleting a category un-categorizes its products", async () => {
    const [{ id: categoryId }] = await queryAs<{ id: string }>(
      db,
      owner,
      "insert into public.categories (organization_id, name) values ($1, 'Maquillage') returning id",
      [org],
    );
    await queryAs(db, owner, "update public.products set category_id = $1 where id = $2", [categoryId, productId]);
    await queryAs(db, manager, "delete from public.categories where id = $1", [categoryId]);
    const rows = await db.query<{ category_id: string | null }>("select category_id from public.products where id = $1", [
      productId,
    ]);
    expect(rows.rows[0].category_id).toBeNull();
    await expect(
      queryAs(db, cashier, "delete from public.categories where organization_id = $1 returning id", [org]),
    ).resolves.toEqual([]);
  });

  it("suppliers are visible to owner/manager only", async () => {
    await queryAs(db, manager, "insert into public.suppliers (organization_id, name, phone) values ($1, 'Grossiste Sfax', '74 000 000')", [
      org,
    ]);
    expect(await queryAs(db, cashier, "select * from public.suppliers")).toEqual([]);
    expect(await queryAs(db, owner, "select name from public.suppliers")).toEqual([{ name: "Grossiste Sfax" }]);
  });
});

describe("search", () => {
  beforeAll(async () => {
    await createProduct(owner, org, product("Sac à main cuir", [{ sku: "SAC-CUIR-01", barcode: "6191111111111", price_millimes: 89000 }]));
    await createProduct(owner, org, product("Sac 100% coton", [{ sku: "SAC_COTON", price_millimes: 15000 }]));
    await createProduct(otherOwner, otherOrg, product("Sac concurrent", [{ sku: "SAC-X", price_millimes: 1 }]));
  });

  type Row = { name: string; total_count: number };
  const search = (user: TestUser, organizationId: string, q: string) =>
    queryAs<Row>(db, user, "select name, total_count from public.search_products($1, $2)", [organizationId, q]);

  it("matches name, partial SKU and exact barcode", async () => {
    expect((await search(cashier, org, "sac")).map((r) => r.name)).toEqual(["Sac 100% coton", "Sac à main cuir"]);
    expect((await search(cashier, org, "cuir-0")).map((r) => r.name)).toEqual(["Sac à main cuir"]);
    expect((await search(cashier, org, "6191111111111")).map((r) => r.name)).toEqual(["Sac à main cuir"]);
  });

  it("treats % and _ literally", async () => {
    expect((await search(owner, org, "100%")).map((r) => r.name)).toEqual(["Sac 100% coton"]);
    expect((await search(owner, org, "sac_")).map((r) => r.name)).toEqual(["Sac 100% coton"]);
  });

  it("never returns another tenant's products, even when asked for its id", async () => {
    expect(await search(owner, otherOrg, "sac")).toEqual([]);
  });

  it("find_variant_by_code looks up barcode or SKU exactly", async () => {
    const rows = await queryAs<{ product_name: string }>(
      db,
      cashier,
      "select product_name from public.find_variant_by_code($1, $2)",
      [org, "sac-cuir-01"],
    );
    expect(rows).toEqual([{ product_name: "Sac à main cuir" }]);
  });
});

describe("catalog import", () => {
  const payload = [
    {
      name: "Robe d'été",
      category_name: "Robes",
      supplier_name: "Atelier Nabeul",
      option_names: ["Taille"],
      track_stock: true,
      variants: [
        { sku: "ROBE-S", option_values: ["S"], price_millimes: 45000, cost_millimes: 20000 },
        { sku: "ROBE-M", option_values: ["M"], price_millimes: 45000, cost_millimes: 20000 },
      ],
    },
    {
      name: "Foulard",
      category_name: "robes",
      option_names: [],
      track_stock: true,
      variants: [{ barcode: "6192222222222", option_values: [], price_millimes: 12000 }],
    },
  ];

  const stage = (user: TestUser, organizationId: string, products: unknown) =>
    queryAs<{ id: string }>(db, user, "select public.stage_catalog_import($1, 'articles.csv', $2::jsonb) as id", [
      organizationId,
      JSON.stringify(products),
    ]).then((rows) => rows[0].id);
  const commit = (user: TestUser, batchId: string) =>
    queryAs<{ result: Record<string, number> }>(db, user, "select public.commit_catalog_import($1) as result", [
      batchId,
    ]).then((rows) => rows[0].result);

  it("commits once: creates categories (case-insensitive), suppliers, products and costs", async () => {
    const batchId = await stage(manager, org, payload);
    const result = await commit(manager, batchId);
    expect(result).toEqual({ products_created: 2, variants_created: 3, categories_created: 1, suppliers_created: 1 });

    const robe = await db.query<{ category: string; supplier: string }>(
      `select c.name as category, s.name as supplier from public.products p
       join public.categories c on c.id = p.category_id join public.suppliers s on s.id = p.supplier_id
       where p.organization_id = $1 and p.name = 'Robe d''été'`,
      [org],
    );
    expect(robe.rows).toEqual([{ category: "Robes", supplier: "Atelier Nabeul" }]);

    await expect(commit(manager, batchId)).rejects.toThrow("import_already_committed");
  });

  it("is all-or-nothing and never merges into existing products", async () => {
    const before = await db.query<{ n: number }>("select count(*)::int as n from public.products where organization_id = $1", [
      org,
    ]);
    const batchId = await stage(owner, org, [
      { name: "Nouveau produit", option_names: [], variants: [{ option_values: [], price_millimes: 1000 }] },
      { name: "foulard", option_names: [], variants: [{ option_values: [], price_millimes: 1000 }] },
    ]);
    await expect(commit(owner, batchId)).rejects.toThrow("import_product_exists");
    const after = await db.query<{ n: number }>("select count(*)::int as n from public.products where organization_id = $1", [
      org,
    ]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("is restricted to owner/manager of the batch's organization", async () => {
    await expect(stage(cashier, org, payload)).rejects.toThrow("forbidden");
    const batchId = await stage(owner, org, [
      { name: "Produit privé", option_names: [], variants: [{ option_values: [], price_millimes: 1 }] },
    ]);
    await expect(commit(otherOwner, batchId)).rejects.toThrow("import_not_found");
    await expect(commit(cashier, batchId)).rejects.toThrow("forbidden");
    expect(await queryAs(db, cashier, "select * from public.catalog_import_batches")).toEqual([]);
  });

  it("rejects oversized payloads", async () => {
    const many = Array.from({ length: 2001 }, (_, i) => ({ name: `P${i}`, variants: [] }));
    await expect(stage(owner, org, many)).rejects.toThrow("import_invalid_payload");
  });

  it.runIf(usingRealPostgres)("two simultaneous commits of the same batch import it exactly once", async () => {
    const batchId = await stage(owner, org, [
      { name: "Concurrent", option_names: [], variants: [{ sku: "CONC-1", option_values: [], price_millimes: 1 }] },
    ]);
    const results = await Promise.allSettled([commit(owner, batchId), commit(manager, batchId)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason)).toMatch("import_already_committed");
    const count = await db.query<{ n: number }>("select count(*)::int as n from public.products where name = 'Concurrent'");
    expect(count.rows[0].n).toBe(1);
  });
});

describe("rate limits", () => {
  it("caps invitations at 30 per organization per hour", async () => {
    const rlOwner = await createUser(db, "rl@boutique.tn");
    const rlOrg = await createOrganization(db, rlOwner, "Rate Limit Shop");
    for (let i = 0; i < 30; i++) {
      await queryAs(db, rlOwner, "select public.create_invitation($1, $2, 'cashier')", [rlOrg, `c${i}@rl.tn`]);
    }
    await expect(
      queryAs(db, rlOwner, "select public.create_invitation($1, 'c31@rl.tn', 'cashier')", [rlOrg]),
    ).rejects.toThrow("rate_limited");
  });

  it("caps import staging at 30 per organization per hour", async () => {
    const rlOwner = await createUser(db, "rl2@boutique.tn");
    const rlOrg = await createOrganization(db, rlOwner, "Import Limit Shop");
    const small = JSON.stringify([{ name: "x", option_names: [], variants: [] }]);
    for (let i = 0; i < 30; i++) {
      await queryAs(db, rlOwner, "select public.stage_catalog_import($1, 'a.csv', $2::jsonb)", [rlOrg, small]);
    }
    await expect(
      queryAs(db, rlOwner, "select public.stage_catalog_import($1, 'a.csv', $2::jsonb)", [rlOrg, small]),
    ).rejects.toThrow("rate_limited");
  });
});

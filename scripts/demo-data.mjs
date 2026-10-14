#!/usr/bin/env node
/**
 * Loads demo data into ONE existing organization of the LOCAL database:
 * categories, suppliers, articles with variants, opening stock, customers,
 * sales (cash, card, split, discount, credit) and a partial return.
 *
 *   node scripts/demo-data.mjs "happy security"
 *
 * Safety:
 *   - refuses any database that is not on localhost / 127.0.0.1;
 *   - acts AS the organization's owner through the app's own SQL functions
 *     (RLS, stock ledger, numbering, cost snapshots and audit all apply);
 *   - one transaction: everything or nothing; consistency checks must pass
 *     before it commits;
 *   - refuses to run twice on the same organization.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";

const orgName = process.argv[2];
const url = process.env.DEMO_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!orgName) {
  console.error('Usage: node scripts/demo-data.mjs "<organization name>"');
  process.exit(1);
}
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error("Refusing to load demo data into a non-local database.");
  process.exit(1);
}

/** EAN-13 with a valid check digit (619 = Tunisia GS1 prefix; numbers are fictitious). */
function ean13(body12) {
  const sum = [...body12].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return body12 + ((10 - (sum % 10)) % 10);
}
let barcodeSeq = 100;
const nextBarcode = () => ean13(`619990${String(barcodeSeq++).padStart(6, "0")}`);
const dt = (dinars) => Math.round(dinars * 1000); // demo constants only

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
const CATEGORIES = ["Vêtements", "Chaussures", "Accessoires", "Cosmétiques", "Services"];
const SUPPLIERS = [
  { name: "Grossiste Textile Sousse", phone: "+216 73 000 111", email: "contact@textile-sousse.test" },
  { name: "Beauté Distribution Tunis", phone: "+216 71 000 222", email: "commandes@beaute-tunis.test" },
  { name: "Maroquinerie Nabeul", phone: "+216 72 000 333", email: null },
];

/** options: [[name, [values…]], …]; stock: quantity per variant (in combination order). */
const PRODUCTS = [
  {
    name: "T-shirt coton col rond", category: "Vêtements", supplier: "Grossiste Textile Sousse", sku: "TSH",
    options: [["Taille", ["S", "M", "L", "XL"]], ["Couleur", ["Blanc", "Noir"]]],
    price: 25, cost: 11.5, threshold: 3, stock: [6, 8, 10, 12, 9, 7, 4, 2],
  },
  {
    name: "Jean slim homme", category: "Vêtements", supplier: "Grossiste Textile Sousse", sku: "JEA",
    options: [["Taille", ["38", "40", "42", "44"]]], price: 79, cost: 38, threshold: 2, stock: [3, 6, 5, 1],
  },
  {
    name: "Robe d'été en lin", category: "Vêtements", supplier: "Grossiste Textile Sousse", sku: "ROB",
    options: [["Taille", ["S", "M", "L"]]], price: 89, cost: 42, threshold: 2, stock: [4, 5, 3],
  },
  {
    name: "Sneakers blanches", category: "Chaussures", supplier: "Grossiste Textile Sousse", sku: "SNK",
    options: [["Pointure", ["38", "39", "40", "41", "42", "43"]]], price: 129, cost: 64, threshold: 1, stock: [2, 3, 4, 4, 3, 1],
  },
  {
    name: "Sac à main cuir", category: "Accessoires", supplier: "Maroquinerie Nabeul", sku: "SAC",
    options: [["Couleur", ["Camel", "Noir"]]], price: 149, cost: 72, threshold: 1, stock: [3, 2],
  },
  {
    name: "Ceinture cuir", category: "Accessoires", supplier: "Maroquinerie Nabeul", sku: "CEI",
    options: [["Taille", ["90", "100", "110"]]], price: 39, cost: 16, threshold: 2, stock: [5, 6, 4],
  },
  {
    name: "Foulard en soie", category: "Accessoires", supplier: "Maroquinerie Nabeul", sku: "FOU",
    options: [], price: 45, cost: 18, threshold: 3, stock: [9],
  },
  {
    name: "Rouge à lèvres mat", category: "Cosmétiques", supplier: "Beauté Distribution Tunis", sku: "RAL",
    options: [["Teinte", ["Rose nude", "Rouge cerise", "Bordeaux"]]], price: 18.5, cost: 8.2, threshold: 5, stock: [14, 11, 3],
  },
  {
    name: "Crème hydratante visage 50 ml", category: "Cosmétiques", supplier: "Beauté Distribution Tunis", sku: "CRH",
    options: [], price: 32, cost: 14, threshold: 4, stock: [12],
  },
  {
    name: "Eau de parfum Jasmin 100 ml", category: "Cosmétiques", supplier: "Beauté Distribution Tunis", sku: "PJA",
    options: [], price: 65, cost: 28, threshold: 2, stock: [6],
  },
  {
    name: "Chaussettes coton (lot de 3)", category: "Vêtements", supplier: "Grossiste Textile Sousse", sku: "CHA",
    options: [], price: 9.5, cost: 3.2, threshold: 10, stock: [30],
  },
  {
    name: "Retouche couture", category: "Services", supplier: null, sku: "RET",
    options: [], price: 5, cost: null, threshold: null, stock: null, trackStock: false,
  },
];

const CUSTOMERS = [
  { name: "Leila Ben Ammar", phone: "+216 22 345 678", notes: "Cliente fidèle, paie souvent en deux fois." },
  { name: "Karim Trabelsi", phone: "+216 98 765 432", notes: null },
  { name: "Salma Gharbi", phone: "+216 55 123 987", notes: null },
];

function combos(options) {
  return options.reduce((acc, [, values]) => acc.flatMap((prefix) => values.map((v) => [...prefix, v])), [[]]);
}
const skuPart = (v) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();

// ---------------------------------------------------------------------------
const client = new pg.Client({ connectionString: url });
await client.connect();
const q = (sql, params) => client.query(sql, params).then((r) => r.rows);

try {
  const orgs = await q(
    `select o.id, m.user_id from public.organizations o
     join public.organization_members m on m.organization_id = o.id and m.role = 'owner'
     where lower(o.name) = lower($1) order by m.created_at limit 1`,
    [orgName],
  );
  if (orgs.length === 0) throw new Error(`Organization "${orgName}" not found (or has no owner).`);
  const { id: org, user_id: ownerId } = orgs[0];

  const already = await q("select 1 from public.products where organization_id = $1 and name = $2", [org, PRODUCTS[0].name]);
  if (already.length) throw new Error(`Demo data already present in "${orgName}" (found "${PRODUCTS[0].name}"). Nothing done.`);

  await q("begin");
  // From here on, act exactly like the owner signed in through the app.
  await q("set local role authenticated");
  await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ownerId, role: "authenticated" })]);

  const [{ id: location }] = await q(
    "select id from public.locations where organization_id = $1 and is_active order by created_at limit 1",
    [org],
  );
  const methods = Object.fromEntries(
    (await q("select id, kind from public.payment_methods where organization_id = $1 and is_active", [org])).map((m) => [m.kind, m.id]),
  );

  const categoryId = {};
  for (const name of CATEGORIES) {
    const [row] = await q("insert into public.categories (organization_id, name) values ($1, $2) returning id", [org, name]);
    categoryId[name] = row.id;
  }
  const supplierId = {};
  for (const s of SUPPLIERS) {
    const [row] = await q(
      "insert into public.suppliers (organization_id, name, phone, email) values ($1, $2, $3, $4) returning id",
      [org, s.name, s.phone, s.email],
    );
    supplierId[s.name] = row.id;
  }

  // Articles (create_product: product + variants + costs, atomically).
  const variantOf = {}; // "SKU" → variant id
  const opening = [];
  for (const p of PRODUCTS) {
    const values = combos(p.options);
    const variants = values.map((vals) => ({
      sku: [p.sku, ...vals.map(skuPart)].join("-"),
      barcode: nextBarcode(),
      option_values: vals,
      price_millimes: dt(p.price),
      cost_millimes: p.cost === null ? null : dt(p.cost),
      low_stock_threshold: p.threshold,
    }));
    const [{ id: productId }] = await q("select public.create_product($1, $2::jsonb) as id", [
      org,
      JSON.stringify({
        name: p.name,
        description: null,
        category_id: categoryId[p.category],
        supplier_id: p.supplier ? supplierId[p.supplier] : null,
        option_names: p.options.map(([n]) => n),
        track_stock: p.trackStock ?? true,
        variants,
      }),
    ]);
    const rows = await q("select id, sku from public.product_variants where product_id = $1", [productId]);
    for (const r of rows) variantOf[r.sku] = r.id;
    if (p.stock) {
      variants.forEach((v, i) => {
        if (p.stock[i] > 0) opening.push({ variant_id: variantOf[v.sku], quantity: p.stock[i], unit_cost_millimes: v.cost_millimes });
      });
    }
  }

  // Opening stock (one document, ledger + balances).
  await q("select public.record_opening_stock($1, $2, $3::jsonb, $4)", [org, location, JSON.stringify(opening), randomUUID()]);

  const customerId = {};
  for (const c of CUSTOMERS) {
    const [row] = await q(
      "insert into public.customers (organization_id, name, phone, notes) values ($1, $2, $3, $4) returning id",
      [org, c.name, c.phone, c.notes],
    );
    customerId[c.name] = row.id;
  }

  // Sales: prices and totals are computed by finalize_sale from the catalog.
  const sale = async (lines, payments, { customer = null, orderDiscount = 0 } = {}) => {
    const [{ id }] = await q("select public.finalize_sale($1, null, $2, $3, $4::jsonb, $5, null, $6::jsonb, $7) as id", [
      org,
      location,
      customer ? customerId[customer] : null,
      JSON.stringify(lines.map(([sku, quantity, discount_bps = 0]) => ({ variant_id: variantOf[sku], quantity, discount_bps }))),
      orderDiscount,
      JSON.stringify(payments.map(([kind, amount]) => ({ method_id: methods[kind], amount_millimes: amount }))),
      randomUUID(),
    ]);
    const [{ total_millimes: total }] = await q("select total_millimes from public.sales where id = $1", [id]);
    return { id, total };
  };

  const summary = [];
  // 1. Cash sale, two T-shirts + socks.
  {
    const lines = [["TSH-M-BLA", 2], ["CHA", 1]];
    const probe = 2 * dt(25) + dt(9.5);
    const s = await sale(lines, [["cash", probe]]);
    summary.push(["Espèces", s.total]);
  }
  // 2. Card sale with a 10 % line discount on the dress.
  {
    const lines = [["ROB-M", 1, 1000], ["FOU", 1]];
    const totalExpected = Math.round(dt(89) * 0.9) + dt(45);
    const s = await sale(lines, [["card", totalExpected]]);
    summary.push(["Carte, remise 10 %", s.total]);
  }
  // 3. Split payment (cash + card) for sneakers and a belt, with a 5 DT discount on the total.
  {
    const lines = [["SNK-41", 1], ["CEI-100", 1]];
    const grand = dt(129) + dt(39) - dt(5);
    const s = await sale(lines, [["cash", dt(100)], ["card", grand - dt(100)]], { orderDiscount: dt(5) });
    summary.push(["Espèces + carte", s.total]);
  }
  // 4. Credit sale to a known customer: handbag, 50 DT paid now.
  {
    const s = await sale([["SAC-CAM", 1], ["RAL-ROU", 2]], [["cash", dt(50)]], { customer: "Leila Ben Ammar" });
    summary.push(["Crédit Leila Ben Ammar (50 DT payés)", s.total]);
  }
  // 5. Cosmetics, paid by transfer, customer recorded.
  {
    const grand = dt(32) + dt(65);
    const s = await sale([["CRH", 1], ["PJA", 1]], [["transfer", grand]], { customer: "Salma Gharbi" });
    summary.push(["Virement Salma Gharbi", s.total]);
  }
  // 6. Jeans + alteration service, then one jean returned (restocked) and refunded.
  {
    const grand = 2 * dt(79) + dt(5);
    const s = await sale([["JEA-40", 2], ["RET", 1]], [["cash", grand]], { customer: "Karim Trabelsi" });
    const [{ id: itemId }] = await q("select id from public.sale_items where sale_id = $1 and variant_id = $2", [s.id, variantOf["JEA-40"]]);
    await q("select public.create_sale_return($1, $2::jsonb, $3, $4, $5, $6)", [
      s.id,
      JSON.stringify([{ sale_item_id: itemId, quantity: 1, restock: true }]),
      "Taille trop grande",
      methods.cash,
      dt(79),
      randomUUID(),
    ]);
    summary.push(["Espèces Karim Trabelsi, 1 jean retourné et remboursé", s.total]);
  }

  // Must be clean before committing.
  for (const check of ["check_stock_reconciliation", "check_sales_consistency", "check_purchasing_consistency"]) {
    const problems = await q(`select * from public.${check}($1)`, [org]);
    if (problems.length) throw new Error(`${check} reported ${problems.length} problem(s); rolled back.`);
  }
  await q("commit");

  const fmt = (m) => `${(m / 1000).toFixed(3).replace(".", ",")} DT`;
  console.log(`Demo data loaded into "${orgName}":`);
  console.log(`  ${CATEGORIES.length} categories, ${SUPPLIERS.length} suppliers, ${PRODUCTS.length} articles (${Object.keys(variantOf).length} variants), ${CUSTOMERS.length} customers`);
  console.log(`  opening stock: ${opening.reduce((n, l) => n + l.quantity, 0)} units on ${opening.length} variants`);
  for (const [label, t] of summary) console.log(`  sale: ${label} — ${fmt(t)}`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(`Demo data NOT loaded: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}

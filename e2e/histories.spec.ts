/**
 * Audit finding T6: lists that stopped at a fixed number of rows (receipts
 * 100, counts 50, adjustments 100, transfers 100, supplier account 100 + 100,
 * customer history 200 — whose balance was summed from those 200 only).
 * Volume is seeded through the real API with the app's own SQL functions.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";
import { apiAs, rpc } from "./api";
import { createOrganization, newAccount, signIn, signUpAndConfirm } from "./helpers";

test.describe.configure({ mode: "serial" });

const owner = newAccount("Histories");
const ids: { customer?: string; supplier?: string } = {};

test("seed: 205 credit sales, 35 receipts, 33 adjustments, 31 transfers, 31 counts, 31 supplier payments", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  await signUpAndConfirm(page, owner, baseURL as string);
  await createOrganization(page, `Boutique Historiques ${Date.now()}`);
  const api = await apiAs(owner);

  const { data: membership } = await api.from("organization_members").select("organization_id").single();
  const org = membership!.organization_id as string;
  const { data: main } = await api.from("locations").select("id").eq("organization_id", org).single();
  const { data: depot } = await api.from("locations").insert({ organization_id: org, name: "Dépôt" }).select("id").single();
  const { data: cash } = await api.from("payment_methods").select("id").eq("organization_id", org).eq("kind", "cash").single();
  const { data: customer } = await api.from("customers").insert({ organization_id: org, name: "Client fidèle" }).select("id").single();
  const { data: supplier } = await api.from("suppliers").insert({ organization_id: org, name: "Grossiste volume" }).select("id").single();
  ids.customer = customer!.id;
  ids.supplier = supplier!.id;

  const productId = await rpc<string>(api, "create_product", {
    p_organization_id: org,
    p_product: { name: "Article volume", option_names: [], variants: [{ option_values: [], price_millimes: 10_000, cost_millimes: 4_000 }] },
  });
  const { data: variant } = await api.from("product_variants").select("id").eq("product_id", productId).single();
  const v = variant!.id as string;
  await rpc(api, "record_opening_stock", { p_organization_id: org, p_location_id: main!.id, p_lines: [{ variant_id: v, quantity: 2000 }], p_idempotency_key: randomUUID() });

  // 205 sales on credit, 2 DT paid each: 8 DT due each, 1 640 DT in total.
  for (let i = 0; i < 205; i++) {
    await rpc(api, "finalize_sale", {
      p_organization_id: org,
      p_sale_id: null,
      p_location_id: main!.id,
      p_customer_id: ids.customer,
      p_lines: [{ variant_id: v, quantity: 1 }],
      p_order_discount_millimes: 0,
      p_note: null,
      p_payments: [{ method_id: cash!.id, amount_millimes: 2_000 }],
      p_idempotency_key: randomUUID(),
    });
  }
  for (let i = 0; i < 35; i++) {
    await rpc(api, "post_stock_receipt", {
      p_organization_id: org,
      p_location_id: main!.id,
      p_supplier_id: ids.supplier,
      p_reference: `BL-${i}`,
      p_note: null,
      p_lines: [{ variant_id: v, quantity: 1, unit_cost_millimes: 4_000 }],
      p_update_costs: false,
      p_idempotency_key: randomUUID(),
    });
  }
  for (let i = 0; i < 33; i++) {
    const adjustment = await rpc<string>(api, "create_stock_adjustment", {
      p_organization_id: org,
      p_location_id: main!.id,
      p_reason: `Casse ${i}`,
      p_lines: [{ variant_id: v, quantity_delta: -1 }],
      p_idempotency_key: randomUUID(),
    });
    if (i >= 2) await rpc(api, "review_stock_adjustment", { p_adjustment_id: adjustment, p_approve: true });
  }
  for (let i = 0; i < 31; i++) {
    await rpc(api, "post_stock_transfer", {
      p_organization_id: org,
      p_from_location_id: main!.id,
      p_to_location_id: depot!.id,
      p_note: null,
      p_lines: [{ variant_id: v, quantity: 1 }],
      p_idempotency_key: randomUUID(),
    });
    // One open count per location: each one is cancelled before the next.
    const count = await rpc<string>(api, "create_stock_count", { p_organization_id: org, p_location_id: main!.id, p_note: `Inventaire ${i}`, p_variant_ids: [v], p_idempotency_key: randomUUID() });
    await rpc(api, "cancel_stock_count", { p_count_id: count });
    await rpc(api, "record_supplier_payment", {
      p_organization_id: org,
      p_supplier_id: ids.supplier,
      p_method_id: cash!.id,
      p_kind: "payment",
      p_amount_millimes: 1_000,
      p_paid_on: new Date().toISOString().slice(0, 10),
      p_reference: `VIR-${i}`,
      p_note: null,
      p_purchase_order_id: null,
      p_idempotency_key: randomUUID(),
    });
  }
});

test("a customer's balance covers every sale, and the history pages", async ({ page }) => {
  await signIn(page, owner);
  await page.goto(`/app/customers/${ids.customer}`);
  await expect(page.getByText(/doit 1\s?640,000\s*DT/).first()).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Pagination de l'historique des achats" });
  await expect(nav).toContainText("Page 1 sur 7");
  await nav.getByRole("link", { name: "Suivant" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole("navigation", { name: "Pagination de l'historique des achats" })).toContainText("Page 2 sur 7");
});

test("stock documents are paginated", async ({ page }) => {
  await signIn(page, owner);
  for (const [path, pages] of [
    ["/app/stock/receipts", 2],
    ["/app/stock/transfers", 2],
    ["/app/stock/counts", 2],
    ["/app/stock/adjustments", 2],
  ] as const) {
    await page.goto(path);
    const nav = page.getByRole("navigation", { name: "Pagination" });
    await expect(nav, path).toContainText(`Page 1 sur ${pages}`);
    await nav.getByRole("link", { name: "Suivant" }).click();
    await expect(page, path).toHaveURL(/page=2/);
    await expect(page.getByRole("navigation", { name: "Pagination" }), path).toContainText(`Page 2 sur ${pages}`);
  }
});

test("pending adjustments stay on top of every page", async ({ page }) => {
  await signIn(page, owner);
  await page.goto("/app/stock/adjustments?page=2");
  await expect(page.getByRole("button", { name: "Valider" })).toHaveCount(2);
});

test("the supplier account pages its receipts and its payments separately", async ({ page }) => {
  await signIn(page, owner);
  await page.goto(`/app/suppliers/${ids.supplier}`);
  await expect(page.getByRole("navigation", { name: "Pagination des réceptions" })).toContainText("Page 1 sur 2");
  await expect(page.getByRole("navigation", { name: "Pagination des paiements" })).toContainText("Page 1 sur 2");
  await page.getByRole("navigation", { name: "Pagination des paiements" }).getByRole("link", { name: "Suivant" }).click();
  await expect(page).toHaveURL(/ppage=2/);
  await expect(page.getByRole("navigation", { name: "Pagination des paiements" })).toContainText("Page 2 sur 2");
  await expect(page.getByRole("navigation", { name: "Pagination des réceptions" })).toContainText("Page 1 sur 2");
});

/**
 * Audit finding T8: flows that had no end-to-end test. Each one is driven
 * through the screens; the API (same RLS as the app) only seeds the shop
 * and reads stock levels back.
 *   1. transfer between two locations
 *   2. adjustment proposed, then approved by the owner
 *   3. stock count: create, count, submit, approve the difference
 *   4. password reset through the emailed link
 */
import { expect, test } from "./fixtures";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiAs, rpc } from "./api";
import { randomUUID } from "node:crypto";
import { clickAndConfirm, createOrganization, linkFromEmail, newAccount, pickVariant, signIn, signUpAndConfirm, toBaseUrl } from "./helpers";

test.describe.configure({ mode: "serial" });

const owner = newAccount("StockFlows");
const product = `Savon E2E ${Date.now().toString(36)}`;
const shop: { org?: string; main?: string; depot?: string; variant?: string } = {};
let api: SupabaseClient;

async function stockAt(location: string): Promise<number> {
  const { data, error } = await api.from("stock_levels").select("quantity").eq("location_id", location).eq("variant_id", shop.variant!).maybeSingle();
  expect(error).toBeNull();
  return data?.quantity ?? 0;
}

test("seed: a shop with two locations and 20 units in the main one", async ({ page, baseURL }) => {
  await signUpAndConfirm(page, owner, baseURL as string);
  await createOrganization(page, `Boutique Stock ${Date.now()}`);
  api = await apiAs(owner);
  const { data: membership } = await api.from("organization_members").select("organization_id").single();
  shop.org = membership!.organization_id as string;
  const { data: main } = await api.from("locations").select("id").eq("organization_id", shop.org).single();
  const { data: depot } = await api.from("locations").insert({ organization_id: shop.org, name: "Dépôt" }).select("id").single();
  shop.main = main!.id;
  shop.depot = depot!.id;
  const productId = await rpc<string>(api, "create_product", {
    p_organization_id: shop.org,
    p_product: { name: product, option_names: [], variants: [{ option_values: [], price_millimes: 3_000, cost_millimes: 1_200 }] },
  });
  const { data: variant } = await api.from("product_variants").select("id").eq("product_id", productId).single();
  shop.variant = variant!.id;
  await rpc(api, "record_opening_stock", {
    p_organization_id: shop.org,
    p_location_id: shop.main,
    p_lines: [{ variant_id: shop.variant, quantity: 20 }],
    p_idempotency_key: randomUUID(),
  });
  expect(await stockAt(shop.main!)).toBe(20);
});

test("transfer moves units from one location to the other at once", async ({ page }) => {
  await signIn(page, owner);
  await page.goto("/app/stock/transfers/new");
  await page.getByLabel("Depuis").selectOption({ label: "Boutique principale" });
  await page.getByLabel("Vers").selectOption({ label: "Dépôt" });
  await pickVariant(page, product, new RegExp(product));
  await expect(page.getByText("Stock actuel à cet emplacement : 20")).toBeVisible();
  await page.getByLabel("Quantité").fill("4");
  await clickAndConfirm(page, page.getByRole("button", { name: "Transférer" }));
  await expect(page.getByText("Transfert enregistré.")).toBeVisible();

  expect(await stockAt(shop.main!)).toBe(16);
  expect(await stockAt(shop.depot!)).toBe(4);
});

test("an adjustment changes the stock only once approved", async ({ page }) => {
  await signIn(page, owner);
  const reason = `Casse ${randomUUID().slice(0, 6)}`;
  await page.goto("/app/stock/adjustments/new");
  await page.getByLabel("Emplacement", { exact: true }).selectOption({ label: "Boutique principale" });
  await page.getByLabel("Motif").fill(reason);
  await pickVariant(page, product, new RegExp(product));
  await page.getByLabel("Sens").selectOption({ label: "Sortie (−)" });
  await page.getByLabel("Quantité").fill("3");
  await clickAndConfirm(page, page.getByRole("button", { name: "Proposer l'ajustement" }));
  await expect(page.getByText("Ajustement créé. Validez-le ci-dessous pour l'appliquer au stock.")).toBeVisible();

  const card = page.locator("div").filter({ has: page.getByText(new RegExp(reason)) }).filter({ has: page.getByRole("button", { name: "Valider" }) }).last();
  await expect(card.getByText("En attente")).toBeVisible();
  expect(await stockAt(shop.main!)).toBe(16); // pending: nothing applied yet

  await clickAndConfirm(page, card.getByRole("button", { name: "Valider", exact: true }));
  // It was the only pending adjustment: once reviewed, no review buttons remain.
  await expect(page.getByRole("button", { name: "Valider", exact: true })).toHaveCount(0);
  // Card header: number and reason on the left, status badge on the right.
  const header = page.getByText(new RegExp(reason)).locator("xpath=ancestor::div[2]");
  await expect(header.getByText("Validé", { exact: true })).toBeVisible();
  expect(await stockAt(shop.main!)).toBe(13);
});

test("a stock count applies the counted difference after approval", async ({ page }) => {
  await signIn(page, owner);
  await page.goto("/app/stock/counts");
  await page.getByLabel("Emplacement", { exact: true }).selectOption({ label: "Boutique principale" });
  await page.getByLabel("Note (facultatif)").fill("Inventaire E2E");
  await page.getByRole("button", { name: "Commencer l'inventaire" }).click();
  await page.waitForURL(/\/app\/stock\/counts\/[0-9a-f-]{36}$/);
  await expect(page.getByText("En cours")).toBeVisible();

  // Blind count: the book quantity (13) is not shown on the sheet.
  await page.getByLabel(`Quantité comptée pour ${product}`).fill("11");
  await page.getByRole("button", { name: "Enregistrer (1)" }).click();
  await expect(page.getByText("compté : 11")).toBeVisible();
  expect(await stockAt(shop.main!)).toBe(13); // counting alone changes nothing

  await clickAndConfirm(page, page.getByRole("button", { name: "Soumettre pour validation" }));
  await expect(page.getByText("À valider")).toBeVisible();
  await clickAndConfirm(page, page.getByRole("button", { name: "Valider et appliquer les écarts" }));
  await expect(page.getByText("Validé", { exact: true })).toBeVisible();
  const differences = page.getByRole("heading", { name: "Écarts" }).locator("..");
  await expect(differences).toContainText("−2");

  expect(await stockAt(shop.main!)).toBe(11);
  expect(await stockAt(shop.depot!)).toBe(4); // other locations untouched
});

test("password reset through the emailed link", async ({ page, baseURL, browser }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
  await page.getByLabel("Adresse e-mail").fill(owner.email);
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  await expect(page.getByText("Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé.")).toBeVisible();

  // The newest email may still be the sign-up confirmation for a moment.
  let link = "";
  await expect(async () => {
    link = await linkFromEmail(owner.email, /type=recovery/);
  }).toPass({ timeout: 20_000 });
  await page.goto(toBaseUrl(link, baseURL as string));
  await expect(page).toHaveURL(/\/reset-password/);

  const oldPassword = owner.password;
  const newPassword = `Sp-${randomUUID().slice(0, 8)}-new1`;
  await page.getByLabel("Mot de passe", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirmer le mot de passe").fill(newPassword);
  await page.getByRole("button", { name: "Enregistrer le mot de passe" }).click();
  await page.waitForURL(/\/app$/);

  // A fresh browser: the old password is refused, the new one works.
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.goto(`${baseURL}/login`);
  await fresh.getByLabel("Adresse e-mail").fill(owner.email);
  await fresh.getByLabel("Mot de passe").fill(oldPassword);
  await fresh.getByRole("button", { name: "Se connecter" }).click();
  await expect(fresh.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();
  await expect(fresh).toHaveURL(/\/login/);
  await expect(fresh.getByLabel("Adresse e-mail")).toHaveValue(owner.email); // kept after a failed attempt
  await fresh.getByLabel("Mot de passe").fill(newPassword);
  await fresh.getByRole("button", { name: "Se connecter" }).click();
  await expect(fresh).toHaveURL(/\/app/);
  await context.close();
  owner.password = newPassword;
});

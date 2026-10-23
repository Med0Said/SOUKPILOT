/**
 * The end-to-end workflow from the product specification (§12), through the
 * real UI, a real Supabase (Auth + PostgREST + Postgres) and real emails:
 *   1. create an organization            6. record a partial payment
 *   2. add a product with two variants   7. confirm stock and balances
 *   3. record opening stock              8. return an item (+ refund)
 *   4. receive supplier stock            9. confirm the ledger and reports
 *   5. record a sale                    10. another organization is denied
 * Database-level consistency is then checked with the app's own SQL checks.
 */
import type { Page } from "@playwright/test";
import { allowNotFoundResponses, expect, test } from "./fixtures";
import pg from "pg";
import { clickAndConfirm, createOrganization, newAccount, pickVariant, signUpAndConfirm } from "./helpers";

const DB_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const money = (text: string) => new RegExp(text.replace(",", ",") + "\\s*DT");

test.describe.configure({ mode: "serial" });

const owner = newAccount("Owner");
const product = `Chemise E2E ${Date.now().toString(36)}`;
let saleUrl = "";
let productUrl = "";

async function stockOf(page: Page, size: "S" | "M"): Promise<string> {
  await page.goto(`/app/stock?q=${encodeURIComponent(product)}`);
  // Row = product link + a paragraph with the variant label ("S", "M") + the quantity link.
  const row = page
    .getByRole("listitem")
    .filter({ hasText: product })
    .filter({ has: page.getByRole("paragraph").filter({ hasText: new RegExp(`^${size}$`) }) });
  return (await row.getByRole("link", { name: /Historique de/ }).innerText()).trim();
}

test("owner sets up the shop, sells, gets paid partially, takes a return", async ({ page, baseURL }) => {
  // 1. Organization
  await signUpAndConfirm(page, owner, baseURL as string);
  await createOrganization(page, `Boutique Flux ${Date.now()}`);

  // Supplier (needed for the receipt)
  await page.goto("/app/suppliers");
  await page.locator("#sup-new-name").fill("Grossiste E2E");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByText("Fournisseur ajouté.")).toBeVisible();

  // 2. Product with two variants (Taille S, M), price 25 DT, cost 12 DT
  await page.goto("/app/catalog/new");
  await page.getByLabel("Nom de l'article").fill(product);
  await page.getByRole("button", { name: "Ajouter une option" }).click();
  await page.getByLabel("Nom de l'option").fill("Taille");
  await page.getByLabel("Valeurs (séparées par des virgules)").fill("S, M");
  await page.getByLabel("Prix de vente par défaut").fill("25");
  await page.getByLabel("Prix d'achat par défaut").fill("12");
  await page.getByRole("button", { name: "Générer les variantes" }).click();
  await expect(page.getByRole("group", { name: "S" })).toBeVisible();
  await expect(page.getByRole("group", { name: "M" })).toBeVisible();
  await page.getByRole("button", { name: "Créer l'article" }).click();
  await expect(page.getByText("Article créé.")).toBeVisible();
  productUrl = new URL(page.url()).pathname;

  // 3. Opening stock: S = 10, M = 5
  await page.goto("/app/stock/opening");
  await pickVariant(page, product, new RegExp(`${product}\\s+S\\b`));
  await pickVariant(page, product, new RegExp(`${product}\\s+M\\b`));
  await page.getByLabel("Quantité").nth(0).fill("10");
  await page.getByLabel("Quantité").nth(1).fill("5");
    await clickAndConfirm(page, page.getByRole("button", { name: "Enregistrer le stock initial" }));
  await expect(page.getByText("Stock initial enregistré.")).toBeVisible();

  // 4. Supplier receipt: +3 S at 12,500 DT
  await page.goto("/app/stock/receipts/new");
  await page.getByLabel("Fournisseur", { exact: true }).selectOption({ label: "Grossiste E2E" });
  await page.getByLabel(/Référence fournisseur/).fill("BL-E2E-1");
  await pickVariant(page, product, new RegExp(`${product}\\s+S\\b`));
  await page.getByLabel("Quantité").fill("3");
  await page.getByLabel("Coût unitaire (DT)").fill("12,500");
    await clickAndConfirm(page, page.getByRole("button", { name: "Enregistrer la réception" }));
  await expect(page.getByText("Réception enregistrée : le stock est à jour.")).toBeVisible();
  await expect(page.getByText(money("37,500")).first()).toBeVisible();

  expect(await stockOf(page, "S")).toBe("13");
  expect(await stockOf(page, "M")).toBe("5");

  // 5–6. Sale: 2 × S (50 DT) to a new customer, 30 DT paid in cash (credit 20 DT)
  await page.goto("/app/sales/new");
  await pickVariant(page, product, new RegExp(`${product}\\s+S\\b`));
  await page.getByLabel("Qté").fill("2");
  await page.getByRole("button", { name: "+ Nouveau client" }).click();
  await page.getByLabel("Nom", { exact: true }).fill("Mme Ben Ali");
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByLabel("Client", { exact: true })).toHaveValue(/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "+ Ajouter un paiement" }).click();
  await page.getByLabel("Montant (DT)").fill("30");
  await expect(page.getByText(/Reste à payer\s:\s20,000\s*DT/)).toBeVisible();
    await clickAndConfirm(page, page.getByRole("button", { name: "Valider la vente" }));
  await expect(page.getByText("Vente enregistrée.")).toBeVisible();
  saleUrl = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: /Vente n° 000001/ })).toBeVisible();

  // 7. Stock and balance
  await expect(page.locator("dl").getByText("Reste à payer").locator("..")).toContainText(money("20,000"));
  expect(await stockOf(page, "S")).toBe("11");

  // 8. Return 1 × S (resellable) and refund 5 DT: 50 − 25 returned − (30 − 5) paid = 0
  await page.goto(saleUrl);
  await page.getByLabel("Quantité").fill("1");
  await page.getByLabel("Motif").fill("Taille trop petite");
  await page.getByLabel("Rembourser maintenant (DT)").fill("5");
    await clickAndConfirm(page, page.getByRole("button", { name: "Enregistrer le retour" }));
  await expect(page.getByText("Retour enregistré.")).toBeVisible();
  await expect(page.locator("dl").getByText("Reste à payer").locator("..")).toContainText(money("0,000"));
  await expect(page.getByText(/Remboursement · Espèces/)).toBeVisible();
  expect(await stockOf(page, "S")).toBe("12");

  // 9. Ledger and daily report
  await page.goto("/app/stock/movements");
  for (const label of ["Stock initial", "Réception", "Vente", "Retour client"]) {
    await expect(page.getByText(new RegExp(`^${label} ·`)).first()).toBeVisible();
  }
  await page.goto("/app/sales");
  const summary = page.locator("section").filter({ hasText: "Résumé de la journée" });
  await expect(summary.getByText("Total ventes", { exact: true }).locator("..")).toContainText(money("50,000"));
  await expect(summary.getByText("Retours", { exact: true }).locator("..")).toContainText(money("25,000"));
  await expect(summary.getByText("Ventes nettes", { exact: true }).locator("..")).toContainText(money("25,000"));
  await expect(summary.getByRole("listitem").filter({ hasText: "Espèces" })).toContainText(money("25,000"));

  // Receipt page renders and states it is not an invoice
  await page.goto(`${saleUrl}/receipt`);
  await expect(page.getByText("Reçu interne — ne vaut pas facture.")).toBeVisible();
});

test("the database's own consistency checks pass after the UI workflow", async () => {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ user_id: string; organization_id: string }>(
      `select m.user_id, m.organization_id from auth.users u
       join public.organization_members m on m.user_id = u.id where u.email = $1`,
      [owner.email],
    );
    expect(rows).toHaveLength(1);
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: rows[0].user_id, role: "authenticated" }),
    ]);
    for (const check of ["check_stock_reconciliation", "check_sales_consistency", "check_purchasing_consistency"]) {
      const result = await client.query(`select * from public.${check}($1)`, [rows[0].organization_id]);
      expect(result.rows, check).toEqual([]);
    }
    await client.query("rollback");
  } finally {
    await client.end();
  }
});

test("another organization cannot see the first one's sale or product", async ({ page, baseURL }) => {
  allowNotFoundResponses();
  const intruder = newAccount("Intruder");
  await signUpAndConfirm(page, intruder, baseURL as string);
  await createOrganization(page, `Autre Boutique ${Date.now()}`);

  for (const path of [saleUrl, `${saleUrl}/receipt`, productUrl]) {
    expect(path).not.toBe("");
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { name: "Page introuvable." })).toBeVisible();
  }
  await page.goto(`/app/catalog?q=${encodeURIComponent(product)}`);
  await expect(page.getByText("Aucun article ne correspond à votre recherche.")).toBeVisible();
  await page.goto("/app/customers");
  await expect(page.getByText("Mme Ben Ali")).toHaveCount(0);
});

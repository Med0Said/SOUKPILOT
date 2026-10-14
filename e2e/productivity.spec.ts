/**
 * Phase 2 screens: command palette (Ctrl+K, accent-insensitive data search,
 * keyboard), lists with sorting, pagination and saved views, CSV exports
 * that match the filters. Runs under the console/CSP guard.
 */
import { expect, test } from "./fixtures";
import { clickAndConfirm, createOrganization, newAccount, pickVariant, signIn, signUpAndConfirm } from "./helpers";

test.describe.configure({ mode: "serial" });

const owner = newAccount("ProdOwner");
const tag = Date.now().toString(36);
const creme = `Crème hydratante ${tag}`;

async function download(page: import("@playwright/test").Page, link: import("@playwright/test").Locator) {
  const pending = page.waitForEvent("download");
  await link.click();
  const file = await pending;
  const chunks = await (await file.createReadStream()).toArray();
  return { name: file.suggestedFilename(), text: Buffer.concat(chunks).toString("utf8") };
}

test("setup: 35 articles by CSV import, stock and a credit sale", async ({ page, baseURL }) => {
  await signUpAndConfirm(page, owner, baseURL as string);
  await createOrganization(page, `Boutique Productivité ${tag}`);

  const rows = ["nom;prix_vente;prix_achat;suivi_stock", `${creme};32;14;oui`];
  for (let i = 1; i <= 34; i++) rows.push(`Article ${String(i).padStart(2, "0")} ${tag};${i};;oui`);
  await page.goto("/app/catalog/import");
  await page.getByLabel("Fichier CSV").setInputFiles({ name: "articles.csv", mimeType: "text/csv", buffer: Buffer.from(rows.join("\n"), "utf8") });
  await page.getByRole("button", { name: "Analyser le fichier" }).click();
  await expect(page.getByText(/35 articles \(35 variantes\) seront créés/)).toBeVisible();
  await page.getByRole("button", { name: "Confirmer l'import" }).click();
  await expect(page.getByText("Import terminé.")).toBeVisible();

  await page.goto("/app/stock/opening");
  await pickVariant(page, "creme", new RegExp(creme)); // accent-insensitive picker
  await page.getByLabel("Quantité").fill("10");
  await clickAndConfirm(page, page.getByRole("button", { name: "Enregistrer le stock initial" }));
  await expect(page.getByText("Stock initial enregistré.")).toBeVisible();

  await page.goto("/app/sales/new");
  await pickVariant(page, "creme", new RegExp(creme));
  await page.getByRole("button", { name: "+ Nouveau client" }).click();
  await page.getByLabel("Nom", { exact: true }).fill(`Leïla ${tag}`);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByLabel("Client", { exact: true })).toHaveValue(/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "+ Ajouter un paiement" }).click();
  await page.getByLabel("Montant (DT)").fill("10");
  await clickAndConfirm(page, page.getByRole("button", { name: "Valider la vente" }));
  await expect(page.getByText("Vente enregistrée.")).toBeVisible();
});

test("command palette: Ctrl+K, accent-insensitive search, keyboard, pages", async ({ page }) => {
  await signIn(page, owner);
  const dialog = page.getByRole("dialog", { name: "Recherche et commandes" });
  const box = dialog.getByRole("combobox");

  await page.keyboard.press("Control+k");
  await expect(dialog).toBeVisible();
  await expect(box).toBeFocused();
  await box.fill("CREME");
  const product = dialog.getByRole("option", { name: new RegExp(creme) });
  await expect(product).toBeVisible();
  await expect(product).toHaveAttribute("aria-selected", "true"); // data results come first
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/app\/catalog\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: creme })).toBeVisible();

  // Customer without the diaeresis, then a sale by its number.
  await page.keyboard.press("Control+k");
  await box.fill(`leila ${tag}`);
  await expect(dialog.getByRole("option", { name: new RegExp(`Leïla ${tag}`) })).toBeVisible();
  await box.fill("000001");
  await dialog.getByRole("option", { name: /Vente n° 000001/ }).click();
  await expect(page).toHaveURL(/\/app\/sales\/[0-9a-f-]{36}$/);

  // Pages and actions, with the arrow keys; Esc closes.
  await page.getByRole("button", { name: /Rechercher/ }).first().click();
  await box.fill("stock bas");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await expect(dialog.getByRole("option", { name: "Articles en stock bas" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("catalog list: search without accents, sort, pagination, saved view, export", async ({ page }) => {
  await signIn(page, owner);
  await page.goto("/app/catalog");
  await expect(page.getByText("35 résultats")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pagination" })).toContainText("Page 1 sur 2");
  await page.getByRole("link", { name: "Suivant" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole("navigation", { name: "Pagination" })).toContainText("Page 2 sur 2");

  await page.goto("/app/catalog");
  await page.getByRole("searchbox", { name: "Rechercher", exact: true }).fill("creme");
  await page.getByRole("button", { name: "Filtrer" }).click();
  await expect(page.getByText("1 résultat")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(creme) })).toBeVisible();

  // Sort by price, highest first, and save the view.
  await page.getByRole("searchbox", { name: "Rechercher", exact: true }).fill(tag);
  await page.getByLabel("Trier par").selectOption("price_desc");
  await page.getByRole("button", { name: "Filtrer" }).click();
  await expect(page.locator("main ul li").first()).toContainText(`Article 34 ${tag}`);
  await page.getByRole("button", { name: "Enregistrer cette vue" }).click();
  await page.getByLabel("Nom de la vue").fill("Les plus chers");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  const views = page.getByRole("region", { name: "Vues enregistrées" });
  await page.goto("/app/catalog");
  await views.getByRole("link", { name: "Les plus chers" }).click();
  await expect(page).toHaveURL(/sort=price_desc/);
  await expect(page.locator("main ul li").first()).toContainText(`Article 34 ${tag}`);

  // Export = every filtered row (35, not just the 30 on screen), import-ready.
  const file = await download(page, page.getByRole("link", { name: "Exporter (CSV)" }));
  expect(file.name).toMatch(/^articles-\d{4}-\d{2}-\d{2}\.csv$/);
  const lines = file.text.replace(/^﻿/, "").trim().split("\r\n");
  expect(lines[0]).toBe("nom;categorie;fournisseur;description;option1_nom;option1_valeur;option2_nom;option2_valeur;option3_nom;option3_valeur;sku;code_barres;prix_vente;prix_achat;suivi_stock;seuil_alerte;actif");
  expect(lines).toHaveLength(36);
  expect(lines[1]).toContain(`Article 34 ${tag}`);
  expect(lines.find((l) => l.startsWith(creme))).toContain(";32,000;14,000;oui;;oui");

  await views.getByRole("button", { name: "Supprimer la vue « Les plus chers »" }).click();
  await expect(views.getByRole("link", { name: "Les plus chers" })).toHaveCount(0);
});

test("sales and customers: unpaid filters and exports", async ({ page }) => {
  await signIn(page, owner);
  await page.goto("/app/sales?due=1");
  await expect(page.getByLabel("Non soldées uniquement")).toBeChecked();
  await expect(page.getByText("1 résultat")).toBeVisible();
  await expect(page.getByText(/Reste 22,000\s*DT/)).toBeVisible();
  const sales = await download(page, page.getByRole("link", { name: "Exporter (CSV)" }));
  expect(sales.text).toContain(`;Leïla ${tag};32,000;0,000;10,000;22,000;Finalisée`);

  await page.goto("/app/customers");
  await page.getByRole("searchbox", { name: "Rechercher", exact: true }).fill(`leila ${tag}`);
  await page.getByLabel("Clients qui doivent de l'argent").check();
  await page.getByRole("button", { name: "Filtrer" }).click();
  await expect(page.getByText("1 résultat")).toBeVisible();
  const customers = await download(page, page.getByRole("link", { name: "Exporter (CSV)" }));
  expect(customers.text.split("\r\n")[1]).toMatch(new RegExp(`^Leïla ${tag};;oui;1;22,000;\\d{4}-\\d{2}-\\d{2}$`));
});

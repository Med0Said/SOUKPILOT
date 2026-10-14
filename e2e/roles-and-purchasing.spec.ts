/**
 * Roles through the real invitation flow, and purchasing end to end.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { clickAndConfirm, createOrganization, newAccount, pickVariant, signIn, signUpAndConfirm } from "./helpers";

test.describe.configure({ mode: "serial" });

const owner = newAccount("RoleOwner");
const cashier = newAccount("Cashier");
const product = `Rouge E2E ${Date.now().toString(36)}`;

async function createSimpleProduct(page: Page, name: string, price: string, cost: string) {
  await page.goto("/app/catalog/new");
  await page.getByLabel("Nom de l'article").fill(name);
  await page.getByLabel("Prix de vente (DT)").fill(price);
  await page.getByLabel("Prix d'achat (DT)").fill(cost);
  await page.getByRole("button", { name: "Créer l'article" }).click();
  await expect(page.getByText("Article créé.")).toBeVisible();
}

test("owner prepares the shop and invites a cashier", async ({ page, baseURL }) => {
  await signUpAndConfirm(page, owner, baseURL as string);
  await createOrganization(page, `Boutique Rôles ${Date.now()}`);
  await createSimpleProduct(page, product, "20", "8");

  await page.goto("/app/stock/opening");
  await pickVariant(page, product, new RegExp(product));
  await page.getByLabel("Quantité").fill("4");
    await clickAndConfirm(page, page.getByRole("button", { name: "Enregistrer le stock initial" }));
  await expect(page.getByText("Stock initial enregistré.")).toBeVisible();

  await page.goto("/app/settings/members");
  await page.getByLabel("Adresse e-mail").fill(cashier.email);
  await expect(page.getByLabel("Rôle")).toHaveValue("cashier");
  await page.getByRole("button", { name: "Créer l'invitation" }).click();
  await expect(page.getByText("Message à envoyer")).toBeVisible();
  // The ready-to-send message names the address, and the invitation is listed as pending.
  await expect(page.getByText(/^Bonjour, je vous ai invité/)).toContainText(cashier.email);
  await expect(page.getByText(cashier.email, { exact: true })).toBeVisible();
});

test("the cashier accepts the invitation and gets cashier rights only", async ({ page, baseURL }) => {
  await signUpAndConfirm(page, cashier, baseURL as string);
  await page.goto("/invitations");
  await page.getByRole("button", { name: "Accepter" }).click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByText("Caissier").first()).toBeVisible();

  // Purchasing is reserved to owner/manager (and the nav does not offer it).
  await expect(page.getByRole("link", { name: "Achats" })).toHaveCount(0);
  await page.goto("/app/purchases");
  await expect(page.getByText("Cette page est réservée au propriétaire et aux gérants.")).toBeVisible();

  // Product page: read-only for cashiers, no purchase cost anywhere.
  await page.goto(`/app/catalog?q=${encodeURIComponent(product)}`);
  await page.getByRole("link", { name: new RegExp(product) }).click();
  await expect(page.getByRole("heading", { name: product })).toBeVisible();
  await expect(page.getByText(/Prix d'achat/)).toHaveCount(0);
  await expect(page.getByText(/8,000\s*DT/)).toHaveCount(0);

  // Discount above the cashier limit (10 % by default) is refused by the server.
  await page.goto("/app/sales/new");
  await pickVariant(page, product, new RegExp(product));
  await page.getByLabel("Remise %").fill("15");
  await page.getByRole("button", { name: /Tout en espèces/ }).click();
    await clickAndConfirm(page, page.getByRole("button", { name: "Valider la vente" }));
  await expect(page.getByText("Remise supérieure au maximum autorisé pour votre rôle.")).toBeVisible();

  // Within the limit it goes through.
  await page.getByLabel("Remise %").fill("10");
  await page.getByRole("button", { name: /Tout en espèces/ }).click();
    await clickAndConfirm(page, page.getByRole("button", { name: "Valider la vente" }));
  await expect(page.getByText("Vente enregistrée.")).toBeVisible();
  await expect(page.locator("dl").getByText("Total", { exact: true }).locator("..")).toContainText(/18,000\s*DT/);
  // Returns are owner/manager only: no return form for a cashier.
  await expect(page.getByRole("heading", { name: "Retour d'articles" })).toHaveCount(0);
});

test("on a phone, the cashier gets the bottom navigation", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, baseURL });
  const page = await context.newPage();
  await signIn(page, cashier);
  const bottomNav = page.locator("nav.fixed");
  await expect(bottomNav).toBeVisible();
  await expect(bottomNav.getByRole("link")).toHaveText(["Tableau de bord", "Ventes", "Articles", "Stock", "Paramètres"]);
  await context.close();
});

test("purchasing: order, place, partial receipt, supplier payment and balance", async ({ page }) => {
  await signIn(page, owner);

  await page.goto("/app/suppliers");
  await page.locator("#sup-new-name").fill("Grossiste Commandes");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByText("Fournisseur ajouté.")).toBeVisible();

  await page.goto("/app/purchases/new");
  await page.getByLabel("Fournisseur", { exact: true }).selectOption({ label: "Grossiste Commandes" });
  await pickVariant(page, product, new RegExp(product));
  await page.getByLabel("Quantité").fill("10");
  // Last purchase cost is pre-filled (8,000).
  await expect(page.getByLabel("Coût unitaire (DT)")).toHaveValue("8,000");
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await expect(page.getByText("Brouillon enregistré.")).toBeVisible();

    await clickAndConfirm(page, page.getByRole("button", { name: "Passer la commande" }));
  await expect(page.getByText("Commande passée.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /BC-000001/ })).toBeVisible();

  // Partial delivery: 6 of 10.
  await page.getByLabel("Quantité reçue").fill("6");
    await clickAndConfirm(page, page.getByRole("button", { name: "Enregistrer la réception" }));
  await expect(page.getByText("Réception enregistrée : le stock est à jour.")).toBeVisible();
  await expect(page.getByText("Reçu en partie")).toBeVisible();

  // More than the remaining 4 is refused.
  await page.getByLabel("Quantité reçue").fill("5");
    await clickAndConfirm(page, page.getByRole("button", { name: "Enregistrer la réception" }));
  await expect(page.getByText(/Quantité reçue supérieure au reste à recevoir/)).toBeVisible();

  // Supplier account: 6 × 8 = 48 DT owed, pay 20 → 28 DT left.
  await page.goto("/app/suppliers");
  await page.getByText("Grossiste Commandes").click();
  await page.getByRole("link", { name: /Voir le compte/ }).click();
  await expect(page.getByText("Reste dû", { exact: true }).locator("..")).toContainText(/48,000\s*DT/);
  await page.getByLabel("Montant (DT)").fill("20");
    await clickAndConfirm(page, page.locator("form").filter({ hasText: "Paiement au fournisseur" }).getByRole("button", { name: "Enregistrer" }));
  await expect(page.getByText("Paiement enregistré.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Reste dû", { exact: true }).locator("..")).toContainText(/28,000\s*DT/);
});

/**
 * Phase 1 UI foundation: theme switch, collapsible sidebar, confirmation
 * dialog (cancel / Esc / keyboard), breadcrumbs. Runs under the console/CSP guard.
 */
import { allowNotFoundResponses, allowServerErrorResponses, expect, test } from "./fixtures";
import { clickAndConfirm, createOrganization, newAccount, pickVariant, signIn, signUpAndConfirm } from "./helpers";

test.describe.configure({ mode: "serial" });

const owner = newAccount("UiOwner");
const product = `Sac UI ${Date.now().toString(36)}`;

test("theme switch applies instantly and survives a reload", async ({ page, baseURL }) => {
  await signUpAndConfirm(page, owner, baseURL as string);
  await createOrganization(page, `Boutique UI ${Date.now()}`);

  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "system");
  await page.getByRole("radio", { name: "Sombre" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Sombre" })).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.getByRole("radio", { name: "Clair" }).click();
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("sidebar collapses to icons, keeps accessible names, and remembers it", async ({ page }) => {
  await signIn(page, owner);
  const sidebar = page.locator("aside");
  await sidebar.getByRole("button", { name: "Réduire le menu" }).click();
  await expect(sidebar.getByRole("button", { name: "Déplier le menu" })).toBeVisible();
  // Labels are visually hidden but links keep their accessible names.
  await expect(sidebar.getByRole("link", { name: "Articles" })).toBeVisible();
  await page.reload();
  await expect(sidebar.getByRole("button", { name: "Déplier le menu" })).toBeVisible();
  await sidebar.getByRole("button", { name: "Déplier le menu" }).click();
  await expect(sidebar.getByRole("button", { name: "Réduire le menu" })).toBeVisible();
});

test("confirmation dialog: cancel and Esc submit nothing, confirm submits", async ({ page }) => {
  await signIn(page, owner);
  await page.goto("/app/catalog/new");
  await page.getByLabel("Nom de l'article").fill(product);
  await page.getByLabel("Prix de vente (DT)").fill("30");
  await page.getByRole("button", { name: "Créer l'article" }).click();
  await expect(page.getByText("Article créé.")).toBeVisible();

  await page.goto("/app/stock/opening");
  await pickVariant(page, product, new RegExp(product));
  await page.getByLabel("Quantité").fill("3");
  const submit = page.getByRole("button", { name: "Enregistrer le stock initial" });
  const dialog = page.getByRole("dialog", { name: "Confirmation" });

  await submit.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Confirmer" })).toBeFocused();
  await dialog.getByRole("button", { name: "Annuler" }).click();
  await expect(dialog).toBeHidden();

  await submit.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/app\/stock\/opening$/);

  await clickAndConfirm(page, submit);
  await expect(page.getByText("Stock initial enregistré.")).toBeVisible();
});

test("breadcrumbs lead back to the list", async ({ page }) => {
  await signIn(page, owner);
  await page.goto(`/app/catalog?q=${encodeURIComponent(product)}`);
  await page.getByRole("link", { name: new RegExp(product) }).click();
  const crumbs = page.getByRole("navigation", { name: "Fil d'Ariane" });
  await expect(crumbs.getByText(product)).toHaveAttribute("aria-current", "page");
  await crumbs.getByRole("link", { name: "Articles" }).click();
  await expect(page).toHaveURL(/\/app\/catalog$/);
});

test("a malformed id in a detail URL is a plain 404, never an error screen", async ({ page }) => {
  allowNotFoundResponses();
  await signIn(page, owner);
  // 36 characters that a loose /^[0-9a-f-]{36}$/ check lets through to Postgres.
  const bad = "-".repeat(36);
  for (const path of [
    `/app/catalog/${bad}`,
    `/app/customers/${bad}`,
    `/app/sales/${bad}`,
    `/app/sales/${bad}/receipt`,
    `/app/purchases/${bad}`,
    `/app/suppliers/${bad}`,
    `/app/stock/counts/${bad}`,
    `/app/stock/receipts/${bad}`,
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { name: "Page introuvable." })).toBeVisible();
  }
  // Drafts: a malformed id is ignored (empty form), not an error.
  for (const path of [`/app/sales/new?draft=${bad}`, `/app/purchases/new?draft=${bad}`]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
  }
});

test("the error screen is in French, shows a reference, and its retry button works", async ({ page, baseURL }) => {
  allowServerErrorResponses();
  await signIn(page, owner);
  await page.context().addCookies([{ name: "sp_test_fault", value: "1", url: baseURL as string }]);
  await page.goto("/app/test-fault");
  await expect(page.getByRole("heading", { name: "Une erreur est survenue" })).toBeVisible();
  await expect(page.getByText(/^Réf\. \d+/)).toBeVisible();
  await page.context().clearCookies({ name: "sp_test_fault" });
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("heading", { name: "Test fault cleared" })).toBeVisible();
});

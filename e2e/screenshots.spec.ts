/**
 * Visual review helper (not part of the regular suite): run with
 *   SP_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 * Captures key screens in light/dark, desktop/phone into test-results/screenshots.
 */
import { expect, test } from "./fixtures";
import { clickAndConfirm, createOrganization, newAccount, pickVariant, signUpAndConfirm } from "./helpers";

test.skip(!process.env.SP_SCREENSHOTS, "Visual review only (set SP_SCREENSHOTS=1).");

const dir = "test-results/screenshots";

test("capture key screens", async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);
  const owner = newAccount("Shots");
  await page.goto("/login");
  await page.screenshot({ path: `${dir}/01-login-light.png` });

  await signUpAndConfirm(page, owner, baseURL as string);
  await createOrganization(page, "Boutique El Medina");
  for (const [name, price] of [
    ["Robe d'été lin", "89"],
    ["Foulard soie", "45"],
  ] as const) {
    await page.goto("/app/catalog/new");
    await page.getByLabel("Nom de l'article").fill(name);
    await page.getByLabel("Prix de vente (DT)").fill(price);
    await page.getByRole("button", { name: "Créer l'article" }).click();
    await expect(page.getByText("Article créé.")).toBeVisible();
  }
  await page.goto("/app/stock/opening");
  await pickVariant(page, "Robe", /Robe d'été lin/);
  await page.getByLabel("Quantité").fill("2");
  await clickAndConfirm(page, page.getByRole("button", { name: "Enregistrer le stock initial" }));

  await page.setViewportSize({ width: 1366, height: 860 });
  await page.goto("/app");
  await page.screenshot({ path: `${dir}/02-dashboard-light.png` });
  await page.goto("/app/catalog");
  await page.screenshot({ path: `${dir}/03-catalog-light.png` });

  await page.getByRole("radio", { name: "Sombre" }).click();
  await page.goto("/app/stock");
  await page.screenshot({ path: `${dir}/04-stock-dark.png` });
  await page.goto("/app/sales/new");
  await pickVariant(page, "Foulard", /Foulard soie/);
  await page.getByRole("button", { name: /Tout en espèces/ }).click();
  await page.screenshot({ path: `${dir}/05-cart-dark.png`, fullPage: true });
  await page.getByRole("button", { name: "Valider la vente" }).click();
  await page.waitForTimeout(400); // let the 140 ms entry animation finish
  await page.screenshot({ path: `${dir}/06-confirm-dialog-dark.png` });
  await page.getByRole("button", { name: "Annuler" }).click();

  await page.locator("aside").getByRole("button", { name: "Réduire le menu" }).click();
  await page.getByRole("radio", { name: "Clair" }).count();
  await page.screenshot({ path: `${dir}/07-collapsed-dark.png` });

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, baseURL, storageState: await page.context().storageState() });
  const mobile = await phone.newPage();
  await mobile.goto("/app/stock");
  await mobile.screenshot({ path: `${dir}/08-stock-phone-dark.png` });
  await phone.addCookies([{ name: "sp_theme", value: "light", url: baseURL as string }]);
  await mobile.goto("/app/sales/new");
  await mobile.screenshot({ path: `${dir}/09-cart-phone-light.png` });
  await phone.close();
});

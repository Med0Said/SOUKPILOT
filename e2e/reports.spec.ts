/**
 * Phase 3: role dashboards, Rapports page (figures, margin, chart, CSV export)
 * and the installable web app manifest. Runs under the console/CSP guard.
 */
import { expect, test } from "./fixtures";
import { clickAndConfirm, createOrganization, newAccount, pickVariant, signUpAndConfirm } from "./helpers";

test.describe.configure({ mode: "serial" });

const owner = newAccount("ReportsOwner");
const product = `Parfum Rapport ${Date.now().toString(36)}`;
const money = (text: string) => new RegExp(`${text}\\s*DT`);

test("a sale shows up on the dashboard and in the reports, with its margin", async ({ page, baseURL }) => {
  await signUpAndConfirm(page, owner, baseURL as string);
  await createOrganization(page, `Boutique Rapports ${Date.now()}`);

  // Fresh shop: zeros, nothing invented.
  await expect(page.getByRole("heading", { name: /Aujourd'hui/ })).toBeVisible();
  await expect(page.locator("dl").getByText("Ventes nettes").locator("..")).toContainText(money("0,000"));

  // Article 40 DT, cost 15 DT, 5 in stock; sell 2 in cash.
  await page.goto("/app/catalog/new");
  await page.getByLabel("Nom de l'article").fill(product);
  await page.getByLabel("Prix de vente (DT)").fill("40");
  await page.getByLabel("Prix d'achat (DT)").fill("15");
  await page.getByRole("button", { name: "Créer l'article" }).click();
  await expect(page.getByText("Article créé.")).toBeVisible();
  await page.goto("/app/stock/opening");
  await pickVariant(page, product, new RegExp(product));
  await page.getByLabel("Quantité").fill("5");
  await clickAndConfirm(page, page.getByRole("button", { name: "Enregistrer le stock initial" }));
  await expect(page.getByText("Stock initial enregistré.")).toBeVisible();

  await page.goto("/app/sales/new");
  await pickVariant(page, product, new RegExp(product));
  await page.getByLabel("Qté").fill("2");
  await page.getByRole("button", { name: "+ Ajouter un paiement" }).click();
  await page.getByLabel("Montant (DT)").fill("80");
  await clickAndConfirm(page, page.getByRole("button", { name: "Valider la vente" }));
  await expect(page.getByText("Vente enregistrée.")).toBeVisible();

  // Dashboard: today's figures and the 7-day card.
  await page.goto("/app");
  const today = page.getByRole("region", { name: /Aujourd'hui/ });
  await expect(today.getByText("Ventes nettes").locator("..")).toContainText(money("80,000"));
  await expect(today.getByText("Encaissé").locator("..")).toContainText(money("80,000"));
  await expect(page.getByRole("heading", { name: "7 derniers jours" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Histogramme des ventes nettes/ })).toBeVisible();

  // Reports: net 80, margin 2 × (40 − 15) = 50 (62,5 %).
  await page.getByRole("link", { name: "Rapports" }).first().click();
  await expect(page).toHaveURL(/\/app\/reports/);
  const kpis = page.locator("dl").first();
  await expect(kpis.getByText("Ventes nettes").locator("..")).toContainText(money("80,000"));
  await expect(kpis.getByText("Marge brute estimée").locator("..")).toContainText(money("50,000"));
  await expect(kpis.getByText("Marge brute estimée").locator("..")).toContainText("62,5 %");
  await expect(page.getByRole("row", { name: new RegExp(product) })).toContainText("2");

  // Period presets keep working (today has the sale, yesterday has none).
  await page.getByRole("link", { name: "Hier", exact: true }).click();
  await expect(page.locator("dl").first().getByText("Ventes nettes").locator("..")).toContainText(money("0,000"));
  // 30 days: a large page that React streams in chunks; the chart must not
  // produce inline-style placeholders blocked by the CSP (guarded fixture).
  await page.getByRole("link", { name: "30 jours", exact: true }).click();
  await expect(page.getByRole("img", { name: /Histogramme des ventes nettes/ })).toBeVisible();
  await expect(page.locator("dl").first().getByText("Ventes nettes").locator("..")).toContainText(money("80,000"));
  await page.getByRole("link", { name: "Aujourd'hui", exact: true }).click();

  // CSV export of the products table.
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Articles (CSV)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^rapport-articles-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
  const text = await (await file.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString("utf8"));
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain(`${product};Sans catégorie;2;80,000;30,000;50,000;0,000`);
});

test("report exports require a signed-in user", async ({ page }) => {
  // The proxy redirects to /login (307); the route itself would answer 401.
  const anonymous = await page.request.get("/app/reports/export?kind=days", { maxRedirects: 0 });
  expect([307, 401]).toContain(anonymous.status());
});

test("the app is installable: manifest and icons are served", async ({ page }) => {
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const body = (await manifest.json()) as { start_url: string; display: string; icons: { src: string; purpose: string }[] };
  expect(body).toMatchObject({ start_url: "/app", display: "standalone" });
  expect(body.icons.map((i) => i.purpose)).toEqual(["any", "any", "maskable"]);
  for (const icon of body.icons) {
    const r = await page.request.get(icon.src);
    expect(r.ok()).toBe(true);
    expect(r.headers()["content-type"]).toBe("image/png");
  }
  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

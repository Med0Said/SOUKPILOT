/**
 * Phase 4 integrations: off by default, owner switch, barcode suggestion
 * applied only on request (with attribution), indicative currency converter.
 * Providers answer from offline fixtures (SP_FAKE_INTEGRATIONS=1).
 */
import { expect, test } from "./fixtures";
import { apiAs } from "./api";
import { createOrganization, newAccount, signUpAndConfirm } from "./helpers";

test.describe.configure({ mode: "serial" });

const owner = newAccount("IntOwner");

test("integrations are off until the owner switches them on", async ({ page, baseURL }) => {
  await signUpAndConfirm(page, owner, baseURL as string);
  await createOrganization(page, `Boutique Intégrations ${Date.now()}`);

  await page.goto("/app/catalog/new");
  await expect(page.getByRole("button", { name: "Chercher ce code-barres" })).toHaveCount(0);

  await page.goto("/app/settings");
  await page.getByRole("link", { name: /Intégrations/ }).click();
  const barcode = page.getByRole("region", { name: "Pré-remplissage par code-barres" });
  const rates = page.getByRole("region", { name: "Taux de change indicatifs" });
  await expect(barcode.getByText("Désactivée")).toBeVisible();
  await expect(rates.getByText("Désactivée")).toBeVisible();
  await expect(page.getByRole("region", { name: "E-mails transactionnels" })).toContainText("Non disponible");

  await barcode.getByRole("button", { name: "Activer" }).click();
  await expect(barcode.getByText("Activée")).toBeVisible();
  await rates.getByRole("button", { name: "Activer" }).click();
  await expect(rates.getByText("Activée")).toBeVisible();
});

test("barcode lookup suggests, the user decides", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(owner.email);
  await page.getByLabel("Mot de passe").fill(owner.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/app/);

  await page.goto("/app/catalog/new");
  const name = page.getByLabel("Nom de l'article");
  const code = page.getByLabel("Code-barres");
  const search = page.getByRole("button", { name: "Chercher ce code-barres" });

  await code.fill("6199990000017"); // wrong check digit
  await expect(search).toBeDisabled();

  await code.fill("96385074"); // valid, unknown
  await search.click();
  await expect(page.getByText("Aucun produit connu pour ce code-barres.")).toBeVisible();

  await code.fill("6199990000016");
  await search.click();
  await expect(page.getByText("Harissa traditionnelle")).toBeVisible();
  await expect(page.getByText("Le Phare du Cap Bon · 135 g")).toBeVisible();
  await expect(page.getByText("Données Open Food Facts, licence ODbL.")).toBeVisible();
  await expect(name).toHaveValue(""); // nothing applied yet
  await page.getByRole("button", { name: "Utiliser ce nom" }).click();
  await expect(name).toHaveValue("Harissa traditionnelle");

  await page.getByLabel("Prix de vente (DT)").fill("4,5");
  await page.getByRole("button", { name: "Créer l'article" }).click();
  await expect(page.getByText("Article créé.")).toBeVisible();
});

test("indicative currency conversion, then switching off", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(owner.email);
  await page.getByLabel("Mot de passe").fill(owner.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/app/);

  await page.goto("/app/purchases/new");
  await page.getByText("Convertir une devise (indicatif)").click();
  await page.getByLabel("Montant").fill("100");
  await page.getByLabel("Devise").selectOption("EUR");
  await page.getByRole("button", { name: "Convertir" }).click();
  await expect(page.getByText(/100 EUR ≈ 333,333\s*DT/)).toBeVisible();
  await expect(page.getByText(/Taux indicatif du 2026-10-14/)).toBeVisible();

  // Past the per-minute quota, the converter says so in its own words (not
  // the barcode lookup's). The quota is spent through the API, as the owner;
  // the fixed window can roll over between the two steps, hence the retry.
  const api = await apiAs(owner);
  const { data: org, error } = await api.from("organizations").select("id").single();
  expect(error).toBeNull();
  await expect(async () => {
    for (let i = 0; i < 40; i++) {
      const { error: quota } = await api.rpc("consume_integration_call", { p_organization_id: org!.id, p_integration: "exchange_rates" });
      if (quota) {
        expect(quota.message).toContain("rate_limited");
        break;
      }
    }
    await page.getByRole("button", { name: "Convertir" }).click();
    await expect(page.getByText("Trop de conversions en une minute. Réessayez dans un instant.")).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByText(/recherches/)).toHaveCount(0);

  await page.goto("/app/settings/integrations");
  const barcode = page.getByRole("region", { name: "Pré-remplissage par code-barres" });
  await expect(barcode).toContainText(/réussi le/);
  await barcode.getByRole("button", { name: "Désactiver" }).click();
  await expect(barcode.getByText("Désactivée")).toBeVisible();
  await page.goto("/app/catalog/new");
  await expect(page.getByRole("button", { name: "Chercher ce code-barres" })).toHaveCount(0);
});

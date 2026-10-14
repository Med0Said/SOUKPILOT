import { expect, test } from "./fixtures";
import { createOrganization, newAccount, signIn, signUpAndConfirm } from "./helpers";

test("unauthenticated users are sent to the login page", async ({ page }) => {
  await page.goto("/app/sales");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fsales/);
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
});

test("sign up → confirm email → create organization → sign out → sign in", async ({ page, baseURL }) => {
  const owner = newAccount("Auth");
  await signUpAndConfirm(page, owner, baseURL as string);
  await createOrganization(page, `Boutique E2E ${Date.now()}`);
  await expect(page.getByRole("heading", { name: /Bienvenue/ })).toBeVisible();

  await page.getByRole("button", { name: "Se déconnecter" }).first().click();
  await expect(page).toHaveURL(/\/login/);

  // Wrong password is refused with a French message.
  await page.getByLabel("Adresse e-mail").fill(owner.email);
  await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe-1");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();

  await signIn(page, owner);
  await expect(page).toHaveURL(/\/app$/);
});

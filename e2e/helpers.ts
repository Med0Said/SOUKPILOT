import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

/** Local Mailpit started by `supabase start`. */
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export type TestAccount = { name: string; email: string; password: string };

/** Fresh, unique test account (local test data only; never real credentials). */
export function newAccount(label: string): TestAccount {
  const id = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  return {
    name: `E2E ${label}`,
    email: `e2e-${label.toLowerCase()}-${id}@soukpilot.test`,
    password: `Sp-${randomUUID().slice(0, 8)}-2026`,
  };
}

type MailpitSummary = { ID: string; To: { Address: string }[]; Subject: string };

/** Waits for the latest email to `to` and returns its first link matching `pattern`. */
export async function linkFromEmail(to: string, pattern: RegExp): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=1`);
    if (search.ok) {
      const body = (await search.json()) as { messages: MailpitSummary[] };
      const message = body.messages[0];
      if (message) {
        const detail = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as { HTML: string; Text: string };
        const hrefs = [...(detail.HTML ?? "").matchAll(/href="([^"]+)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));
        const link = hrefs.find((h) => pattern.test(h));
        if (link) return link;
        throw new Error(`No link matching ${pattern} in email "${message.Subject}"`);
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email received for ${to}`);
}

/**
 * Email links point at the Supabase `site_url`; rewrite our /auth/confirm link
 * to the server under test so the session cookie lands on the right origin.
 */
export function toBaseUrl(link: string, baseURL: string): string {
  const url = new URL(link);
  if (url.pathname === "/auth/confirm") {
    const target = new URL(baseURL);
    url.protocol = target.protocol;
    url.host = target.host;
  }
  return url.toString();
}

/** Signs up through the UI and confirms the email through the real link. */
export async function signUpAndConfirm(page: Page, account: TestAccount, baseURL: string): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Nom complet").fill(account.name);
  await page.getByLabel("Adresse e-mail").fill(account.email);
  await page.getByLabel("Mot de passe").fill(account.password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByText("Vérifiez votre boîte e-mail")).toBeVisible();

  const link = await linkFromEmail(account.email, /\/auth\/(confirm|v1\/verify)/);
  await page.goto(toBaseUrl(link, baseURL));
  await expect(page).toHaveURL(/\/onboarding/);
}

export async function signIn(page: Page, account: TestAccount): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(account.email);
  await page.getByLabel("Mot de passe").fill(account.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/(app|onboarding)/);
}

export async function createOrganization(page: Page, name: string): Promise<void> {
  await page.goto("/onboarding");
  await page.getByLabel("Nom de l'entreprise").fill(name);
  await page.getByRole("button", { name: "Créer l'organisation" }).click();
  await page.waitForURL(/\/app$/);
}

/** Accepts the next window.confirm (used for irreversible actions). */
export function acceptNextConfirm(page: Page): void {
  page.once("dialog", (dialog) => void dialog.accept());
}

/** Picks an article in a VariantPicker by typing then clicking the result. */
export async function pickVariant(page: Page, query: string, resultText: RegExp): Promise<void> {
  const box = page.getByPlaceholder(/Nom, SKU ou code-barres/).first();
  await box.fill(query);
  await page.getByRole("button", { name: resultText }).first().click();
}

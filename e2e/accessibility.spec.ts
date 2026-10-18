/**
 * Accessibility bar (CONSTRAINTS.md), measured in a real browser on the main
 * screens, light and dark, desktop and phone, plus reflow at 320 px.
 * WCAG 2.2 AA checks computed from the rendered page (no extra dependency):
 * text contrast (1.4.3), accessible names (4.1.2), headings (1.3.1), one
 * <main>, unique nav labels, duplicate ids, lang (3.1.1), reflow (1.4.10),
 * visible keyboard focus (2.4.7) and target size ≥ 24 px (2.5.8).
 * Known undersized targets are a tracked exception (CONSTRAINTS.md E2) that
 * fails this test once expired.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { clickAndConfirm, createOrganization, newAccount, pickVariant, signUpAndConfirm } from "./helpers";

test.describe.configure({ mode: "serial" });

// Dated exceptions (CONSTRAINTS.md); none open. E2 (A1, A3) closed in phase C.
const SMALL_TARGET_EXCEPTIONS: RegExp[] = [];
const SMALL_TARGET_EXCEPTIONS_EXPIRE = "2026-11-30";
// None open. E3 (A4) closed in phase C.
const REFLOW_EXCEPTIONS: string[] = [];
const REFLOW_EXCEPTIONS_EXPIRE = "2026-11-30";

type Issue = { check: string; detail: string };

/** WCAG signals computed in the page (see file header). */
function measure(page: Page): Promise<Issue[]> {
  return page.evaluate(() => {
    const out: { check: string; detail: string }[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      // 1×1 px = the visually-hidden ("sr-only") pattern: read by screen readers, not a pointer target.
      const visuallyHidden = r.width <= 1 && r.height <= 1;
      return r.width > 0 && r.height > 0 && !visuallyHidden && s.visibility !== "hidden" && s.display !== "none" && !el.closest("[hidden],[aria-hidden=true],dialog:not([open])");
    };
    const rgba = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = "1"] = m[1].split(/[ ,/]+/).filter(Boolean);
      return [Number(r), Number(g), Number(b), Number(a)];
    };
    const luminance = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const background = (el: Element | null) => {
      const layers: number[][] = [];
      for (let e = el; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c && c[3] > 0) {
          layers.push(c);
          if (c[3] >= 1) break;
        }
      }
      let base = [255, 255, 255];
      for (const l of layers.reverse()) base = base.map((v, i) => v * (1 - l[3]) + l[i] * l[3]);
      return base;
    };
    const label = (el: Element) => ((el as HTMLElement).innerText || el.getAttribute("aria-label") || "").trim().slice(0, 40) || el.getAttribute("type") || el.tagName.toLowerCase();
    const accessibleName = (el: Element) => {
      const ids = el.getAttribute("aria-labelledby");
      const byIds = ids ? ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ") : "";
      const labels = (el as HTMLInputElement).labels ? [...(el as HTMLInputElement).labels!].map((l) => l.textContent).join(" ") : "";
      return `${el.getAttribute("aria-label") ?? ""}${byIds}${labels}${(el as HTMLElement).innerText ?? ""}${el.getAttribute("title") ?? ""}`.trim();
    };

    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el) || el.closest("svg")) continue;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) continue;
      if ((el as HTMLButtonElement).disabled || el.closest("[disabled],[aria-disabled=true]")) continue;
      const s = getComputedStyle(el);
      const fg = rgba(s.color);
      if (!fg) continue;
      const bg = background(el);
      const blended = fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
      const [hi, lo] = [luminance(blended), luminance(bg)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) out.push({ check: "1.4.3 contrast", detail: `${ratio.toFixed(2)}:1 "${label(el)}"` });
    }
    for (const el of document.querySelectorAll("input:not([type=hidden]), select, textarea, button, a[href], [role=button], [role=combobox], [role=option]")) {
      if (visible(el) && !accessibleName(el)) out.push({ check: "4.1.2 name", detail: el.outerHTML.slice(0, 100) });
    }
    for (const el of document.querySelectorAll("button, a[href], input, select, [role=button], summary")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      const inlineLink = el.tagName === "A" && getComputedStyle(el).display === "inline";
      if (!inlineLink && (r.width < 24 || r.height < 24)) out.push({ check: "2.5.8 target", detail: label(el) });
    }
    const levels = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible).map((h) => Number(h.tagName[1]));
    if (levels.filter((l) => l === 1).length !== 1) out.push({ check: "1.3.1 one h1", detail: String(levels.filter((l) => l === 1).length) });
    levels.forEach((l, i) => i > 0 && l > levels[i - 1] + 1 && out.push({ check: "1.3.1 heading skip", detail: `h${levels[i - 1]} → h${l}` }));
    if (document.querySelectorAll("main").length !== 1) out.push({ check: "landmark main", detail: String(document.querySelectorAll("main").length) });
    const navs = [...document.querySelectorAll("nav")].filter(visible).map((n) => n.getAttribute("aria-label") ?? "");
    navs.forEach((n, i) => navs.indexOf(n) !== i && out.push({ check: "landmark nav label", detail: n }));
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    ids.forEach((id, i) => ids.indexOf(id) !== i && out.push({ check: "4.1.1 duplicate id", detail: id }));
    const viewport = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > viewport + 1) {
      // Name the innermost elements that stick out, so a failure says where.
      const culprits = [...document.querySelectorAll("body *")]
        .filter((e) => e.getBoundingClientRect().right > viewport + 1 && ![...e.children].some((c) => c.getBoundingClientRect().right > viewport + 1))
        .slice(0, 3)
        .map((e) => `${e.tagName.toLowerCase()} "${(e.textContent ?? "").trim().slice(0, 25)}" right=${Math.round(e.getBoundingClientRect().right)}`);
      out.push({ check: "1.4.10 reflow", detail: `${document.documentElement.scrollWidth}px wide > ${viewport}px: ${culprits.join("; ")}` });
    }
    if (!document.documentElement.lang) out.push({ check: "3.1.1 lang", detail: "missing" });
    return out;
  });
}

async function unfocusedStops(page: Page): Promise<string[]> {
  const missing = new Set<string>();
  await page.mouse.click(1, 1);
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const shown = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
      return shown ? null : `${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30)}"`;
    });
    if (stop) missing.add(stop);
  }
  return [...missing];
}

function enforce(issues: Issue[], where: string) {
  const expired = new Date().toISOString().slice(0, 10) > SMALL_TARGET_EXCEPTIONS_EXPIRE;
  const blocking = issues.filter((i) => !(i.check === "2.5.8 target" && !expired && SMALL_TARGET_EXCEPTIONS.some((re) => re.test(i.detail))));
  expect(blocking, `accessibility issues on ${where}`).toEqual([]);
}

const owner = newAccount("A11yBar");

test("login screen, light and dark", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/login");
    enforce(await measure(page), `login (${scheme})`);
  }
  expect(await unfocusedStops(page), "focus indicator missing").toEqual([]);
});

test("main screens: light/dark, desktop/phone, reflow at 320 px, keyboard focus", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  await signUpAndConfirm(page, owner, baseURL as string);
  await createOrganization(page, `Boutique Accessibilité ${Date.now()}`);
  await page.goto("/app/catalog/new");
  await page.getByLabel("Nom de l'article").fill("Crème Accessible");
  await page.getByLabel("Prix de vente (DT)").fill("30");
  await page.getByLabel("Prix d'achat (DT)").fill("12");
  await page.getByRole("button", { name: "Créer l'article" }).click();
  await expect(page.getByText("Article créé.")).toBeVisible();
  await page.goto("/app/stock/opening");
  await pickVariant(page, "Crème", /Crème Accessible/);
  await page.getByLabel("Quantité").fill("2");
  await clickAndConfirm(page, page.getByRole("button", { name: "Enregistrer le stock initial" }));
  await page.goto("/app/sales/new");
  await pickVariant(page, "Crème", /Crème Accessible/);
  await page.getByRole("button", { name: /Tout en espèces/ }).click();
  await clickAndConfirm(page, page.getByRole("button", { name: "Valider la vente" }));
  await expect(page.getByText("Vente enregistrée.")).toBeVisible();

  const screens: [string, string, () => Promise<void>][] = [
    ["dashboard", "/app", async () => {}],
    ["cart", "/app/sales/new", () => pickVariant(page, "Crème", /Crème Accessible/)],
    ["stock", "/app/stock", async () => {}],
    ["catalog", "/app/catalog", async () => {}],
    ["reports", "/app/reports", async () => {}],
    [
      "palette",
      "/app",
      async () => {
        await page.keyboard.press("Control+k");
        await page.getByRole("combobox", { name: /Rechercher un article/ }).fill("cr");
        await expect(page.getByRole("option", { name: /Crème Accessible/ })).toBeVisible();
      },
    ],
  ];
  const variants = [
    { theme: "light", width: 1366, height: 860, focus: true },
    { theme: "dark", width: 1366, height: 860, focus: false },
    { theme: "light", width: 390, height: 844, focus: false },
    { theme: "dark", width: 390, height: 844, focus: false },
  ] as const;
  for (const v of variants) {
    await page.context().addCookies([{ name: "sp_theme", value: v.theme, url: baseURL as string }]);
    await page.setViewportSize({ width: v.width, height: v.height });
    for (const [name, url, prepare] of screens) {
      await page.goto(url);
      // Measure the page, not its loading skeleton (list pages stream).
      await expect(page.locator("main h1")).toBeVisible();
      await prepare();
      enforce(await measure(page), `${name} (${v.theme}, ${v.width}px)`);
      if (v.focus && name !== "palette") expect(await unfocusedStops(page), `focus indicator missing on ${name}`).toEqual([]);
    }
  }

  await page.setViewportSize({ width: 320, height: 700 });
  for (const [name, url] of screens.filter(([n]) => n !== "palette")) {
    await page.goto(url);
    await expect(page.locator("main h1")).toBeVisible();
    const reflow = (await measure(page)).filter((i) => i.check === "1.4.10 reflow");
    const excepted = REFLOW_EXCEPTIONS.includes(name) && new Date().toISOString().slice(0, 10) <= REFLOW_EXCEPTIONS_EXPIRE;
    if (!excepted) expect(reflow, `horizontal scroll at 320 px on ${name}`).toEqual([]);
  }
});

test("a skip link is the first tab stop and moves focus to the page content", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(owner.email);
  await page.getByLabel("Mot de passe").fill(owner.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/app/);
  // A fresh page: keyboard navigation starts at the top of the document.
  await page.reload();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Aller au contenu" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#contenu")).toBeFocused();
});

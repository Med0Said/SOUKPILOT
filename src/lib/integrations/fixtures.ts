import "server-only";
import type { FetchLike } from "./http";

/**
 * Offline stand-in for the providers, used ONLY by the end-to-end tests
 * (SP_FAKE_INTEGRATIONS=1) so they never depend on third-party uptime. It is
 * refused unless the site itself runs on localhost.
 */
export function fakeFetcher(): FetchLike | undefined {
  if (process.env.SP_FAKE_INTEGRATIONS !== "1") return undefined;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(site)) return undefined;

  return async (url: string) => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("currency-api")) {
      return json({ date: "2026-10-14", tnd: { eur: 0.3, usd: 0.333, gbp: 0.25, cny: 2.2, try: 16.4, aed: 1.22, sar: 1.25, dzd: 44.8, lyd: 2.14, mad: 3.27 } });
    }
    if (url.includes("/product/6199990000016.json") && url.includes("openfoodfacts")) {
      return json({ status: 1, product: { product_name_fr: "Harissa traditionnelle", brands: "Le Phare du Cap Bon, Autre", quantity: "135 g" } });
    }
    if (url.includes("/product/")) return json({ status: 0, status_verbose: "product not found" }, 404);
    return json({}, 404);
  };
}

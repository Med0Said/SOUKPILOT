import "server-only";
import { z } from "zod";
import { fetchJson, IntegrationError, recordOutcome, TtlCache, type FetchLike } from "./http";
import { isValidGtin } from "./gtin";

/**
 * Barcode pre-fill from Open Food Facts and Open Beauty Facts (free, no key,
 * data under the ODbL — attribution shown with every suggestion). Only the
 * barcode is sent. The result is a SUGGESTION: the user decides what to keep;
 * nothing is written to the catalog automatically.
 */

export const BARCODE_SOURCES = [
  { id: "openfoodfacts", name: "Open Food Facts", host: "https://world.openfoodfacts.org", productUrl: "https://world.openfoodfacts.org/product/" },
  { id: "openbeautyfacts", name: "Open Beauty Facts", host: "https://world.openbeautyfacts.org", productUrl: "https://world.openbeautyfacts.org/product/" },
] as const;

export type BarcodeSuggestion = {
  code: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  source: (typeof BARCODE_SOURCES)[number]["name"];
  sourceUrl: string;
  licence: "ODbL";
};

const clean = (v: string | undefined | null, max: number) => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

const productSchema = z.object({
  status: z.number(),
  product: z
    .object({
      product_name_fr: z.string().optional().nullable(),
      product_name: z.string().optional().nullable(),
      brands: z.string().optional().nullable(),
      quantity: z.string().optional().nullable(),
    })
    .optional(),
});

/** Maps one provider's JSON to a suggestion (null when unknown there). */
export function parseProduct(body: unknown, code: string, source: (typeof BARCODE_SOURCES)[number]): BarcodeSuggestion | null {
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) throw new IntegrationError("invalid_response", "unexpected product shape");
  const p = parsed.data.product;
  if (parsed.data.status !== 1 || !p) return null;
  const name = clean(p.product_name_fr, 200) ?? clean(p.product_name, 200);
  if (!name) return null;
  return {
    code,
    name,
    brand: clean(p.brands?.split(",")[0], 80),
    quantity: clean(p.quantity, 40),
    source: source.name,
    sourceUrl: `${source.productUrl}${code}`,
    licence: "ODbL",
  };
}

const cache = new TtlCache<BarcodeSuggestion | null>(1000);
const FOUND_TTL = 24 * 3600_000;
const MISSING_TTL = 3600_000;

/**
 * Looks the code up in each source in turn. Throws IntegrationError when a
 * provider fails (so the UI can say "service unavailable" rather than "not found").
 */
export async function lookupBarcode(code: string, fetcher?: FetchLike): Promise<BarcodeSuggestion | null> {
  if (!isValidGtin(code)) return null;
  const cached = cache.get(code);
  if (cached !== undefined) return cached;

  for (const source of BARCODE_SOURCES) {
    const url = `${source.host}/api/v2/product/${code}.json?fields=product_name,product_name_fr,brands,quantity`;
    try {
      const { status, body } = await fetchJson(url, { fetcher, timeoutMs: 5000 });
      if (status === 429) throw new IntegrationError("http", "HTTP 429");
      const suggestion = status === 404 ? null : parseProduct(body, code, source);
      recordOutcome(source.id);
      if (suggestion) {
        cache.set(code, suggestion, FOUND_TTL);
        return suggestion;
      }
    } catch (error) {
      const e = error instanceof IntegrationError ? error : new IntegrationError("network", String(error));
      recordOutcome(source.id, e);
      throw e;
    }
  }
  cache.set(code, null, MISSING_TTL);
  return null;
}

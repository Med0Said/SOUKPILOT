import "server-only";
import { z } from "zod";
import { fetchJson, IntegrationError, recordOutcome, TtlCache, type FetchLike } from "./http";

/**
 * INDICATIVE exchange rates to the Tunisian dinar, from the free
 * fawazahmed0/exchange-api (CC0, daily, includes TND; no documented source
 * and no service guarantee). Never stored, never used to compute a price or
 * a cost automatically: the user reads the indication and types the amount.
 * The authoritative rate is the Banque Centrale de Tunisie's.
 */

export const RATE_SOURCE = {
  name: "Exchange API (fawazahmed0)",
  url: "https://github.com/fawazahmed0/exchange-api",
  licence: "CC0",
  endpoints: [
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/tnd.json",
    "https://latest.currency-api.pages.dev/v1/currencies/tnd.json",
  ],
} as const;

/** Currencies offered in the converter (suppliers of Tunisian shops). */
export const CURRENCIES = ["EUR", "USD", "GBP", "CNY", "TRY", "AED", "SAR", "DZD", "LYD", "MAD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type TndRates = {
  /** Day the provider published the rates (YYYY-MM-DD). */
  date: string;
  /** Dinars for ONE unit of each currency. */
  tndPerUnit: Record<Currency, number>;
};

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tnd: z.record(z.string(), z.number()),
});

/** Provider JSON (units per 1 TND) → dinars per unit, sanity-checked. */
export function parseRates(body: unknown): TndRates {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new IntegrationError("invalid_response", "unexpected rates shape");
  const tndPerUnit = {} as Record<Currency, number>;
  for (const currency of CURRENCIES) {
    const perTnd = parsed.data.tnd[currency.toLowerCase()];
    if (!(typeof perTnd === "number" && perTnd > 0 && Number.isFinite(perTnd))) {
      throw new IntegrationError("invalid_response", `missing ${currency}`);
    }
    tndPerUnit[currency] = 1 / perTnd;
  }
  // Plausibility guard against a broken feed (EUR has stayed within 2–6 TND).
  if (tndPerUnit.EUR < 1 || tndPerUnit.EUR > 10) throw new IntegrationError("invalid_response", "implausible EUR rate");
  return { date: parsed.data.date, tndPerUnit };
}

const cache = new TtlCache<TndRates>(1);
const TTL = 6 * 3600_000;

export async function getTndRates(fetcher?: FetchLike): Promise<TndRates> {
  const cached = cache.get("tnd");
  if (cached) return cached;
  let lastError: IntegrationError | null = null;
  // Two mirrors of the same data: the second is used if the first fails.
  for (const endpoint of RATE_SOURCE.endpoints) {
    try {
      const { status, body } = await fetchJson(endpoint, { fetcher, timeoutMs: 4000, maxBytes: 200_000 });
      if (status !== 200) throw new IntegrationError("http", `HTTP ${status}`);
      const rates = parseRates(body);
      cache.set("tnd", rates, TTL);
      recordOutcome("exchange_rates");
      return rates;
    } catch (error) {
      lastError = error instanceof IntegrationError ? error : new IntegrationError("network", String(error));
    }
  }
  recordOutcome("exchange_rates", lastError);
  throw lastError ?? new IntegrationError("network", "unknown");
}

/** Amount in a foreign currency (minor units ignored) → indicative millimes, rounded. */
export function toTndMillimes(amount: number, currency: Currency, rates: TndRates): number {
  return Math.round(amount * rates.tndPerUnit[currency] * 1000);
}

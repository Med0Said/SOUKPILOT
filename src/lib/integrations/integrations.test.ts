import { describe, expect, it, vi } from "vitest";
import { isValidGtin, normalizeGtin } from "./gtin";
import { fetchJson, IntegrationError, TtlCache, type FetchLike } from "./http";
import { lookupBarcode, parseProduct, BARCODE_SOURCES } from "./barcode";
import { CURRENCIES, getTndRates, parseRates, toTndMillimes } from "./exchange-rates";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("GTIN", () => {
  it("validates check digits (EAN-8, UPC-A, EAN-13)", () => {
    expect(isValidGtin("3017620422003")).toBe(true); // real EAN-13
    expect(isValidGtin("6199990000016")).toBe(true);
    expect(isValidGtin("6199990000017")).toBe(false);
    expect(isValidGtin("96385074")).toBe(true); // EAN-8
    expect(isValidGtin("036000291452")).toBe(true); // UPC-A
    expect(isValidGtin("12345")).toBe(false);
    expect(isValidGtin("ABC1234567890")).toBe(false);
    expect(normalizeGtin(" 3017 6204-22003 ")).toBe("3017620422003");
  });
});

describe("fetchJson", () => {
  it("retries once on a server error, then succeeds", async () => {
    const fetcher = vi.fn<FetchLike>().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ ok: true }));
    await expect(fetchJson("https://x.test", { fetcher })).resolves.toEqual({ status: 200, body: { ok: true } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("sends an identifying User-Agent and no credentials", async () => {
    const fetcher = vi.fn<FetchLike>().mockResolvedValue(json({}));
    await fetchJson("https://x.test", { fetcher });
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^SoukPilot\//);
    expect(init.credentials).toBe("omit");
  });

  it("times out, refuses huge or non-JSON bodies", async () => {
    const slow: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("t", "TimeoutError"))));
    await expect(fetchJson("https://x.test", { fetcher: slow, timeoutMs: 20, retries: 0 })).rejects.toMatchObject({ reason: "timeout" });
    await expect(fetchJson("https://x.test", { fetcher: async () => new Response("x".repeat(100)), maxBytes: 10 })).rejects.toMatchObject({ reason: "too_large" });
    await expect(fetchJson("https://x.test", { fetcher: async () => new Response("<html>") })).rejects.toMatchObject({ reason: "invalid_response" });
  });

  it("gives up after the retry with the last error", async () => {
    const fetcher = vi.fn<FetchLike>().mockRejectedValue(new TypeError("ECONNRESET"));
    await expect(fetchJson("https://x.test", { fetcher, retries: 1 })).rejects.toBeInstanceOf(IntegrationError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("TtlCache", () => {
  it("expires entries and evicts the oldest when full", () => {
    const cache = new TtlCache<number>(2);
    cache.set("a", 1, 1000, 0);
    expect(cache.get("a", 999)).toBe(1);
    expect(cache.get("a", 1000)).toBeUndefined();
    cache.set("b", 2, 1000, 0);
    cache.set("c", 3, 1000, 0);
    cache.set("d", 4, 1000, 0);
    expect(cache.get("b", 1)).toBeUndefined();
    expect(cache.get("d", 1)).toBe(4);
  });
});

describe("barcode lookup", () => {
  const off = BARCODE_SOURCES[0];

  it("prefers the French name, keeps the first brand, trims text", () => {
    expect(
      parseProduct({ status: 1, product: { product_name: "Nutella", product_name_fr: "  Nutella   pâte ", brands: "Nutella, Ferrero", quantity: "400 g" } }, "3017620422003", off),
    ).toEqual({
      code: "3017620422003",
      name: "Nutella pâte",
      brand: "Nutella",
      quantity: "400 g",
      source: "Open Food Facts",
      sourceUrl: "https://world.openfoodfacts.org/product/3017620422003",
      licence: "ODbL",
    });
    expect(parseProduct({ status: 0 }, "1", off)).toBeNull();
    expect(parseProduct({ status: 1, product: { product_name: "" } }, "1", off)).toBeNull();
    expect(() => parseProduct("nope", "1", off)).toThrow(IntegrationError);
  });

  it("asks Open Food Facts, then Open Beauty Facts, sending only the barcode", async () => {
    const fetcher = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(json({ status: 0 }, 404))
      .mockResolvedValueOnce(json({ status: 1, product: { product_name: "Fond de teint", brands: "L'Oréal", quantity: "30ml" } }));
    const result = await lookupBarcode("3600523614486", fetcher);
    expect(result).toMatchObject({ name: "Fond de teint", source: "Open Beauty Facts" });
    expect(fetcher.mock.calls.map((c) => new URL(c[0]).host)).toEqual(["world.openfoodfacts.org", "world.openbeautyfacts.org"]);
    expect(fetcher.mock.calls[0][0]).toBe("https://world.openfoodfacts.org/api/v2/product/3600523614486.json?fields=product_name,product_name_fr,brands,quantity");
    // Cached: no second call.
    await lookupBarcode("3600523614486", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("never calls out for an invalid code; reports provider failures as errors", async () => {
    const fetcher = vi.fn<FetchLike>();
    expect(await lookupBarcode("123", fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    const down = vi.fn<FetchLike>().mockResolvedValue(json({}, 503));
    await expect(lookupBarcode("96385074", down)).rejects.toBeInstanceOf(IntegrationError);
  });
});

describe("exchange rates", () => {
  const feed = { date: "2026-10-14", tnd: Object.fromEntries(CURRENCIES.map((c) => [c.toLowerCase(), c === "EUR" ? 0.29733193 : 1])) };

  it("inverts the feed to dinars per unit and converts to millimes", () => {
    const rates = parseRates(feed);
    expect(rates.date).toBe("2026-10-14");
    expect(rates.tndPerUnit.EUR).toBeCloseTo(3.36324, 5);
    expect(toTndMillimes(100, "EUR", rates)).toBe(336_324);
  });

  it("rejects a broken or implausible feed", () => {
    expect(() => parseRates({ date: "2026-10-14", tnd: { eur: 0.3 } })).toThrow(/missing/);
    expect(() => parseRates({ ...feed, tnd: { ...feed.tnd, eur: 5 } })).toThrow(/implausible/);
    expect(() => parseRates({ date: "yesterday", tnd: feed.tnd })).toThrow(IntegrationError);
  });

  it("falls back to the mirror when the CDN fails, then caches", async () => {
    const fetcher = vi.fn<FetchLike>().mockRejectedValueOnce(new TypeError("down")).mockRejectedValueOnce(new TypeError("down")).mockResolvedValueOnce(json(feed));
    const rates = await getTndRates(fetcher);
    expect(rates.tndPerUnit.EUR).toBeCloseTo(3.36324, 5);
    expect(fetcher.mock.calls.at(-1)?.[0]).toContain("currency-api.pages.dev");
    await getTndRates(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

import { describe, expect, it } from "vitest";
import { addDays, listHref, parseChoice, parseDay, parsePage, parseQuery, parseUuid, queryString, todayIn } from "./list-params";

describe("list params", () => {
  it("parsePage clamps and defaults", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-3")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("7")).toBe(7);
    expect(parsePage("99999")).toBe(1000);
  });

  it("parseChoice only accepts known values", () => {
    const sorts = ["name", "price_asc"] as const;
    expect(parseChoice("price_asc", sorts, "name")).toBe("price_asc");
    expect(parseChoice("drop table", sorts, "name")).toBe("name");
    expect(parseChoice(undefined, sorts, "name")).toBe("name");
  });

  it("parseUuid and parseDay reject malformed input", () => {
    expect(parseUuid("6f1c0d1e-3b2a-4c5d-8e9f-0a1b2c3d4e5f")).toBe("6f1c0d1e-3b2a-4c5d-8e9f-0a1b2c3d4e5f");
    expect(parseUuid("------------------------------------")).toBeNull();
    expect(parseDay("2026-02-28")).toBe("2026-02-28");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("2026-2-3")).toBeNull();
    expect(parseDay(undefined)).toBeNull();
  });

  it("parseQuery trims and caps length", () => {
    expect(parseQuery("  crème  ")).toBe("crème");
    expect(parseQuery("x".repeat(500))).toHaveLength(100);
  });

  it("queryString drops empty values and page 1, in a stable order", () => {
    expect(queryString({ q: "robe", page: 1, inactive: false, category: null, sort: "" })).toBe("q=robe");
    expect(queryString({ sort: "price_asc", q: "é", page: 3, due: true })).toBe("due=1&page=3&q=%C3%A9&sort=price_asc");
    expect(listHref("/app/catalog", {})).toBe("/app/catalog");
    expect(listHref("/app/catalog", { page: 2 })).toBe("/app/catalog?page=2");
  });

  it("todayIn uses the organization's time zone; addDays is calendar arithmetic", () => {
    const lateEvening = new Date("2026-03-10T23:30:00Z");
    expect(todayIn("Africa/Tunis", lateEvening)).toBe("2026-03-11");
    expect(todayIn("UTC", lateEvening)).toBe("2026-03-10");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

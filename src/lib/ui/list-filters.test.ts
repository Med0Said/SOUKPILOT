import { describe, expect, it } from "vitest";
import { CATALOG_DEFAULTS, SALES_DEFAULTS, canonical, catalogFilters, customerFilters, movementFilters, salesFilters } from "./list-filters";

describe("list filters", () => {
  it("parse what a GET form submits, ignoring junk", () => {
    const f = catalogFilters({ q: "  robe ", category: "not-a-uuid", inactive: "1", sort: "price_desc", page: "2" });
    expect(f).toEqual({ q: "robe", category: null, inactive: true, sort: "price_desc", page: 2 });
    expect(catalogFilters({ sort: "'; drop table" }).sort).toBe("name");
    expect(customerFilters({ q: ["a", "b"] }).q).toBe("a");
  });

  it("canonical() drops defaults and the page, so saved views compare equal", () => {
    const fromForm = catalogFilters({ q: "", category: "", sort: "name", page: "4" });
    expect(canonical(fromForm, CATALOG_DEFAULTS)).toBe("");
    const sorted = catalogFilters({ q: "crème", sort: "recent" });
    expect(canonical(sorted, CATALOG_DEFAULTS)).toBe("q=cr%C3%A8me&sort=recent");
  });

  it("sales: valid days only, swapped when reversed", () => {
    expect(salesFilters({ from: "2026-03-31", to: "2026-03-01" })).toMatchObject({ from: "2026-03-01", to: "2026-03-31" });
    expect(salesFilters({ from: "2026-02-30" }).from).toBeNull();
    expect(salesFilters({ status: "cancelled" }).status).toBe("finalized");
    expect(canonical(salesFilters({ status: "draft", due: "1" }), SALES_DEFAULTS)).toBe("due=1&status=draft");
  });

  it("movements accept only known movement types", () => {
    const known = (v: string) => v === "sale";
    expect(movementFilters({ type: "sale" }, known).type).toBe("sale");
    expect(movementFilters({ type: "hack" }, known).type).toBeNull();
  });
});

/**
 * Filters of each list page, parsed from the URL. The page and its CSV
 * export parse the same parameters, so "Exporter" always exports exactly
 * what the list shows (all pages of it).
 *
 * Keys are the URL parameter names. `canonical()` drops defaults so links,
 * saved views and the address bar stay short and comparable.
 */
import { parseChoice, parseDay, parsePage, parseQuery, parseUuid, queryString, type ParamValue } from "./list-params";

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (sp: SearchParams, key: string): string | undefined => {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
};

/** Removes default values (and page) → the part of the URL worth saving. */
export function canonical(values: Record<string, ParamValue>, defaults: Record<string, ParamValue>): string {
  const kept: Record<string, ParamValue> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "page") continue;
    if (defaults[key] === value) continue;
    kept[key] = value;
  }
  return queryString(kept);
}

// ---------------------------------------------------------------------------
export const CATALOG_SORTS = ["name", "name_desc", "price_asc", "price_desc", "recent"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export function catalogFilters(sp: SearchParams) {
  return {
    q: parseQuery(one(sp, "q")),
    category: parseUuid(one(sp, "category")),
    inactive: one(sp, "inactive") === "1",
    sort: parseChoice<CatalogSort>(one(sp, "sort"), CATALOG_SORTS, "name"),
    page: parsePage(one(sp, "page")),
  };
}
export const CATALOG_DEFAULTS = { q: "", category: null, inactive: false, sort: "name" } as const;

// ---------------------------------------------------------------------------
export const STOCK_SORTS = ["name", "quantity_asc", "quantity_desc"] as const;
export type StockSort = (typeof STOCK_SORTS)[number];

export function stockFilters(sp: SearchParams) {
  return {
    q: parseQuery(one(sp, "q")),
    /** Validated against the organization's active locations by the caller. */
    location: parseUuid(one(sp, "location")),
    low: one(sp, "low") === "1",
    sort: parseChoice<StockSort>(one(sp, "sort"), STOCK_SORTS, "name"),
    page: parsePage(one(sp, "page")),
  };
}
export const STOCK_DEFAULTS = { q: "", location: null, low: false, sort: "name" } as const;

// ---------------------------------------------------------------------------
export const SALES_SORTS = ["recent", "oldest", "total_desc", "total_asc", "due_desc"] as const;
export type SalesSort = (typeof SALES_SORTS)[number];

export function salesFilters(sp: SearchParams) {
  let from = parseDay(one(sp, "from"));
  let to = parseDay(one(sp, "to"));
  if (from && to && from > to) [from, to] = [to, from];
  return {
    status: one(sp, "status") === "draft" ? ("draft" as const) : ("finalized" as const),
    q: parseQuery(one(sp, "q"), 60),
    from,
    to,
    customer: parseUuid(one(sp, "customer")),
    due: one(sp, "due") === "1",
    sort: parseChoice<SalesSort>(one(sp, "sort"), SALES_SORTS, "recent"),
    page: parsePage(one(sp, "page")),
  };
}
export const SALES_DEFAULTS = { status: "finalized", q: "", from: null, to: null, customer: null, due: false, sort: "recent" } as const;

// ---------------------------------------------------------------------------
export const CUSTOMER_SORTS = ["name", "recent", "balance_desc"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export function customerFilters(sp: SearchParams) {
  return {
    q: parseQuery(one(sp, "q")),
    due: one(sp, "due") === "1",
    sort: parseChoice<CustomerSort>(one(sp, "sort"), CUSTOMER_SORTS, "name"),
    page: parsePage(one(sp, "page")),
  };
}
export const CUSTOMER_DEFAULTS = { q: "", due: false, sort: "name" } as const;

// ---------------------------------------------------------------------------
export const PURCHASE_SORTS = ["recent", "oldest", "total_desc", "expected"] as const;
export type PurchaseSort = (typeof PURCHASE_SORTS)[number];

export function purchaseFilters(sp: SearchParams) {
  return {
    view: one(sp, "view") === "all" ? ("all" as const) : ("open" as const),
    supplier: parseUuid(one(sp, "supplier")),
    sort: parseChoice<PurchaseSort>(one(sp, "sort"), PURCHASE_SORTS, "recent"),
    page: parsePage(one(sp, "page")),
  };
}
export const PURCHASE_DEFAULTS = { view: "open", supplier: null, sort: "recent" } as const;

// ---------------------------------------------------------------------------
export function movementFilters(sp: SearchParams, isMovementType: (value: string) => boolean) {
  const type = one(sp, "type");
  return {
    variant: parseUuid(one(sp, "variant")),
    location: parseUuid(one(sp, "location")),
    type: type && isMovementType(type) ? type : null,
    page: parsePage(one(sp, "page")),
  };
}
export const MOVEMENT_DEFAULTS = { variant: null, location: null, type: null } as const;

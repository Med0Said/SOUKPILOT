/**
 * URL search parameters of list pages (filters, sort, page). Everything comes
 * from the address bar, so every value is validated and defaulted here; the
 * database functions validate again (limits, unknown sorts fall back).
 */

export const MAX_PAGE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_PAGE, n)) : 1;
}

export function parseChoice<T extends string>(value: string | undefined, choices: readonly T[], fallback: T): T {
  return choices.includes(value as T) ? (value as T) : fallback;
}

export function parseUuid(value: string | undefined): string | null {
  return value && UUID.test(value) ? value : null;
}

/** A real calendar day "YYYY-MM-DD" (rejects 2026-02-30), else null. */
export function parseDay(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? value : null;
}

export function parseQuery(value: string | undefined, maxLength = 100): string {
  return (value ?? "").trim().slice(0, maxLength);
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export type ParamValue = string | number | boolean | null | undefined;

/**
 * Query string from params, dropping empty values, `false` and page 1, in a
 * stable order (so saved views and links compare equal).
 */
export function queryString(params: Record<string, ParamValue>): string {
  const sp = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value === null || value === undefined || value === false || value === "") continue;
    if (key === "page" && Number(value) <= 1) continue;
    sp.set(key, value === true ? "1" : String(value));
  }
  return sp.toString();
}

export function listHref(base: string, params: Record<string, ParamValue>): string {
  const qs = queryString(params);
  return qs ? `${base}?${qs}` : base;
}

/** Today's date "YYYY-MM-DD" in a time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Calendar arithmetic on "YYYY-MM-DD" (time-zone free). */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

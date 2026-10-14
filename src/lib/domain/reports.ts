/**
 * Report helpers (pure): periods, totals, comparisons and chart scales.
 * Formulas of the figures themselves live in SQL (supabase/migrations/
 * 20261019090000_reports.sql) and are documented in docs/REPORTS.md.
 */
import { addDays, parseDay } from "@/lib/ui/list-params";

export const PERIOD_PRESETS = ["today", "yesterday", "7d", "30d", "month", "last_month", "custom"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export type Period = { preset: PeriodPreset; from: string; to: string };

/** Longest period a report accepts (mirrors private.require_report_period). */
export const MAX_PERIOD_DAYS = 367;

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Period from URL params; `today` is the organization's local date. */
export function resolvePeriod(params: { period?: string; from?: string; to?: string }, today: string): Period {
  const preset = (PERIOD_PRESETS as readonly string[]).includes(params.period ?? "") ? (params.period as PeriodPreset) : "7d";
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case "today":
      return { preset, from: today, to: today };
    case "yesterday":
      return { preset, from: addDays(today, -1), to: addDays(today, -1) };
    case "30d":
      return { preset, from: addDays(today, -29), to: today };
    case "month":
      return { preset, from: monthStart, to: today };
    case "last_month": {
      const end = addDays(monthStart, -1);
      return { preset, from: `${end.slice(0, 7)}-01`, to: end };
    }
    case "custom": {
      let from = parseDay(params.from) ?? addDays(today, -6);
      let to = parseDay(params.to) ?? today;
      if (from > to) [from, to] = [to, from];
      if (daysBetween(from, to) >= MAX_PERIOD_DAYS) from = addDays(to, -(MAX_PERIOD_DAYS - 1));
      return { preset, from, to };
    }
    default:
      return { preset: "7d", from: addDays(today, -6), to: today };
  }
}

/** The period of the same length just before (for "vs previous period"). */
export function previousPeriod(period: { from: string; to: string }): { from: string; to: string } {
  const length = daysBetween(period.from, period.to) + 1;
  return { from: addDays(period.from, -length), to: addDays(period.from, -1) };
}

export type DayFigures = {
  sales_count: number;
  sales_total_millimes: number;
  returns_millimes: number;
  net_sales_millimes: number;
  credit_given_millimes: number;
  cost_millimes: number;
  margin_millimes: number;
  revenue_without_cost_millimes: number;
};

export type Totals = DayFigures & {
  /** Net sales ÷ sales count, rounded half-up to the millime; null without sales. */
  average_basket_millimes: number | null;
  /** Margin ÷ revenue with known cost, in basis points; null when no cost is known. */
  margin_rate_bps: number | null;
};

export function sumDays(rows: readonly DayFigures[]): Totals {
  const t: DayFigures = {
    sales_count: 0,
    sales_total_millimes: 0,
    returns_millimes: 0,
    net_sales_millimes: 0,
    credit_given_millimes: 0,
    cost_millimes: 0,
    margin_millimes: 0,
    revenue_without_cost_millimes: 0,
  };
  for (const r of rows) for (const key of Object.keys(t) as (keyof DayFigures)[]) t[key] += r[key];
  const knownRevenue = t.net_sales_millimes - t.revenue_without_cost_millimes;
  return {
    ...t,
    average_basket_millimes: t.sales_count > 0 ? Math.round(t.net_sales_millimes / t.sales_count) : null,
    margin_rate_bps: knownRevenue > 0 && t.cost_millimes > 0 ? Math.round((t.margin_millimes * 10_000) / knownRevenue) : null,
  };
}

/** Relative change in percent (one decimal), null when there is no base. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/** A "nice" axis maximum ≥ value: 1, 2, 2.5 or 5 × 10^n. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  for (const step of [1, 2, 2.5, 5, 10]) if (step * base >= value) return step * base;
  return 10 * base;
}

export type Bar = { x: number; y: number; width: number; height: number; value: number; label: string };

/**
 * Bar geometry for an SVG of `width` × `height` (negative values are drawn
 * as zero-height bars: net sales can be negative on a day with only returns).
 */
export function barLayout(
  points: readonly { label: string; value: number }[],
  width: number,
  height: number,
): { bars: Bar[]; max: number } {
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const slot = points.length ? width / points.length : width;
  const gap = Math.min(8, slot * 0.25);
  const bars = points.map((p, i) => {
    const h = Math.max(0, (p.value / max) * height);
    return { x: i * slot + gap / 2, y: height - h, width: Math.max(1, slot - gap), height: h, value: p.value, label: p.label };
  });
  return { bars, max };
}

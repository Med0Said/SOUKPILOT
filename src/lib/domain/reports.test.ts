import { describe, expect, it } from "vitest";
import { barLayout, niceMax, percentChange, previousPeriod, resolvePeriod, sumDays, type DayFigures } from "./reports";

describe("periods", () => {
  const today = "2026-03-15";

  it("resolves presets from the organization's today", () => {
    expect(resolvePeriod({}, today)).toEqual({ preset: "7d", from: "2026-03-09", to: "2026-03-15" });
    expect(resolvePeriod({ period: "today" }, today)).toMatchObject({ from: today, to: today });
    expect(resolvePeriod({ period: "yesterday" }, today)).toMatchObject({ from: "2026-03-14", to: "2026-03-14" });
    expect(resolvePeriod({ period: "30d" }, today)).toMatchObject({ from: "2026-02-14", to: today });
    expect(resolvePeriod({ period: "month" }, today)).toMatchObject({ from: "2026-03-01", to: today });
    expect(resolvePeriod({ period: "last_month" }, today)).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
    expect(resolvePeriod({ period: "last_month" }, "2026-01-10")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("custom periods are validated, swapped and capped at a year", () => {
    expect(resolvePeriod({ period: "custom", from: "2026-03-20", to: "2026-03-01" }, today)).toMatchObject({ from: "2026-03-01", to: "2026-03-20" });
    expect(resolvePeriod({ period: "custom", from: "nope" }, today)).toMatchObject({ from: "2026-03-09", to: today });
    expect(resolvePeriod({ period: "custom", from: "2020-01-01", to: "2026-03-15" }, today)).toMatchObject({ from: "2025-03-14", to: today });
  });

  it("previous period has the same length, just before", () => {
    expect(previousPeriod({ from: "2026-03-09", to: "2026-03-15" })).toEqual({ from: "2026-03-02", to: "2026-03-08" });
    expect(previousPeriod({ from: "2026-03-01", to: "2026-03-01" })).toEqual({ from: "2026-02-28", to: "2026-02-28" });
  });
});

describe("totals", () => {
  const day = (over: Partial<DayFigures>): DayFigures => ({
    sales_count: 0,
    sales_total_millimes: 0,
    returns_millimes: 0,
    net_sales_millimes: 0,
    credit_given_millimes: 0,
    cost_millimes: 0,
    margin_millimes: 0,
    revenue_without_cost_millimes: 0,
    ...over,
  });

  it("sums days, average basket and margin rate on known costs", () => {
    const t = sumDays([
      day({ sales_count: 2, net_sales_millimes: 56_000, cost_millimes: 24_000, margin_millimes: 26_000, revenue_without_cost_millimes: 6_000 }),
      day({ sales_count: 1, net_sales_millimes: 25_001, cost_millimes: 12_000, margin_millimes: 13_001 }),
    ]);
    expect(t.net_sales_millimes).toBe(81_001);
    expect(t.average_basket_millimes).toBe(27_000); // 27 000.33 → 27 000
    expect(t.margin_rate_bps).toBe(5200); // 39 001 / 75 001 (revenue with known cost)
  });

  it("no sales → no average; no known cost → no margin rate", () => {
    const t = sumDays([day({ revenue_without_cost_millimes: 5_000, net_sales_millimes: 5_000, sales_count: 1 })]);
    expect(t.margin_rate_bps).toBeNull();
    expect(sumDays([]).average_basket_millimes).toBeNull();
  });

  it("percentChange", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(1, 3)).toBe(-66.7);
  });
});

describe("chart scale", () => {
  it("niceMax", () => {
    expect([0, 0.7, 1, 1.2, 3, 7, 23, 240, 1_000_001].map(niceMax)).toEqual([1, 1, 1, 2, 5, 10, 25, 250, 2_000_000]);
  });

  it("bars fit the box; negative days draw as empty bars", () => {
    const { bars, max } = barLayout(
      [
        { label: "a", value: 100 },
        { label: "b", value: 50 },
        { label: "c", value: -20 },
      ],
      300,
      100,
    );
    expect(max).toBe(100);
    expect(bars.map((b) => [b.height, b.y])).toEqual([
      [100, 0],
      [50, 50],
      [0, 100],
    ]);
    expect(bars.at(-1)!.x + bars.at(-1)!.width).toBeLessThanOrEqual(300);
  });
});

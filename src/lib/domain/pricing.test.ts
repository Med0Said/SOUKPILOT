import { describe, expect, it } from "vitest";
import {
  allocate,
  balanceDue,
  formatBps,
  parsePercentToBps,
  priceLine,
  priceSale,
  returnAmount,
} from "./pricing";

describe("priceLine", () => {
  it("computes gross, discount (half up) and total", () => {
    expect(priceLine({ quantity: 3, unitPriceMillimes: 25_500, discountBps: 0 })).toEqual({
      gross: 76_500,
      lineDiscount: 0,
      lineTotal: 76_500,
    });
    // 10 % of 12 345 = 1 234,5 → 1 235 (half up)
    expect(priceLine({ quantity: 1, unitPriceMillimes: 12_345, discountBps: 1000 }).lineDiscount).toBe(1235);
    // 12,5 % of 999 = 124,875 → 125
    expect(priceLine({ quantity: 1, unitPriceMillimes: 999, discountBps: 1250 }).lineDiscount).toBe(125);
    expect(priceLine({ quantity: 2, unitPriceMillimes: 5_000, discountBps: 10_000 }).lineTotal).toBe(0);
  });

  it("stays exact beyond 2^53 intermediate values", () => {
    // gross = 10^12, × 9 999 bps would overflow doubles if done naively.
    const line = priceLine({ quantity: 1_000, unitPriceMillimes: 1_000_000_000, discountBps: 9_999 });
    expect(line.lineDiscount).toBe(999_900_000_000);
    expect(line.lineTotal).toBe(100_000_000);
  });

  it("refuses invalid input", () => {
    expect(() => priceLine({ quantity: 1.5, unitPriceMillimes: 1, discountBps: 0 })).toThrow(RangeError);
    expect(() => priceLine({ quantity: 1, unitPriceMillimes: -1, discountBps: 0 })).toThrow(RangeError);
    expect(() => priceLine({ quantity: 1, unitPriceMillimes: 1, discountBps: 10_001 })).toThrow(RangeError);
  });
});

describe("allocate (largest remainder)", () => {
  it("always sums to the amount", () => {
    for (const [amount, weights] of [
      [1000, [1000, 1000, 1000]],
      [7, [3, 3, 3]],
      [1, [5000, 5000]],
      [12_345, [100, 2_000, 30_000, 1]],
    ] as const) {
      const shares = allocate(amount, [...weights]);
      expect(shares.reduce((s, x) => s + x, 0)).toBe(amount);
      shares.forEach((s, i) => expect(s).toBeLessThanOrEqual(weights[i]));
    }
  });

  it("gives leftovers to the largest remainders, ties to the first line", () => {
    expect(allocate(1000, [1000, 1000, 1000])).toEqual([334, 333, 333]);
    expect(allocate(10, [30, 30, 40])).toEqual([3, 3, 4]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
  });
});

describe("priceSale", () => {
  it("applies line and order discounts with net totals summing to the total", () => {
    const sale = priceSale(
      [
        { quantity: 2, unitPriceMillimes: 25_000, discountBps: 1000 },
        { quantity: 1, unitPriceMillimes: 18_500, discountBps: 0 },
        { quantity: 3, unitPriceMillimes: 1_999, discountBps: 333 },
      ],
      1_001,
    );
    expect(sale.subtotal).toBe(45_000 + 18_500 + 5_797);
    expect(sale.lineDiscount).toBe(5_000 + 0 + 200);
    expect(sale.total).toBe(sale.subtotal - 1_001);
    expect(sale.lines.reduce((s, l) => s + l.netTotal, 0)).toBe(sale.total);
    expect(sale.lines.reduce((s, l) => s + l.orderDiscountShare, 0)).toBe(1_001);
  });

  it("refuses an order discount above the subtotal", () => {
    expect(() => priceSale([{ quantity: 1, unitPriceMillimes: 100, discountBps: 0 }], 101)).toThrow(RangeError);
  });
});

describe("returnAmount", () => {
  it("refunds exactly the net total over successive partial returns", () => {
    const net = 10_000; // 3 units: 3 333,33… each
    const steps = [returnAmount(net, 3, 0, 1), returnAmount(net, 3, 1, 1), returnAmount(net, 3, 2, 1)];
    expect(steps).toEqual([3333, 3334, 3333]);
    expect(steps.reduce((s, x) => s + x, 0)).toBe(net);
    expect(returnAmount(net, 3, 0, 3)).toBe(net);
  });

  it("refuses returning more than sold", () => {
    expect(() => returnAmount(1000, 2, 1, 2)).toThrow(RangeError);
    expect(() => returnAmount(1000, 2, 0, 0)).toThrow(RangeError);
  });
});

describe("balanceDue", () => {
  it("is total − returned − paid (negative = owed to the customer)", () => {
    expect(balanceDue({ totalMillimes: 50_000, returnedMillimes: 0, paidMillimes: 20_000 })).toBe(30_000);
    expect(balanceDue({ totalMillimes: 50_000, returnedMillimes: 25_000, paidMillimes: 50_000 })).toBe(-25_000);
  });
});

describe("percent parsing", () => {
  it.each([
    ["10", 1000],
    ["12,5", 1250],
    ["12.55", 1255],
    ["0", 0],
    ["", 0],
    ["100 %", 10_000],
  ])("%j → %i bps", (input, bps) => expect(parsePercentToBps(input)).toBe(bps));

  it.each(["101", "-5", "1,234", "abc"])("rejects %j", (input) => expect(parsePercentToBps(input)).toBeNull());

  it("formats basis points", () => {
    expect(formatBps(1000)).toBe("10 %");
    expect(formatBps(1250)).toBe("12,5 %");
    expect(formatBps(1255)).toBe("12,55 %");
  });
});

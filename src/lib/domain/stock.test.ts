import { describe, expect, it } from "vitest";
import { countDifference, documentNumber, formatDelta } from "./stock";

describe("stock helpers", () => {
  it("formats document numbers", () => {
    expect(documentNumber("stock_receipt", 12)).toBe("REC-000012");
    expect(documentNumber("stock_count", 1234567)).toBe("INV-1234567");
  });

  it("formats signed deltas", () => {
    expect(formatDelta(5)).toBe("+5");
    expect(formatDelta(-3)).toBe("−3");
    expect(formatDelta(0)).toBe("0");
    expect(() => formatDelta(1.5)).toThrow(RangeError);
  });

  it("computes the count difference only for counted items", () => {
    expect(countDifference(10, 7)).toBe(-3);
    expect(countDifference(4, 4)).toBe(0);
    expect(countDifference(null, null)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { MAX_MILLIMES, formatTnd, formatTndInput, parseTnd } from "./money";

describe("parseTnd", () => {
  it.each([
    ["25", 25000],
    ["25,5", 25500],
    ["25.5", 25500],
    ["25,500", 25500],
    ["25.500 DT", 25500],
    ["12 TND", 12000],
    ["0,001", 1],
    [",750", 750],
    ["1 234,500", 1234500],
    ["1 234,500 DT", 1234500],
    ["1.234,500", 1234500],
    ["1,234.5", 1234500],
    ["1.234.500", 1234500000],
    ["1.234", 1234],
    ["0", 0],
    ["+3", 3000],
  ])("parses %j as %i millimes", (input, expected) => {
    expect(parseTnd(input)).toEqual({ ok: true, millimes: expected });
  });

  it.each(["", "  ", "-5", "abc", "12,3456", "1,2,3.4", "1.23.456", "12,", "1..5", "12 DT 5", "1e3", "١٢"])(
    "rejects %j",
    (input) => {
      expect(parseTnd(input).ok).toBe(false);
    },
  );

  it("rejects amounts above the database limit", () => {
    expect(parseTnd("1000000000").ok).toBe(true);
    expect(parseTnd("1000000000,001").ok).toBe(false);
    expect(parseTnd("99999999999999999999").ok).toBe(false);
  });

  it("never introduces floating point error", () => {
    // 0.1 + 0.2 style traps: every millime value round-trips exactly.
    for (let m = 0; m < 3000; m += 7) {
      const parsed = parseTnd(formatTndInput(m));
      expect(parsed).toEqual({ ok: true, millimes: m });
    }
  });
});

describe("formatTnd", () => {
  it.each([
    [0, "0,000 DT"],
    [1, "0,001 DT"],
    [25500, "25,500 DT"],
    [1234500, "1 234,500 DT"],
    [-1500, "-1,500 DT"],
    [MAX_MILLIMES, "1 000 000 000,000 DT"],
  ])("formats %i", (millimes, expected) => {
    expect(formatTnd(millimes)).toBe(expected);
  });

  it("refuses non-integer amounts", () => {
    expect(() => formatTnd(1.5)).toThrow(RangeError);
  });

  it("formatTndInput is empty for unknown amounts", () => {
    expect(formatTndInput(null)).toBe("");
    expect(formatTndInput(12000)).toBe("12,000");
  });
});

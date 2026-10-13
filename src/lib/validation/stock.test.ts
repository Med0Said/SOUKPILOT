import { describe, expect, it } from "vitest";
import { fieldErrorsFrom } from "./schemas";
import { adjustmentSchema, countRecordSchema, receiptSchema, toCostLines, toDeltaLines, transferSchema } from "./stock";

const ORG = "6f1c1e0e-8a0b-4d8e-9a43-5d0f6f4b2a11";
const LOC = "0b6f1d5e-6a8a-4a5c-9b39-3c1f4e2d7a10";
const LOC2 = "1c7a2e6f-7b9b-4b6d-8c4a-4d2a5f3e8b21";
const V1 = "2d8b3f7a-8cac-4c7e-9d5b-5e3b6a4f9c32";
const V2 = "3e9c4a8b-9dbd-4d8f-8e6c-6f4c7b5a0d43";
const KEY = "4fad5b9c-aece-4e9a-9f7d-7a5d8c6b1e54";

describe("receiptSchema", () => {
  it("parses quantities as integers and costs as millimes", () => {
    const parsed = receiptSchema.parse({
      organizationId: ORG,
      locationId: LOC,
      supplierId: "",
      reference: " BL 2026-114 ",
      updateCosts: true,
      idempotencyKey: KEY,
      lines: [
        { variantId: V1, quantity: "12", cost: "8,500" },
        { variantId: V2, quantity: "+3", cost: "" },
      ],
    });
    expect(parsed.reference).toBe("BL 2026-114");
    expect(parsed.supplierId).toBeNull();
    expect(toCostLines(parsed.lines)).toEqual([
      { variant_id: V1, quantity: 12, unit_cost_millimes: 8500 },
      { variant_id: V2, quantity: 3, unit_cost_millimes: null },
    ]);
  });

  it.each(["0", "-1", "1.5", "1,5", "abc", "10000000"])("rejects quantity %j", (q) => {
    const result = receiptSchema.safeParse({
      organizationId: ORG,
      locationId: LOC,
      updateCosts: false,
      idempotencyKey: KEY,
      lines: [{ variantId: V1, quantity: q }],
    });
    expect(result.success).toBe(false);
  });

  it("flags duplicate articles", () => {
    const result = receiptSchema.safeParse({
      organizationId: ORG,
      locationId: LOC,
      updateCosts: false,
      idempotencyKey: KEY,
      lines: [
        { variantId: V1, quantity: "1" },
        { variantId: V1, quantity: "2" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrorsFrom(result.error)["lines.1.variantId"]).toBe("Article en double.");
  });
});

describe("adjustmentSchema", () => {
  it("accepts signed non-zero deltas and requires a reason", () => {
    const ok = adjustmentSchema.parse({
      organizationId: ORG,
      locationId: LOC,
      reason: "Casse",
      idempotencyKey: KEY,
      lines: [
        { variantId: V1, quantity: "-2" },
        { variantId: V2, quantity: "5" },
      ],
    });
    expect(toDeltaLines(ok.lines)).toEqual([
      { variant_id: V1, quantity_delta: -2 },
      { variant_id: V2, quantity_delta: 5 },
    ]);
    expect(adjustmentSchema.safeParse({ ...ok, reason: " ", lines: [{ variantId: V1, quantity: "1" }] }).success).toBe(false);
    expect(
      adjustmentSchema.safeParse({ ...ok, reason: "Casse", lines: [{ variantId: V1, quantity: "0" }] }).success,
    ).toBe(false);
  });
});

describe("transferSchema", () => {
  it("requires two different locations", () => {
    const base = { organizationId: ORG, idempotencyKey: KEY, lines: [{ variantId: V1, quantity: "1" }] };
    expect(transferSchema.safeParse({ ...base, fromLocationId: LOC, toLocationId: LOC }).success).toBe(false);
    expect(transferSchema.safeParse({ ...base, fromLocationId: LOC, toLocationId: LOC2 }).success).toBe(true);
  });
});

describe("countRecordSchema", () => {
  it("accepts zero and rejects negative counts", () => {
    expect(countRecordSchema.parse({ countId: KEY, items: [{ variantId: V1, counted: "0" }] }).items[0].counted).toBe(0);
    expect(countRecordSchema.safeParse({ countId: KEY, items: [{ variantId: V1, counted: "-1" }] }).success).toBe(false);
  });
});

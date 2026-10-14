import { describe, expect, it } from "vitest";
import { fieldErrorsFrom } from "./schemas";
import { saleCartSchema, saleReturnSchema, toSaleRpcLines, toSaleRpcPayments } from "./sales";

const ORG = "6f1c1e0e-8a0b-4d8e-9a43-5d0f6f4b2a11";
const LOC = "0b6f1d5e-6a8a-4a5c-9b39-3c1f4e2d7a10";
const V1 = "2d8b3f7a-8cac-4c7e-9d5b-5e3b6a4f9c32";
const V2 = "3e9c4a8b-9dbd-4d8f-8e6c-6f4c7b5a0d43";
const M1 = "4fad5b9c-aece-4e9a-9f7d-7a5d8c6b1e54";
const KEY = "5abe6cad-bfdf-4fab-8a8e-8b6e9d7c2f65";

describe("saleCartSchema", () => {
  it("converts quantities, percent discounts and money to integers; drops zero payments", () => {
    const cart = saleCartSchema.parse({
      organizationId: ORG,
      locationId: LOC,
      customerId: "",
      lines: [
        { variantId: V1, quantity: "2", discount: "12,5" },
        { variantId: V2, quantity: "1", discount: "" },
      ],
      orderDiscount: "1,500",
      payments: [
        { methodId: M1, amount: "40" },
        { methodId: M1, amount: "0" },
      ],
      idempotencyKey: KEY,
    });
    expect(cart.customerId).toBeNull();
    expect(cart.orderDiscount).toBe(1500);
    expect(toSaleRpcLines(cart)).toEqual([
      { variant_id: V1, quantity: 2, discount_bps: 1250 },
      { variant_id: V2, quantity: 1, discount_bps: 0 },
    ]);
    expect(toSaleRpcPayments(cart)).toEqual([{ method_id: M1, amount_millimes: 40_000 }]);
  });

  it("never accepts a price from the browser", () => {
    const cart = saleCartSchema.parse({
      organizationId: ORG,
      locationId: LOC,
      lines: [{ variantId: V1, quantity: "1", unitPrice: "0,001" }],
      payments: [],
      idempotencyKey: KEY,
    });
    expect(toSaleRpcLines(cart)[0]).not.toHaveProperty("unit_price_millimes");
  });

  it("reports line errors and duplicates", () => {
    const result = saleCartSchema.safeParse({
      organizationId: ORG,
      locationId: LOC,
      lines: [
        { variantId: V1, quantity: "0" },
        { variantId: V1, quantity: "1", discount: "150" },
      ],
      payments: [],
      idempotencyKey: KEY,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrorsFrom(result.error);
      expect(errors["lines.0.quantity"]).toBeDefined();
      expect(errors["lines.1.discount"]).toBeDefined();
    }
  });
});

describe("saleReturnSchema", () => {
  it("keeps only lines with a quantity and requires a refund method when refunding", () => {
    const base = {
      saleId: KEY,
      reason: "Défaut",
      lines: [
        { saleItemId: V1, quantity: "1", restock: true },
        { saleItemId: V2, quantity: "0", restock: false },
      ],
      idempotencyKey: KEY,
    };
    expect(saleReturnSchema.parse(base).lines).toHaveLength(1);
    expect(saleReturnSchema.safeParse({ ...base, refundAmount: "5" }).success).toBe(false);
    expect(saleReturnSchema.safeParse({ ...base, lines: [{ saleItemId: V1, quantity: "0", restock: true }] }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { purchaseOrderSchema, receivePurchaseOrderSchema, supplierPaymentSchema } from "./purchasing";

const ORG = "6f1c1e0e-8a0b-4d8e-9a43-5d0f6f4b2a11";
const SUP = "0b6f1d5e-6a8a-4a5c-9b39-3c1f4e2d7a10";
const LOC = "1c7a2e6f-7b9b-4b6d-8c4a-4d2a5f3e8b21";
const V1 = "2d8b3f7a-8cac-4c7e-9d5b-5e3b6a4f9c32";
const KEY = "4fad5b9c-aece-4e9a-9f7d-7a5d8c6b1e54";

describe("purchaseOrderSchema", () => {
  it("requires a cost on every line and converts it to millimes", () => {
    const po = purchaseOrderSchema.parse({
      organizationId: ORG,
      supplierId: SUP,
      locationId: LOC,
      expectedDate: "",
      lines: [{ variantId: V1, quantity: "12", cost: "8,250" }],
    });
    expect(po.expectedDate).toBeNull();
    expect(po.lines[0]).toEqual({ variantId: V1, quantity: 12, cost: 8250 });
    expect(
      purchaseOrderSchema.safeParse({ organizationId: ORG, supplierId: SUP, locationId: LOC, lines: [{ variantId: V1, quantity: "1", cost: "" }] })
        .success,
    ).toBe(false);
  });
});

describe("receivePurchaseOrderSchema", () => {
  it("keeps lines with a quantity, allows a cost override", () => {
    const r = receivePurchaseOrderSchema.parse({
      purchaseOrderId: KEY,
      updateCosts: false,
      idempotencyKey: KEY,
      lines: [
        { itemId: V1, quantity: "3", cost: "9" },
        { itemId: SUP, quantity: "0" },
      ],
    });
    expect(r.lines).toEqual([{ itemId: V1, quantity: 3, cost: 9000 }]);
    expect(
      receivePurchaseOrderSchema.safeParse({ purchaseOrderId: KEY, updateCosts: false, idempotencyKey: KEY, lines: [{ itemId: V1, quantity: "0" }] })
        .success,
    ).toBe(false);
  });
});

describe("supplierPaymentSchema", () => {
  it("validates kind, amount and date", () => {
    const base = { organizationId: ORG, supplierId: SUP, methodId: V1, kind: "payment", amount: "150", paidOn: "2026-10-14", idempotencyKey: KEY };
    expect(supplierPaymentSchema.parse(base).amount).toBe(150_000);
    expect(supplierPaymentSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(supplierPaymentSchema.safeParse({ ...base, paidOn: "14/10/2026" }).success).toBe(false);
    expect(supplierPaymentSchema.safeParse({ ...base, kind: "gift" }).success).toBe(false);
  });
});

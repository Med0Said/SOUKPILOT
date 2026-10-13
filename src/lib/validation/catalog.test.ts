import { describe, expect, it } from "vitest";
import { fieldErrorsFrom } from "./schemas";
import { productFormSchema, supplierSchema, toProductPayload } from "./catalog";

const ORG = "6f1c1e0e-8a0b-4d8e-9a43-5d0f6f4b2a11";

const base = {
  organizationId: ORG,
  name: "  T-shirt   col V ",
  description: "",
  categoryId: "",
  supplierId: "",
  trackStock: true,
  optionNames: ["Taille"],
  variants: [
    { sku: "TS-S", barcode: "", optionValues: ["S"], price: "25,500", cost: "", threshold: "" },
    { sku: "", barcode: "6190 0000 1", optionValues: ["M"], price: "25.5", cost: "12", threshold: "3" },
  ],
};

describe("productFormSchema", () => {
  it("normalizes text, converts money to millimes and builds the RPC payload", () => {
    const parsed = productFormSchema.parse(base);
    expect(toProductPayload(parsed)).toEqual({
      name: "T-shirt col V",
      description: null,
      category_id: null,
      supplier_id: null,
      option_names: ["Taille"],
      track_stock: true,
      variants: [
        { sku: "TS-S", barcode: null, option_values: ["S"], price_millimes: 25500, cost_millimes: null, low_stock_threshold: null },
        { sku: null, barcode: "619000001", option_values: ["M"], price_millimes: 25500, cost_millimes: 12000, low_stock_threshold: 3 },
      ],
    });
  });

  it("reports errors per variant field", () => {
    const result = productFormSchema.safeParse({
      ...base,
      variants: [
        { ...base.variants[0], price: "abc" },
        { ...base.variants[1], optionValues: ["s"], threshold: "-1" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrorsFrom(result.error);
      expect(errors["variants.0.price"]).toBe("Montant invalide.");
      expect(errors["variants.1.threshold"]).toBe("Nombre entier positif attendu.");
    }
  });

  it("rejects duplicate combinations (case-insensitive), SKUs and option counts that do not match", () => {
    const dup = productFormSchema.safeParse({
      ...base,
      variants: [base.variants[0], { ...base.variants[1], optionValues: ["s"] }],
    });
    expect(dup.success).toBe(false);
    if (!dup.success) expect(fieldErrorsFrom(dup.error)["variants.1.optionValues"]).toMatch(/Même combinaison/);

    const sku = productFormSchema.safeParse({
      ...base,
      variants: [base.variants[0], { ...base.variants[1], sku: "ts-s" }],
    });
    expect(sku.success).toBe(false);

    const mismatch = productFormSchema.safeParse({ ...base, optionNames: ["Taille", "Couleur"] });
    expect(mismatch.success).toBe(false);
  });

  it("requires at least one variant and at most 3 options", () => {
    expect(productFormSchema.safeParse({ ...base, variants: [] }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...base, optionNames: ["a", "b", "c", "d"] }).success).toBe(false);
  });
});

describe("supplierSchema", () => {
  it("treats an absent checkbox as inactive and validates contact fields", () => {
    const parsed = supplierSchema.parse({ organizationId: ORG, name: "Grossiste", phone: "", email: " A@B.TN " });
    expect(parsed).toMatchObject({ isActive: false, phone: null, email: "a@b.tn" });
    expect(supplierSchema.safeParse({ organizationId: ORG, name: "X", phone: "appelez" }).success).toBe(false);
  });
});

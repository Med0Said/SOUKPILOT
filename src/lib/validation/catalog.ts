import { z } from "zod";
import { parseTnd } from "@/lib/domain/money";
import { BARCODE_PATTERN, LIMITS, cleanOptional, cleanText, optionsKey, type ProductPayload } from "@/lib/domain/catalog";

/**
 * Validation of catalog forms. Prices arrive as text typed by the user
 * ("25,500") and are converted to integer millimes here, on the server.
 */

const requiredText = (max: number, label = "Champ") =>
  z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(1, `${label} obligatoire.`).max(max, `${max} caractères maximum.`));

const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => cleanOptional(v))
    .refine((v) => v === null || v.length <= max, `${max} caractères maximum.`);

// `.optional()` before the transform keeps the object key optional (Zod 4).
const optionalUuid = z
  .union([z.uuid(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const requiredMoney = z.string().transform((value, ctx) => {
  const result = parseTnd(value);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: result.error });
    return z.NEVER;
  }
  return result.millimes;
});

export const optionalMoney = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value || value.trim() === "") return null;
    const result = parseTnd(value);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }
    return result.millimes;
  });

const optionalThreshold = z
  .string()
  .optional()
  .transform((value, ctx) => {
    const v = (value ?? "").trim();
    if (v === "") return null;
    if (!/^\d+$/.test(v) || Number(v) > LIMITS.maxThreshold) {
      ctx.addIssue({ code: "custom", message: "Nombre entier positif attendu." });
      return z.NEVER;
    }
    return Number(v);
  });

const optionalSku = optionalText(LIMITS.sku);
const optionalBarcode = z
  .string()
  .optional()
  .transform((v) => cleanOptional(v)?.replace(/\s/g, "") ?? null)
  .refine((v) => v === null || BARCODE_PATTERN.test(v), "Code-barres invalide (chiffres, lettres, « . » ou « - »).");

export const variantFormSchema = z.object({
  sku: optionalSku,
  barcode: optionalBarcode,
  optionValues: z.array(requiredText(LIMITS.optionValue, "Valeur")).max(LIMITS.maxOptions),
  price: requiredMoney,
  cost: optionalMoney,
  threshold: optionalThreshold,
  isActive: z.boolean().default(true),
});

export type VariantFormInput = z.input<typeof variantFormSchema>;

export const productFormSchema = z
  .object({
    organizationId: z.uuid(),
    name: requiredText(LIMITS.productName, "Nom"),
    description: optionalText(LIMITS.description),
    categoryId: optionalUuid,
    supplierId: optionalUuid,
    trackStock: z.boolean(),
    optionNames: z.array(requiredText(LIMITS.optionName, "Nom d'option")).max(LIMITS.maxOptions, "3 options maximum."),
    variants: z
      .array(variantFormSchema)
      .min(1, "Ajoutez au moins une variante.")
      .max(LIMITS.maxVariantsPerProduct, `${LIMITS.maxVariantsPerProduct} variantes maximum.`),
  })
  .superRefine((value, ctx) => {
    const lowerNames = value.optionNames.map((n) => n.toLowerCase());
    if (new Set(lowerNames).size !== lowerNames.length) {
      ctx.addIssue({ code: "custom", path: ["optionNames"], message: "Deux options portent le même nom." });
    }
    const seen = new Map<string, number>();
    value.variants.forEach((variant, index) => {
      if (variant.optionValues.length !== value.optionNames.length) {
        ctx.addIssue({
          code: "custom",
          path: ["variants", index, "optionValues"],
          message: "Renseignez une valeur pour chaque option.",
        });
      }
      const key = optionsKey(variant.optionValues);
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["variants", index, "optionValues"],
          message: `Même combinaison que la variante ${(seen.get(key) as number) + 1}.`,
        });
      } else {
        seen.set(key, index);
      }
    });
    const skus = value.variants.map((v) => v.sku?.toUpperCase()).filter(Boolean);
    if (new Set(skus).size !== skus.length) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Deux variantes ont le même SKU." });
    }
    const barcodes = value.variants.map((v) => v.barcode).filter(Boolean);
    if (new Set(barcodes).size !== barcodes.length) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Deux variantes ont le même code-barres." });
    }
  });

export type ProductFormInput = z.input<typeof productFormSchema>;
export type ProductFormOutput = z.output<typeof productFormSchema>;

/** Converts validated form output to the create_product payload. */
export function toProductPayload(form: ProductFormOutput): ProductPayload & {
  category_id: string | null;
  supplier_id: string | null;
} {
  return {
    name: form.name,
    description: form.description,
    category_id: form.categoryId,
    supplier_id: form.supplierId,
    option_names: form.optionNames,
    track_stock: form.trackStock,
    variants: form.variants.map((v) => ({
      sku: v.sku,
      barcode: v.barcode,
      option_values: v.optionValues,
      price_millimes: v.price,
      cost_millimes: v.cost,
      low_stock_threshold: v.threshold,
    })),
  };
}

export const productUpdateSchema = z.object({
  organizationId: z.uuid(),
  productId: z.uuid(),
  name: requiredText(LIMITS.productName, "Nom"),
  description: optionalText(LIMITS.description),
  categoryId: optionalUuid,
  supplierId: optionalUuid,
  trackStock: z.enum(["on", "off"]).optional().transform((v) => v === "on"),
  isActive: z.enum(["on", "off"]).optional().transform((v) => v === "on"),
});

export const variantSaveSchema = z.object({
  organizationId: z.uuid(),
  productId: z.uuid(),
  variantId: optionalUuid,
  variant: variantFormSchema,
});

export const categorySchema = z.object({
  organizationId: z.uuid(),
  categoryId: optionalUuid,
  name: requiredText(LIMITS.categoryName, "Nom"),
});

export const supplierSchema = z.object({
  organizationId: z.uuid(),
  supplierId: optionalUuid,
  name: requiredText(LIMITS.supplierName, "Nom"),
  phone: z
    .string()
    .optional()
    .transform((v) => cleanOptional(v))
    .refine((v) => v === null || /^\+?[0-9 ().-]{4,31}$/.test(v), "Numéro de téléphone invalide."),
  email: z
    .string()
    .optional()
    .transform((v) => cleanOptional(v)?.toLowerCase() ?? null)
    .refine((v) => v === null || z.email().safeParse(v).success, "Adresse e-mail invalide."),
  notes: optionalText(2000),
  isActive: z.enum(["on", "off"]).optional().transform((v) => v === "on"),
});

export const locationSchema = z.object({
  organizationId: z.uuid(),
  locationId: optionalUuid,
  name: requiredText(80, "Nom"),
  code: z
    .string()
    .optional()
    .transform((v) => cleanOptional(v)?.toUpperCase() ?? null)
    .refine((v) => v === null || /^[A-Z0-9_-]{1,12}$/.test(v), "Code : 12 caractères max (lettres, chiffres, - ou _)."),
  isActive: z.enum(["on", "off"]).optional().transform((v) => v === "on"),
});

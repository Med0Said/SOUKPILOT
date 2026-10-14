import { z } from "zod";
import { cleanOptional } from "@/lib/domain/catalog";
import { parsePercentToBps } from "@/lib/domain/pricing";
import { optionalMoney, requiredMoney } from "./catalog";

/**
 * Validation of sales forms. Only quantities, discounts and payments come
 * from the browser; unit prices and totals are always computed in SQL.
 */
const optionalUuid = z
  .union([z.uuid(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const intString = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,7}$/, message)
    .transform(Number)
    .refine((n) => n >= min && n <= max, message);

const percent = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const bps = parsePercentToBps(v ?? "");
    if (bps === null) {
      ctx.addIssue({ code: "custom", message: "Remise : pourcentage entre 0 et 100." });
      return z.NEVER;
    }
    return bps;
  });

export const saleCartSchema = z
  .object({
    organizationId: z.uuid(),
    saleId: optionalUuid,
    locationId: z.uuid({ error: "Choisissez un emplacement." }),
    customerId: optionalUuid,
    note: z
      .string()
      .optional()
      .transform((v) => cleanOptional(v))
      .refine((v) => v === null || v.length <= 500, "500 caractères maximum."),
    lines: z
      .array(
        z.object({
          variantId: z.uuid(),
          quantity: intString(1, 1_000_000, "Quantité : nombre entier supérieur à 0."),
          discount: percent,
        }),
      )
      .min(1, "Ajoutez au moins un article.")
      .max(200, "200 lignes maximum."),
    orderDiscount: optionalMoney.transform((v) => v ?? 0),
    payments: z
      .array(z.object({ methodId: z.uuid(), amount: requiredMoney }))
      .max(10)
      .transform((list) => list.filter((p) => p.amount > 0)),
    idempotencyKey: z.uuid(),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.lines.forEach((l, i) => {
      if (seen.has(l.variantId)) ctx.addIssue({ code: "custom", path: ["lines", i, "variantId"], message: "Article en double." });
      seen.add(l.variantId);
    });
  });

export type SaleCartOutput = z.output<typeof saleCartSchema>;

export function toSaleRpcLines(cart: SaleCartOutput) {
  return cart.lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity, discount_bps: l.discount }));
}

export function toSaleRpcPayments(cart: SaleCartOutput) {
  return cart.payments.map((p) => ({ method_id: p.methodId, amount_millimes: p.amount }));
}

export const salePaymentSchema = z.object({
  saleId: z.uuid(),
  methodId: z.uuid({ error: "Choisissez un mode de paiement." }),
  amount: requiredMoney.refine((n) => n > 0, "Montant supérieur à 0 attendu."),
  idempotencyKey: z.uuid(),
});

export const saleReturnSchema = z
  .object({
    saleId: z.uuid(),
    reason: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().min(3, "Indiquez un motif (3 caractères minimum).").max(500)),
    lines: z.array(
      z.object({
        saleItemId: z.uuid(),
        quantity: intString(0, 1_000_000, "Quantité : nombre entier positif."),
        restock: z.boolean(),
      }),
    ),
    refundMethodId: optionalUuid,
    refundAmount: optionalMoney,
    idempotencyKey: z.uuid(),
  })
  .transform((v) => ({ ...v, lines: v.lines.filter((l) => l.quantity > 0) }))
  .superRefine((v, ctx) => {
    if (v.lines.length === 0) ctx.addIssue({ code: "custom", path: ["lines"], message: "Indiquez au moins une quantité à retourner." });
    if ((v.refundAmount ?? 0) > 0 && !v.refundMethodId) {
      ctx.addIssue({ code: "custom", path: ["refundMethodId"], message: "Choisissez le mode de remboursement." });
    }
  });

export const customerSchema = z.object({
  organizationId: z.uuid(),
  customerId: optionalUuid,
  name: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Nom obligatoire.").max(120, "120 caractères maximum.")),
  phone: z
    .string()
    .optional()
    .transform((v) => cleanOptional(v))
    .refine((v) => v === null || /^\+?[0-9 ().-]{4,31}$/.test(v), "Numéro de téléphone invalide."),
  address: z
    .string()
    .optional()
    .transform((v) => cleanOptional(v))
    .refine((v) => v === null || v.length <= 300, "300 caractères maximum."),
  notes: z
    .string()
    .optional()
    .transform((v) => cleanOptional(v))
    .refine((v) => v === null || v.length <= 1000, "1000 caractères maximum."),
  isActive: z.enum(["on", "off"]).optional().transform((v) => v === "on"),
});

export const paymentMethodSchema = z.object({
  organizationId: z.uuid(),
  methodId: optionalUuid,
  label: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Nom obligatoire.").max(40, "40 caractères maximum.")),
  kind: z.enum(["cash", "card", "transfer", "check", "mobile", "other"], { error: "Type invalide." }),
  sortOrder: intString(0, 1000, "Ordre : nombre entre 0 et 1000.").optional().transform((v) => v ?? 0),
  isActive: z.enum(["on", "off"]).optional().transform((v) => v === "on"),
});

export const discountSettingSchema = z.object({
  organizationId: z.uuid(),
  maxDiscount: z.string().transform((v, ctx) => {
    const bps = parsePercentToBps(v);
    if (bps === null) {
      ctx.addIssue({ code: "custom", message: "Pourcentage entre 0 et 100." });
      return z.NEVER;
    }
    return bps;
  }),
});

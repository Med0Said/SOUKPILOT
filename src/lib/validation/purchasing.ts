import { z } from "zod";
import { cleanOptional } from "@/lib/domain/catalog";
import { optionalMoney, requiredMoney } from "./catalog";

/** Validation of purchasing forms (owner/manager). SQL re-validates everything. */

const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => cleanOptional(v))
    .refine((v) => v === null || v.length <= max, `${max} caractères maximum.`);

const optionalUuid = z
  .union([z.uuid(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.");

const quantity = (min: number) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,7}$/, "Quantité : nombre entier.")
    .transform(Number)
    .refine((n) => n >= min && n <= 1_000_000, min > 0 ? "Quantité supérieure à 0 attendue." : "Quantité invalide.");

export const purchaseOrderSchema = z
  .object({
    organizationId: z.uuid(),
    purchaseOrderId: optionalUuid,
    supplierId: z.uuid({ error: "Choisissez un fournisseur." }),
    locationId: z.uuid({ error: "Choisissez un emplacement de livraison." }),
    expectedDate: z
      .union([isoDate, z.literal("")])
      .optional()
      .transform((v) => (v ? v : null)),
    reference: optionalText(80),
    note: optionalText(1000),
    lines: z
      .array(z.object({ variantId: z.uuid(), quantity: quantity(1), cost: requiredMoney }))
      .min(1, "Ajoutez au moins un article.")
      .max(500, "500 lignes maximum."),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.lines.forEach((l, i) => {
      if (seen.has(l.variantId)) ctx.addIssue({ code: "custom", path: ["lines", i, "variantId"], message: "Article en double." });
      seen.add(l.variantId);
    });
  });

export const receivePurchaseOrderSchema = z
  .object({
    purchaseOrderId: z.uuid(),
    reference: optionalText(80),
    note: optionalText(1000),
    updateCosts: z.boolean(),
    idempotencyKey: z.uuid(),
    lines: z.array(z.object({ itemId: z.uuid(), quantity: quantity(0), cost: optionalMoney })),
  })
  .transform((v) => ({ ...v, lines: v.lines.filter((l) => l.quantity > 0) }))
  .refine((v) => v.lines.length > 0, { path: ["lines"], message: "Indiquez au moins une quantité reçue." });

export const supplierPaymentSchema = z.object({
  organizationId: z.uuid(),
  supplierId: z.uuid(),
  methodId: z.uuid({ error: "Choisissez un mode de paiement." }),
  kind: z.enum(["payment", "refund"]),
  amount: requiredMoney.refine((n) => n > 0, "Montant supérieur à 0 attendu."),
  paidOn: isoDate,
  reference: optionalText(80),
  note: optionalText(500),
  idempotencyKey: z.uuid(),
});

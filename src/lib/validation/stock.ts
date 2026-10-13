import { z } from "zod";
import { cleanOptional } from "@/lib/domain/catalog";
import { optionalMoney } from "./catalog";

/**
 * Validation of stock documents submitted from the UI. Quantities are whole
 * units (integer). The SQL functions re-validate everything.
 */
export const MAX_LINES = 500;
export const MAX_QUANTITY = 1_000_000;

function quantity(signed: boolean) {
  return z.string().transform((raw, ctx) => {
    const v = raw.trim().replace(/^\+/, "");
    if (!/^-?\d{1,7}$/.test(v)) {
      ctx.addIssue({ code: "custom", message: "Quantité : nombre entier attendu." });
      return z.NEVER;
    }
    const n = Number(v);
    if (signed ? n === 0 : n <= 0) {
      ctx.addIssue({ code: "custom", message: signed ? "Quantité non nulle attendue." : "Quantité supérieure à 0 attendue." });
      return z.NEVER;
    }
    if (Math.abs(n) > MAX_QUANTITY) {
      ctx.addIssue({ code: "custom", message: "Quantité trop élevée." });
      return z.NEVER;
    }
    return n;
  });
}

const lineSchema = (signed: boolean, withCost: boolean) =>
  z.object({
    variantId: z.uuid(),
    quantity: quantity(signed),
    cost: withCost ? optionalMoney : z.undefined().optional(),
  });

function linesSchema(signed: boolean, withCost: boolean) {
  return z
    .array(lineSchema(signed, withCost))
    .min(1, "Ajoutez au moins un article.")
    .max(MAX_LINES, `${MAX_LINES} lignes maximum.`)
    .superRefine((lines, ctx) => {
      const seen = new Set<string>();
      lines.forEach((line, index) => {
        if (seen.has(line.variantId)) {
          ctx.addIssue({ code: "custom", path: [index, "variantId"], message: "Article en double." });
        }
        seen.add(line.variantId);
      });
    });
}

const optionalUuid = z
  .union([z.uuid(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => cleanOptional(v))
    .refine((v) => v === null || v.length <= max, `${max} caractères maximum.`);

export const receiptSchema = z.object({
  organizationId: z.uuid(),
  locationId: z.uuid({ error: "Choisissez un emplacement." }),
  supplierId: optionalUuid,
  reference: optionalText(80),
  note: optionalText(1000),
  updateCosts: z.boolean(),
  idempotencyKey: z.uuid(),
  lines: linesSchema(false, true),
});

export const openingSchema = z.object({
  organizationId: z.uuid(),
  locationId: z.uuid({ error: "Choisissez un emplacement." }),
  idempotencyKey: z.uuid(),
  lines: linesSchema(false, true),
});

export const adjustmentSchema = z.object({
  organizationId: z.uuid(),
  locationId: z.uuid({ error: "Choisissez un emplacement." }),
  reason: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(3, "Indiquez un motif (3 caractères minimum).").max(500, "500 caractères maximum.")),
  idempotencyKey: z.uuid(),
  lines: linesSchema(true, false),
});

export const transferSchema = z
  .object({
    organizationId: z.uuid(),
    fromLocationId: z.uuid({ error: "Choisissez l'emplacement de départ." }),
    toLocationId: z.uuid({ error: "Choisissez l'emplacement d'arrivée." }),
    note: optionalText(500),
    idempotencyKey: z.uuid(),
    lines: linesSchema(false, false),
  })
  .refine((v) => v.fromLocationId !== v.toLocationId, {
    path: ["toLocationId"],
    message: "Choisissez deux emplacements différents.",
  });

export const countCreateSchema = z.object({
  organizationId: z.uuid(),
  locationId: z.uuid({ error: "Choisissez un emplacement." }),
  note: optionalText(500),
  idempotencyKey: z.uuid(),
});

export const countRecordSchema = z.object({
  countId: z.uuid(),
  items: z
    .array(
      z.object({
        variantId: z.uuid(),
        counted: z
          .string()
          .trim()
          .regex(/^\d{1,7}$/, "Nombre entier positif attendu.")
          .transform(Number)
          .refine((n) => n <= MAX_QUANTITY, "Quantité trop élevée."),
      }),
    )
    .min(1, "Saisissez au moins une quantité.")
    .max(MAX_LINES),
});

type Line = { variantId: string; quantity: number; cost?: number | null };

/** RPC line shape for receipts / opening stock. */
export function toCostLines(lines: Line[]) {
  return lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity, unit_cost_millimes: l.cost ?? null }));
}

export function toQuantityLines(lines: Line[]) {
  return lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity }));
}

export function toDeltaLines(lines: Line[]) {
  return lines.map((l) => ({ variant_id: l.variantId, quantity_delta: l.quantity }));
}

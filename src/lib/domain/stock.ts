import type { StockMovementType } from "@/lib/supabase/database.types";

/** Prefixes of human-readable document numbers ("REC-000012"). */
export const DOCUMENT_PREFIX = {
  stock_receipt: "REC",
  stock_adjustment: "AJU",
  stock_count: "INV",
  stock_transfer: "TRF",
} as const;

export type StockDocumentType = keyof typeof DOCUMENT_PREFIX;

export function documentNumber(type: StockDocumentType, number: number): string {
  return `${DOCUMENT_PREFIX[type]}-${String(number).padStart(6, "0")}`;
}

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  opening: "Stock initial",
  purchase_receipt: "Réception",
  sale: "Vente",
  customer_return: "Retour client",
  supplier_return: "Retour fournisseur",
  adjustment: "Ajustement",
  transfer_out: "Transfert (sortie)",
  transfer_in: "Transfert (entrée)",
};

/** Signed quantity for display: "+5", "−3" (true minus sign). */
export function formatDelta(delta: number): string {
  if (!Number.isInteger(delta)) throw new RangeError("Quantities are integers");
  return delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : "0";
}

/** Difference a count will apply: counted − expected (null when not counted). */
export function countDifference(expected: number | null, counted: number | null): number | null {
  if (expected === null || counted === null) return null;
  return counted - expected;
}

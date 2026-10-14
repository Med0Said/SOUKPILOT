import type { PurchaseOrderStatus } from "@/lib/supabase/database.types";

/** "BC-000012" (bon de commande); drafts have no number yet. */
export function poNumber(n: number | null, draftLabel = "Brouillon"): string {
  return n === null ? draftLabel : `BC-${String(n).padStart(6, "0")}`;
}

export function poStatusTone(s: PurchaseOrderStatus): "neutral" | "success" | "warning" {
  return s === "received" ? "success" : s === "ordered" || s === "partially_received" ? "warning" : "neutral";
}

export const OPEN_PO_STATUSES: PurchaseOrderStatus[] = ["draft", "ordered", "partially_received"];

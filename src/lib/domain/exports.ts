/**
 * CSV exports of list pages: pure row builders (header first). Amounts are
 * written as decimal dinars with a comma ("1234,500"), dates as sortable
 * "YYYY-MM-DD HH:mm" in the organization's time zone. Text cells go through the formula guard of
 * toCsv; amounts and quantities are numeric cells.
 */
import { csvNumber, type CsvCell } from "./csv";
import { formatTndInput } from "./money";
import { variantLabel } from "./catalog";
import { MOVEMENT_LABELS } from "./stock";
import { poNumber } from "./purchasing";
import { formatIsoDate, formatIsoDateTime } from "@/lib/format";
import type { PurchaseOrderStatus, StockMovementType } from "@/lib/supabase/database.types";

/** Maximum rows in one export (larger lists: narrow the filters). */
export const EXPORT_MAX_ROWS = 10_000;

const money = (millimes: number | null | undefined): CsvCell => (millimes === null || millimes === undefined ? "" : csvNumber(formatTndInput(millimes)));
const yesNo = (value: boolean) => (value ? "oui" : "non");

export type CsvTable = CsvCell[][];

// ---------------------------------------------------------------------------
// Catalog: same columns as the import template (+ option 3 and "actif"), so an
// export can be edited and imported into another organization.
// ---------------------------------------------------------------------------
export type ExportProduct = {
  name: string;
  category: string | null;
  supplier: string | null;
  description: string | null;
  optionNames: string[];
  trackStock: boolean;
  isActive: boolean;
  variants: {
    optionValues: string[];
    sku: string | null;
    barcode: string | null;
    priceMillimes: number;
    costMillimes: number | null;
    lowStockThreshold: number | null;
    isActive: boolean;
  }[];
};

export function catalogExportRows(products: readonly ExportProduct[], options: { withCosts: boolean }): CsvTable {
  const header = [
    "nom",
    "categorie",
    "fournisseur",
    "description",
    "option1_nom",
    "option1_valeur",
    "option2_nom",
    "option2_valeur",
    "option3_nom",
    "option3_valeur",
    "sku",
    "code_barres",
    "prix_vente",
    ...(options.withCosts ? ["prix_achat"] : []),
    "suivi_stock",
    "seuil_alerte",
    "actif",
  ];
  const rows: CsvTable = [header];
  for (const p of products) {
    for (const v of p.variants) {
      const opts = [0, 1, 2].flatMap((i) => [p.optionNames[i] ?? "", v.optionValues[i] ?? ""]);
      rows.push([
        p.name,
        p.category ?? "",
        p.supplier ?? "",
        p.description ?? "",
        ...opts,
        v.sku ?? "",
        v.barcode ?? "",
        money(v.priceMillimes),
        ...(options.withCosts ? [money(v.costMillimes)] : []),
        yesNo(p.trackStock),
        v.lowStockThreshold === null ? "" : v.lowStockThreshold,
        yesNo(p.isActive && v.isActive),
      ]);
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Stock on hand
// ---------------------------------------------------------------------------
export type ExportStockRow = {
  product_name: string;
  option_values: string[];
  sku: string | null;
  barcode: string | null;
  quantity: number;
  low_stock_threshold: number | null;
  is_low: boolean;
};

export function stockExportRows(rows: readonly ExportStockRow[], locationName: string): CsvTable {
  return [
    ["Article", "Variante", "SKU", "Code-barres", "Emplacement", "Quantité", "Seuil d'alerte", "Stock bas"],
    ...rows.map((r) => [
      r.product_name,
      variantLabel(r.option_values),
      r.sku ?? "",
      r.barcode ?? "",
      locationName,
      r.quantity,
      r.low_stock_threshold ?? "",
      yesNo(r.is_low),
    ]),
  ];
}

// ---------------------------------------------------------------------------
// Stock movements
// ---------------------------------------------------------------------------
export type ExportMovementRow = {
  created_at: string;
  article: string;
  sku: string | null;
  movement_type: StockMovementType;
  location: string;
  quantity_delta: number;
  quantity_after: number;
  reason: string | null;
};

export function movementExportRows(rows: readonly ExportMovementRow[], timeZone: string): CsvTable {
  return [
    ["Date", "Article", "SKU", "Mouvement", "Emplacement", "Quantité", "Stock après", "Motif"],
    ...rows.map((m) => [
      formatIsoDateTime(m.created_at, timeZone),
      m.article,
      m.sku ?? "",
      MOVEMENT_LABELS[m.movement_type],
      m.location,
      m.quantity_delta,
      m.quantity_after,
      m.reason ?? "",
    ]),
  ];
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------
export type ExportSaleRow = {
  number: number | null;
  status: "draft" | "finalized";
  customer_name: string | null;
  total_millimes: number;
  returned_millimes: number;
  paid_millimes: number;
  due_millimes: number;
  created_at: string;
  finalized_at: string | null;
};

export function salesExportRows(rows: readonly ExportSaleRow[], timeZone: string): CsvTable {
  return [
    ["Numéro", "Date", "Client", "Total (DT)", "Retourné (DT)", "Encaissé (DT)", "Reste dû (DT)", "Statut"],
    ...rows.map((s) => [
      s.number === null ? "" : String(s.number).padStart(6, "0"),
      formatIsoDateTime(s.finalized_at ?? s.created_at, timeZone),
      s.customer_name ?? "",
      money(s.total_millimes),
      money(s.returned_millimes),
      money(s.paid_millimes),
      money(s.status === "finalized" ? s.due_millimes : 0),
      s.status === "draft" ? "Brouillon" : "Finalisée",
    ]),
  ];
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export type ExportCustomerRow = {
  name: string;
  phone: string | null;
  is_active: boolean;
  sales_count: number;
  balance_millimes: number;
  created_at: string;
};

export function customersExportRows(rows: readonly ExportCustomerRow[], timeZone: string): CsvTable {
  return [
    ["Nom", "Téléphone", "Actif", "Ventes", "Solde dû (DT)", "Client depuis"],
    ...rows.map((c) => [c.name, c.phone ?? "", yesNo(c.is_active), c.sales_count, money(c.balance_millimes), formatIsoDate(c.created_at, timeZone)]),
  ];
}

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------
export type ExportPurchaseOrderRow = {
  number: number | null;
  status: PurchaseOrderStatus;
  supplier: string;
  expected_date: string | null;
  ordered_total_millimes: number;
  created_at: string;
};

export function purchaseOrdersExportRows(
  rows: readonly ExportPurchaseOrderRow[],
  statusLabels: Record<PurchaseOrderStatus, string>,
  timeZone: string,
): CsvTable {
  return [
    ["Numéro", "Fournisseur", "Statut", "Date prévue", "Total commandé (DT)", "Créée le"],
    ...rows.map((o) => [
      poNumber(o.number, "Brouillon"),
      o.supplier,
      statusLabels[o.status],
      o.expected_date ?? "",
      money(o.ordered_total_millimes),
      formatIsoDate(o.created_at, timeZone),
    ]),
  ];
}

/** "articles-2026-10-14.csv" */
export function exportFileName(base: string, day: string): string {
  return `${base}-${day}.csv`;
}

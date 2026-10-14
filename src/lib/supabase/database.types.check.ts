/**
 * Compile-time contract between the hand-written database types (used by the
 * app, deliberately narrower: e.g. `status: "draft" | "finalized"` where the
 * column is `text` + CHECK) and the types GENERATED from a real Supabase
 * schema (`npm run db:types`).
 *
 * `npm run typecheck` fails if, for any table/function:
 *   - a table, column or function exists on one side only;
 *   - nullability differs (DB nullable but declared non-null, or vice versa);
 *   - a hand-written row type is not assignable to the generated one
 *     (i.e. it is wider or of a different type);
 *   - function argument names differ, or a table-returning function's columns differ.
 * This file has no runtime code.
 */
import type { Database as Hand } from "./database.types";
import type { Database as Gen } from "./database.generated";

type Expect<T extends true> = T;

type KeyDiff<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never]
  ? true
  : { onlyInHandWritten: Exclude<keyof A, keyof B>; onlyInGenerated: Exclude<keyof B, keyof A> };

type NullabilityMismatch<A, B> = {
  [K in keyof A & keyof B]: (null extends A[K] ? true : false) extends (null extends B[K] ? true : false) ? never : K;
}[keyof A & keyof B];

type RowCheck<A, B> = KeyDiff<A, B> extends true
  ? [NullabilityMismatch<A, B>] extends [never]
    ? A extends B
      ? true
      : { notAssignableToGenerated: { [K in keyof A & keyof B]: A[K] extends B[K] ? never : K }[keyof A & keyof B] }
    : { nullabilityMismatch: NullabilityMismatch<A, B> }
  : KeyDiff<A, B>;

type HT = Hand["public"]["Tables"];
type GT = Gen["public"]["Tables"];
type HF = Hand["public"]["Functions"];
type GF = Gen["public"]["Functions"];

type TableResults = {
  [T in keyof HT & keyof GT]: RowCheck<HT[T]["Row"], GT[T]["Row"]>;
};
type FailingTables = { [T in keyof TableResults]: TableResults[T] extends true ? never : T }[keyof TableResults];

type RowOf<R> = R extends (infer E)[] ? E : R;
type FunctionResults = {
  [F in keyof HF & keyof GF]: KeyDiff<HF[F]["Args"], GF[F]["Args"]> extends true
    ? RowOf<HF[F]["Returns"]> extends Record<string, unknown>
      ? RowOf<GF[F]["Returns"]> extends Record<string, unknown>
        ? KeyDiff<RowOf<HF[F]["Returns"]>, RowOf<GF[F]["Returns"]>>
        : true
      : true
    : KeyDiff<HF[F]["Args"], GF[F]["Args"]>;
};
type FailingFunctions = { [F in keyof FunctionResults]: FunctionResults[F] extends true ? never : F }[keyof FunctionResults];

// Hover these in an editor to see details when a check fails.
export type TableReport = { [T in FailingTables]: TableResults[T] };
export type FunctionReport = { [F in FailingFunctions]: FunctionResults[F] };

export type Checks = [
  Expect<KeyDiff<HT, GT>>,
  Expect<KeyDiff<HF, GF>>,
  Expect<[FailingTables] extends [never] ? true : false>,
  Expect<[FailingFunctions] extends [never] ? true : false>,
];

// One line per table / function, so a failure names the culprit.
// When a migration adds a table or function, the aggregate checks above fail
// until a line is added here (after `npm run db:types`).
export type PerTable = [
  Expect<RowCheck<HT["audit_logs"]["Row"], GT["audit_logs"]["Row"]>>,
  Expect<RowCheck<HT["catalog_import_batches"]["Row"], GT["catalog_import_batches"]["Row"]>>,
  Expect<RowCheck<HT["categories"]["Row"], GT["categories"]["Row"]>>,
  Expect<RowCheck<HT["customers"]["Row"], GT["customers"]["Row"]>>,
  Expect<RowCheck<HT["document_sequences"]["Row"], GT["document_sequences"]["Row"]>>,
  Expect<RowCheck<HT["locations"]["Row"], GT["locations"]["Row"]>>,
  Expect<RowCheck<HT["organization_invitations"]["Row"], GT["organization_invitations"]["Row"]>>,
  Expect<RowCheck<HT["organization_members"]["Row"], GT["organization_members"]["Row"]>>,
  Expect<RowCheck<HT["organizations"]["Row"], GT["organizations"]["Row"]>>,
  Expect<RowCheck<HT["payment_methods"]["Row"], GT["payment_methods"]["Row"]>>,
  Expect<RowCheck<HT["product_variant_costs"]["Row"], GT["product_variant_costs"]["Row"]>>,
  Expect<RowCheck<HT["product_variants"]["Row"], GT["product_variants"]["Row"]>>,
  Expect<RowCheck<HT["products"]["Row"], GT["products"]["Row"]>>,
  Expect<RowCheck<HT["profiles"]["Row"], GT["profiles"]["Row"]>>,
  Expect<RowCheck<HT["purchase_order_items"]["Row"], GT["purchase_order_items"]["Row"]>>,
  Expect<RowCheck<HT["purchase_orders"]["Row"], GT["purchase_orders"]["Row"]>>,
  Expect<RowCheck<HT["sale_item_costs"]["Row"], GT["sale_item_costs"]["Row"]>>,
  Expect<RowCheck<HT["sale_items"]["Row"], GT["sale_items"]["Row"]>>,
  Expect<RowCheck<HT["sale_payments"]["Row"], GT["sale_payments"]["Row"]>>,
  Expect<RowCheck<HT["sale_return_items"]["Row"], GT["sale_return_items"]["Row"]>>,
  Expect<RowCheck<HT["sale_returns"]["Row"], GT["sale_returns"]["Row"]>>,
  Expect<RowCheck<HT["sales"]["Row"], GT["sales"]["Row"]>>,
  Expect<RowCheck<HT["stock_adjustment_lines"]["Row"], GT["stock_adjustment_lines"]["Row"]>>,
  Expect<RowCheck<HT["stock_adjustments"]["Row"], GT["stock_adjustments"]["Row"]>>,
  Expect<RowCheck<HT["stock_count_items"]["Row"], GT["stock_count_items"]["Row"]>>,
  Expect<RowCheck<HT["stock_counts"]["Row"], GT["stock_counts"]["Row"]>>,
  Expect<RowCheck<HT["stock_levels"]["Row"], GT["stock_levels"]["Row"]>>,
  Expect<RowCheck<HT["stock_movements"]["Row"], GT["stock_movements"]["Row"]>>,
  Expect<RowCheck<HT["stock_opening_costs"]["Row"], GT["stock_opening_costs"]["Row"]>>,
  Expect<RowCheck<HT["stock_receipt_lines"]["Row"], GT["stock_receipt_lines"]["Row"]>>,
  Expect<RowCheck<HT["stock_receipts"]["Row"], GT["stock_receipts"]["Row"]>>,
  Expect<RowCheck<HT["stock_transfer_lines"]["Row"], GT["stock_transfer_lines"]["Row"]>>,
  Expect<RowCheck<HT["stock_transfers"]["Row"], GT["stock_transfers"]["Row"]>>,
  Expect<RowCheck<HT["supplier_payments"]["Row"], GT["supplier_payments"]["Row"]>>,
  Expect<RowCheck<HT["suppliers"]["Row"], GT["suppliers"]["Row"]>>,
  Expect<RowCheck<HT["organization_integrations"]["Row"], GT["organization_integrations"]["Row"]>>,
];

export type PerFunction = [
  Expect<FunctionResults["cancel_purchase_order"]>,
  Expect<FunctionResults["cancel_sale_draft"]>,
  Expect<FunctionResults["cancel_stock_count"]>,
  Expect<FunctionResults["check_purchasing_consistency"]>,
  Expect<FunctionResults["check_sales_consistency"]>,
  Expect<FunctionResults["check_stock_reconciliation"]>,
  Expect<FunctionResults["close_purchase_order"]>,
  Expect<FunctionResults["consume_integration_call"]>,
  Expect<FunctionResults["commit_catalog_import"]>,
  Expect<FunctionResults["create_invitation"]>,
  Expect<FunctionResults["create_organization"]>,
  Expect<FunctionResults["create_product"]>,
  Expect<FunctionResults["create_sale_return"]>,
  Expect<FunctionResults["create_stock_adjustment"]>,
  Expect<FunctionResults["create_stock_count"]>,
  Expect<FunctionResults["customer_balances"]>,
  Expect<FunctionResults["dashboard_attention"]>,
  Expect<FunctionResults["finalize_sale"]>,
  Expect<FunctionResults["global_search"]>,
  Expect<FunctionResults["find_catalog_conflicts"]>,
  Expect<FunctionResults["find_variant_by_code"]>,
  Expect<FunctionResults["list_my_invitations"]>,
  Expect<FunctionResults["list_organization_members"]>,
  Expect<FunctionResults["place_purchase_order"]>,
  Expect<FunctionResults["post_stock_receipt"]>,
  Expect<FunctionResults["post_stock_transfer"]>,
  Expect<FunctionResults["receive_purchase_order"]>,
  Expect<FunctionResults["record_opening_stock"]>,
  Expect<FunctionResults["record_sale_payment"]>,
  Expect<FunctionResults["record_sale_refund"]>,
  Expect<FunctionResults["record_stock_count"]>,
  Expect<FunctionResults["record_supplier_payment"]>,
  Expect<FunctionResults["remove_member"]>,
  Expect<FunctionResults["report_payments_by_method"]>,
  Expect<FunctionResults["report_sales_by_day"]>,
  Expect<FunctionResults["report_sales_by_product"]>,
  Expect<FunctionResults["respond_to_invitation"]>,
  Expect<FunctionResults["review_stock_adjustment"]>,
  Expect<FunctionResults["review_stock_count"]>,
  Expect<FunctionResults["revoke_invitation"]>,
  Expect<FunctionResults["sales_daily_summary"]>,
  Expect<FunctionResults["set_integration_enabled"]>,
  Expect<FunctionResults["save_purchase_order"]>,
  Expect<FunctionResults["save_sale_draft"]>,
  Expect<FunctionResults["save_variant"]>,
  Expect<FunctionResults["search_customers"]>,
  Expect<FunctionResults["search_products"]>,
  Expect<FunctionResults["search_sales"]>,
  Expect<FunctionResults["search_variants"]>,
  Expect<FunctionResults["stage_catalog_import"]>,
  Expect<FunctionResults["stock_overview"]>,
  Expect<FunctionResults["stock_valuation"]>,
  Expect<FunctionResults["submit_stock_count"]>,
  Expect<FunctionResults["supplier_balances"]>,
  Expect<FunctionResults["update_member_role"]>,
];

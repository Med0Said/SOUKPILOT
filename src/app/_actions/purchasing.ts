"use server";

/**
 * Purchasing server actions (owner/manager). Same pattern as the other
 * modules: session → Zod → role (UX) → SQL function (authority).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { membershipFor } from "@/lib/auth/organization";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { isKnownDbError, messageForDbError, messageWithDetail } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ActionState } from "@/lib/actions";
import { fieldErrorsFrom, formDataToObject } from "@/lib/validation/schemas";
import { purchaseOrderSchema, receivePurchaseOrderSchema, supplierPaymentSchema } from "@/lib/validation/purchasing";
import { fr } from "@/i18n/fr";

const FORBIDDEN: ActionState = { status: "error", message: messageForDbError({ message: "forbidden" }) };
const INVALID: ActionState = { status: "error", message: messageForDbError({ message: "invalid_parameter" }) };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(event: string, error: { message?: string; code?: string; details?: string | null }, fields = {}): ActionState {
  if (!isKnownDbError(error)) logger.error(event, { ...fields, code: error.code, message: error.message });
  return { status: "error", message: messageWithDetail(error) };
}

function invalid(error: z.ZodError): ActionState {
  return { status: "error", message: "Certains champs sont invalides.", fieldErrors: fieldErrorsFrom(error) };
}

function payload(formData: FormData): unknown {
  const raw = formData.get("payload");
  if (typeof raw !== "string" || raw.length > 300_000) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function canPurchase(organizationId: string) {
  const context = await membershipFor(organizationId);
  return Boolean(context && can(context.membership.role, "purchasing.manage"));
}

function revalidatePurchasing(poId?: string) {
  revalidatePath("/app/purchases", "layout");
  revalidatePath("/app/suppliers", "layout");
  revalidatePath("/app/stock", "layout");
  if (poId) revalidatePath(`/app/purchases/${poId}`);
}

/** Current purchase costs to pre-fill order lines (owner/manager only, RLS). */
export async function variantCostsAction(organizationId: string, variantIds: string[]): Promise<Record<string, number | null>> {
  if (!UUID.test(organizationId) || !variantIds.every((v) => UUID.test(v)) || variantIds.length > 100) return {};
  if (!(await canPurchase(organizationId))) return {};
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_variant_costs")
    .select("variant_id, cost_millimes")
    .eq("organization_id", organizationId)
    .in("variant_id", variantIds);
  // Pre-fill only: on failure the cost fields stay empty for the user to type.
  if (error) logger.warn("purchases.cost_prefill_failed", { organizationId, code: error.code });
  return Object.fromEntries((data ?? []).map((c) => [c.variant_id, c.cost_millimes]));
}

export async function savePurchaseOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = purchaseOrderSchema.safeParse(payload(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (!(await canPurchase(d.organizationId))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { data: id, error } = await supabase.rpc("save_purchase_order", {
    p_organization_id: d.organizationId,
    p_purchase_order_id: d.purchaseOrderId,
    p_supplier_id: d.supplierId,
    p_location_id: d.locationId,
    p_expected_date: d.expectedDate,
    p_reference: d.reference,
    p_note: d.note,
    p_lines: d.lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity, unit_cost_millimes: l.cost })),
  });
  if (error || !id) return failure("purchase_order.save_failed", error ?? {}, { organizationId: d.organizationId });
  revalidatePurchasing(id);
  redirect(`/app/purchases/${id}?saved=1`);
}

export async function purchaseOrderTransitionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = String(formData.get("purchaseOrderId") ?? "");
  const step = formData.get("step");
  if (!UUID.test(id)) return INVALID;
  const supabase = await createSupabaseServerClient();
  let message: string;
  if (step === "place") {
    const { error } = await supabase.rpc("place_purchase_order", { p_purchase_order_id: id });
    if (error) return failure("purchase_order.place_failed", error, { id });
    message = fr.purchases.detail.placed;
  } else if (step === "cancel") {
    const { error } = await supabase.rpc("cancel_purchase_order", { p_purchase_order_id: id });
    if (error) return failure("purchase_order.cancel_failed", error, { id });
    message = fr.purchases.detail.cancelled;
  } else if (step === "close") {
    const { error } = await supabase.rpc("close_purchase_order", { p_purchase_order_id: id });
    if (error) return failure("purchase_order.close_failed", error, { id });
    message = fr.purchases.detail.closed;
  } else {
    return INVALID;
  }
  revalidatePurchasing(id);
  return { status: "success", message };
}

export async function receivePurchaseOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = receivePurchaseOrderSchema.safeParse(payload(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("receive_purchase_order", {
    p_purchase_order_id: d.purchaseOrderId,
    p_lines: d.lines.map((l) => ({ purchase_order_item_id: l.itemId, quantity: l.quantity, unit_cost_millimes: l.cost })),
    p_reference: d.reference,
    p_note: d.note,
    p_update_costs: d.updateCosts,
    p_idempotency_key: d.idempotencyKey,
  });
  if (error) return failure("purchase_order.receive_failed", error, { id: d.purchaseOrderId });
  revalidatePurchasing(d.purchaseOrderId);
  redirect(`/app/purchases/${d.purchaseOrderId}?received=1`);
}

export async function supplierPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = supplierPaymentSchema.safeParse(raw);
  if (!parsed.success) return { ...invalid(parsed.error), values: raw };
  const d = parsed.data;
  if (!(await canPurchase(d.organizationId))) return FORBIDDEN;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_supplier_payment", {
    p_organization_id: d.organizationId,
    p_supplier_id: d.supplierId,
    p_method_id: d.methodId,
    p_kind: d.kind,
    p_amount_millimes: d.amount,
    p_paid_on: d.paidOn,
    p_reference: d.reference,
    p_note: d.note,
    p_purchase_order_id: null,
    p_idempotency_key: d.idempotencyKey,
  });
  if (error) return { ...failure("supplier.payment_failed", error, { supplierId: d.supplierId }), values: raw };
  revalidatePurchasing();
  revalidatePath(`/app/suppliers/${d.supplierId}`);
  return { status: "success", message: d.kind === "payment" ? fr.purchases.supplier.paymentRecorded : fr.purchases.supplier.refundRecorded };
}

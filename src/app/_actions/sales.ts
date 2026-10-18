"use server";

/**
 * Sales server actions. Prices and totals are never taken from the browser:
 * the cart sends variant ids, quantities, discounts and payments, and
 * finalize_sale recomputes everything in one transaction.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { membershipFor } from "@/lib/auth/organization";
import { requireUser } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/auth/permissions";
import { isKnownDbError, messageForDbError, messageWithDetail } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ActionState } from "@/lib/actions";
import { fieldErrorsFrom, formDataToObject } from "@/lib/validation/schemas";
import {
  customerSchema,
  discountSettingSchema,
  paymentMethodSchema,
  saleCartSchema,
  salePaymentSchema,
  saleReturnSchema,
  toSaleRpcLines,
  toSaleRpcPayments,
} from "@/lib/validation/sales";
import { fr } from "@/i18n/fr";
import { isUuid } from "@/lib/validation/ids";

const FORBIDDEN: ActionState = { status: "error", message: messageForDbError({ message: "forbidden" }) };

function failure(event: string, error: { message?: string; code?: string; details?: string | null }, fields = {}): ActionState {
  if (!isKnownDbError(error)) logger.error(event, { ...fields, code: error.code, message: error.message });
  return { status: "error", message: messageWithDetail(error) };
}

function invalid(error: z.ZodError): ActionState {
  return { status: "error", message: "Certains champs sont invalides.", fieldErrors: fieldErrorsFrom(error) };
}

function payload(formData: FormData): unknown {
  const raw = formData.get("payload");
  if (typeof raw !== "string" || raw.length > 200_000) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function authorize(organizationId: string, permission: Permission) {
  const context = await membershipFor(organizationId);
  return context && can(context.membership.role, permission) ? context : null;
}

function revalidateSales(saleId?: string) {
  revalidatePath("/app/sales", "layout");
  revalidatePath("/app/stock", "layout");
  revalidatePath("/app/customers", "layout");
  revalidatePath("/app");
  if (saleId) revalidatePath(`/app/sales/${saleId}`);
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------
export async function finalizeSaleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = saleCartSchema.safeParse(payload(formData));
  if (!parsed.success) return invalid(parsed.error);
  const cart = parsed.data;
  if (!(await authorize(cart.organizationId, "sales.sell"))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { data: id, error } = await supabase.rpc("finalize_sale", {
    p_organization_id: cart.organizationId,
    p_sale_id: cart.saleId,
    p_location_id: cart.locationId,
    p_customer_id: cart.customerId,
    p_lines: toSaleRpcLines(cart),
    p_order_discount_millimes: cart.orderDiscount,
    p_note: cart.note,
    p_payments: toSaleRpcPayments(cart),
    p_idempotency_key: cart.idempotencyKey,
  });
  if (error || !id) return failure("sale.finalize_failed", error ?? {}, { organizationId: cart.organizationId });
  revalidateSales(id);
  redirect(`/app/sales/${id}?created=1`);
}

export async function saveDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = saleCartSchema.safeParse(payload(formData));
  if (!parsed.success) return invalid(parsed.error);
  const cart = parsed.data;
  if (!(await authorize(cart.organizationId, "sales.sell"))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { data: id, error } = await supabase.rpc("save_sale_draft", {
    p_organization_id: cart.organizationId,
    p_sale_id: cart.saleId,
    p_location_id: cart.locationId,
    p_customer_id: cart.customerId,
    p_lines: toSaleRpcLines(cart),
    p_order_discount_millimes: cart.orderDiscount,
    p_note: cart.note,
  });
  if (error || !id) return failure("sale.draft_failed", error ?? {}, { organizationId: cart.organizationId });
  revalidateSales();
  redirect(`/app/sales/new?draft=${id}&saved=1`);
}

export async function cancelDraftAction(formData: FormData): Promise<void> {
  await requireUser();
  const saleId = String(formData.get("saleId") ?? "");
  if (!isUuid(saleId)) redirect("/app/sales");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_sale_draft", { p_sale_id: saleId });
  if (error && !isKnownDbError(error)) logger.error("sale.draft_cancel_failed", { saleId, code: error.code });
  revalidateSales();
  redirect("/app/sales?status=draft");
}

// ---------------------------------------------------------------------------
// After the sale
// ---------------------------------------------------------------------------
export async function recordPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = salePaymentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_sale_payment", {
    p_sale_id: d.saleId,
    p_method_id: d.methodId,
    p_amount_millimes: d.amount,
    p_idempotency_key: d.idempotencyKey,
  });
  if (error) return failure("sale.payment_failed", error, { saleId: d.saleId });
  revalidateSales(d.saleId);
  return { status: "success", message: fr.sales.detail.paymentRecorded };
}

export async function refundAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = salePaymentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_sale_refund", {
    p_sale_id: d.saleId,
    p_method_id: d.methodId,
    p_amount_millimes: d.amount,
    p_idempotency_key: d.idempotencyKey,
  });
  if (error) return failure("sale.refund_failed", error, { saleId: d.saleId });
  revalidateSales(d.saleId);
  return { status: "success", message: fr.sales.detail.refundRecorded };
}

export async function returnAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = saleReturnSchema.safeParse(payload(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_sale_return", {
    p_sale_id: d.saleId,
    p_lines: d.lines.map((l) => ({ sale_item_id: l.saleItemId, quantity: l.quantity, restock: l.restock })),
    p_reason: d.reason,
    p_refund_method_id: d.refundMethodId,
    p_refund_amount_millimes: d.refundAmount,
    p_idempotency_key: d.idempotencyKey,
  });
  if (error) return failure("sale.return_failed", error, { saleId: d.saleId });
  revalidateSales(d.saleId);
  redirect(`/app/sales/${d.saleId}?returned=1`);
}

// ---------------------------------------------------------------------------
// Customers, payment methods, discount setting
// ---------------------------------------------------------------------------
export async function saveCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = customerSchema.safeParse(raw);
  if (!parsed.success) return { ...invalid(parsed.error), values: raw };
  const { organizationId, customerId, isActive, ...fields } = parsed.data;
  if (!(await authorize(organizationId, customerId ? "customers.manage" : "sales.sell"))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = customerId
    ? await supabase
        .from("customers")
        .update({ ...fields, is_active: isActive })
        .eq("id", customerId)
        .eq("organization_id", organizationId)
    : await supabase.from("customers").insert({ organization_id: organizationId, ...fields });
  if (error) return { ...failure("customer.save_failed", error, { organizationId }), values: raw };
  revalidatePath("/app/customers", "layout");
  return { status: "success", message: customerId ? fr.customers.saved : fr.customers.created };
}

/** Quick creation from the cart; returns the new customer for selection. */
export async function quickCreateCustomerAction(
  organizationId: string,
  name: string,
  phone: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; message: string }> {
  const parsed = customerSchema.safeParse({ organizationId, name, phone });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? fr.common.unexpectedError };
  if (!(await authorize(organizationId, "sales.sell"))) return { ok: false, message: FORBIDDEN.message as string };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ organization_id: organizationId, name: parsed.data.name, phone: parsed.data.phone })
    .select("id, name")
    .single();
  if (error || !data) return { ok: false, message: failure("customer.quick_create_failed", error ?? {}).message as string };
  return { ok: true, id: data.id, name: data.name };
}

export async function savePaymentMethodAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = paymentMethodSchema.safeParse(raw);
  if (!parsed.success) return { ...invalid(parsed.error), values: raw };
  const { organizationId, methodId, label, kind, sortOrder, isActive } = parsed.data;
  if (!(await authorize(organizationId, "paymentMethods.manage"))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const row = { label, kind, sort_order: sortOrder, is_active: isActive };
  const { error } = methodId
    ? await supabase.from("payment_methods").update(row).eq("id", methodId).eq("organization_id", organizationId)
    : await supabase.from("payment_methods").insert({ organization_id: organizationId, ...row });
  if (error) return { ...failure("payment_method.save_failed", error, { organizationId }), values: raw };
  revalidatePath("/app/settings/payment-methods");
  return { status: "success", message: methodId ? fr.paymentMethods.saved : fr.paymentMethods.created };
}

export async function updateDiscountSettingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = discountSettingSchema.safeParse(raw);
  if (!parsed.success) return { ...invalid(parsed.error), values: raw };
  if (!(await authorize(parsed.data.organizationId, "organization.update"))) return FORBIDDEN;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .update({ cashier_max_discount_bps: parsed.data.maxDiscount })
    .eq("id", parsed.data.organizationId)
    .select("id");
  if (error) return failure("organization.discount_update_failed", error);
  if (!data?.length) return FORBIDDEN;
  revalidatePath("/app", "layout");
  return { status: "success", message: fr.settings.saved };
}


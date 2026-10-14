"use server";

/**
 * Stock server actions. Each posting action carries an idempotency key
 * generated when the form was rendered, so a double tap or a retry after a
 * lost response never applies stock twice (enforced in SQL).
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
import { fieldErrorsFrom } from "@/lib/validation/schemas";
import {
  adjustmentSchema,
  countCreateSchema,
  countRecordSchema,
  openingSchema,
  receiptSchema,
  toCostLines,
  toDeltaLines,
  toQuantityLines,
  transferSchema,
} from "@/lib/validation/stock";

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

async function authorize(organizationId: string, permission: Permission) {
  const context = await membershipFor(organizationId);
  return context && can(context.membership.role, permission) ? context : null;
}

function revalidateStock() {
  revalidatePath("/app/stock", "layout");
  revalidatePath("/app");
}

// ---------------------------------------------------------------------------
// Variant picker
// ---------------------------------------------------------------------------
export type VariantSearchResult = {
  variantId: string;
  productName: string;
  optionValues: string[];
  sku: string | null;
  barcode: string | null;
  trackStock: boolean;
  quantity: number;
  /** Current selling price (display only; sales are priced in SQL). */
  priceMillimes: number;
};

export async function searchVariantsAction(
  organizationId: string,
  query: string,
  locationId: string | null,
): Promise<VariantSearchResult[]> {
  if (!UUID.test(organizationId) || (locationId && !UUID.test(locationId))) return [];
  const q = query.trim().slice(0, 100);
  if (q.length < 1) return [];
  if (!(await authorize(organizationId, "stock.view"))) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_variants", {
    p_organization_id: organizationId,
    p_query: q,
    p_location_id: locationId,
    p_limit: 20,
  });
  if (error) {
    logger.error("stock.search_variants_failed", { organizationId, code: error.code });
    return [];
  }
  return (data ?? []).map((v) => ({
    variantId: v.variant_id,
    productName: v.product_name,
    optionValues: v.option_values,
    sku: v.sku,
    barcode: v.barcode,
    trackStock: v.track_stock,
    quantity: v.quantity,
    priceMillimes: v.price_millimes,
  }));
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export async function postReceiptAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = receiptSchema.safeParse(payload(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (!(await authorize(d.organizationId, "stock.receive"))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { data: id, error } = await supabase.rpc("post_stock_receipt", {
    p_organization_id: d.organizationId,
    p_location_id: d.locationId,
    p_supplier_id: d.supplierId,
    p_reference: d.reference,
    p_note: d.note,
    p_lines: toCostLines(d.lines),
    p_update_costs: d.updateCosts,
    p_idempotency_key: d.idempotencyKey,
  });
  if (error || !id) return failure("stock.receipt_failed", error ?? {}, { organizationId: d.organizationId });
  revalidateStock();
  redirect(`/app/stock/receipts/${id}?created=1`);
}

export async function recordOpeningAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = openingSchema.safeParse(payload(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (!(await authorize(d.organizationId, "stock.receive"))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_opening_stock", {
    p_organization_id: d.organizationId,
    p_location_id: d.locationId,
    p_lines: toCostLines(d.lines),
    p_idempotency_key: d.idempotencyKey,
  });
  if (error) return failure("stock.opening_failed", error, { organizationId: d.organizationId });
  revalidateStock();
  redirect("/app/stock?done=opening");
}

export async function createAdjustmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = adjustmentSchema.safeParse(payload(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (!(await authorize(d.organizationId, "stock.adjust.propose"))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_stock_adjustment", {
    p_organization_id: d.organizationId,
    p_location_id: d.locationId,
    p_reason: d.reason,
    p_lines: toDeltaLines(d.lines),
    p_idempotency_key: d.idempotencyKey,
  });
  if (error) return failure("stock.adjustment_failed", error, { organizationId: d.organizationId });
  revalidateStock();
  redirect("/app/stock/adjustments?created=1");
}

export async function reviewAdjustmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const adjustmentId = String(formData.get("adjustmentId") ?? "");
  const decision = formData.get("decision");
  if (!UUID.test(adjustmentId) || (decision !== "approve" && decision !== "reject")) return INVALID;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_stock_adjustment", {
    p_adjustment_id: adjustmentId,
    p_approve: decision === "approve",
    p_note: String(formData.get("note") ?? "").slice(0, 500) || null,
  });
  if (error) return failure("stock.adjustment_review_failed", error, { adjustmentId });
  revalidateStock();
  return { status: "success", message: decision === "approve" ? "Ajustement validé : le stock est mis à jour." : "Ajustement refusé." };
}

export async function postTransferAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = transferSchema.safeParse(payload(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (!(await authorize(d.organizationId, "stock.transfer"))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("post_stock_transfer", {
    p_organization_id: d.organizationId,
    p_from_location_id: d.fromLocationId,
    p_to_location_id: d.toLocationId,
    p_note: d.note,
    p_lines: toQuantityLines(d.lines),
    p_idempotency_key: d.idempotencyKey,
  });
  if (error) return failure("stock.transfer_failed", error, { organizationId: d.organizationId });
  revalidateStock();
  redirect("/app/stock/transfers?created=1");
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------
export async function createCountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = countCreateSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (!(await authorize(d.organizationId, "stock.count.manage"))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { data: id, error } = await supabase.rpc("create_stock_count", {
    p_organization_id: d.organizationId,
    p_location_id: d.locationId,
    p_note: d.note,
    p_variant_ids: null,
    p_idempotency_key: d.idempotencyKey,
  });
  if (error || !id) return failure("stock.count_create_failed", error ?? {}, { organizationId: d.organizationId });
  revalidateStock();
  redirect(`/app/stock/counts/${id}`);
}

export async function recordCountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = countRecordSchema.safeParse(payload(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_stock_count", {
    p_count_id: parsed.data.countId,
    p_items: parsed.data.items.map((i) => ({ variant_id: i.variantId, counted_quantity: i.counted })),
  });
  if (error) return failure("stock.count_record_failed", error, { countId: parsed.data.countId });
  revalidatePath(`/app/stock/counts/${parsed.data.countId}`);
  return { status: "success", message: `${data ?? 0} quantité(s) enregistrée(s).` };
}

export async function countTransitionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const countId = String(formData.get("countId") ?? "");
  const step = formData.get("step");
  if (!UUID.test(countId)) return INVALID;

  const supabase = await createSupabaseServerClient();
  let message: string;
  if (step === "submit") {
    const { error } = await supabase.rpc("submit_stock_count", { p_count_id: countId });
    if (error) return failure("stock.count_submit_failed", error, { countId });
    message = "Inventaire soumis pour validation.";
  } else if (step === "approve" || step === "reject") {
    const { data, error } = await supabase.rpc("review_stock_count", { p_count_id: countId, p_approve: step === "approve" });
    if (error) return failure("stock.count_review_failed", error, { countId });
    message = step === "approve" ? `Inventaire validé : ${data ?? 0} écart(s) appliqué(s) au stock.` : "Inventaire renvoyé pour recomptage.";
  } else if (step === "cancel") {
    const { error } = await supabase.rpc("cancel_stock_count", { p_count_id: countId });
    if (error) return failure("stock.count_cancel_failed", error, { countId });
    message = "Inventaire annulé.";
  } else {
    return INVALID;
  }
  revalidateStock();
  revalidatePath(`/app/stock/counts/${countId}`);
  return { status: "success", message };
}

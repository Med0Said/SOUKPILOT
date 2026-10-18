"use server";

/**
 * Catalog server actions: products, variants, categories, suppliers,
 * locations and CSV import. Same pattern as organizations.ts: session →
 * Zod → membership/role (UX) → Supabase with the user's JWT (RLS and SQL
 * functions are the authority) → French error messages.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { membershipFor } from "@/lib/auth/organization";
import { can, type Permission } from "@/lib/auth/permissions";
import { isKnownDbError, messageForDbError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ActionState } from "@/lib/actions";
import type { Json } from "@/lib/supabase/database.types";
import { fieldErrorsFrom, formDataToObject } from "@/lib/validation/schemas";
import {
  categorySchema,
  locationSchema,
  productFormSchema,
  productUpdateSchema,
  supplierSchema,
  toProductPayload,
  variantSaveSchema,
} from "@/lib/validation/catalog";
import { analyzeImportFile, identifiersToCheck, type ImportAnalysis } from "@/lib/domain/catalog-import";
import { decodeCsvBytes } from "@/lib/domain/csv";
import { isUuid } from "@/lib/validation/ids";

const FORBIDDEN: ActionState = { status: "error", message: messageForDbError({ message: "forbidden" }) };
const INVALID: ActionState = { status: "error", message: "Formulaire invalide. Rechargez la page." };

function dbFailure(event: string, error: { message?: string; code?: string; details?: string }, fields = {}): ActionState {
  if (!isKnownDbError(error)) logger.error(event, { ...fields, code: error.code, message: error.message });
  return { status: "error", message: messageForDbError(error) };
}

async function authorize(organizationId: string, permission: Permission) {
  const context = await membershipFor(organizationId);
  return context && can(context.membership.role, permission) ? context : null;
}

function parseJsonField(formData: FormData, name: string): unknown {
  const raw = formData.get(name);
  if (typeof raw !== "string" || raw.length > 500_000) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function invalid(error: z.ZodError): ActionState {
  return { status: "error", message: "Certains champs sont invalides.", fieldErrors: fieldErrorsFrom(error) };
}

// ---------------------------------------------------------------------------
// Products & variants
// ---------------------------------------------------------------------------

export async function createProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = productFormSchema.safeParse(parseJsonField(formData, "payload"));
  if (!parsed.success) return invalid(parsed.error);
  const context = await authorize(parsed.data.organizationId, "catalog.manage");
  if (!context) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { data: productId, error } = await supabase.rpc("create_product", {
    p_organization_id: parsed.data.organizationId,
    p_product: toProductPayload(parsed.data) as unknown as Json,
  });
  if (error || !productId) return dbFailure("product.create_failed", error ?? {}, { organizationId: parsed.data.organizationId });

  revalidatePath("/app/catalog");
  redirect(`/app/catalog/${productId}?created=1`);
}

export async function updateProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = productUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ...invalid(parsed.error), values: raw };
  const { organizationId, productId, ...fields } = parsed.data;
  if (!(await authorize(organizationId, "catalog.manage"))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .update({
      name: fields.name,
      description: fields.description,
      category_id: fields.categoryId,
      supplier_id: fields.supplierId,
      track_stock: fields.trackStock,
      is_active: fields.isActive,
    })
    .eq("id", productId)
    .eq("organization_id", organizationId)
    .select("id");
  if (error) return dbFailure("product.update_failed", error, { organizationId, productId });
  if (!data?.length) return FORBIDDEN;

  revalidatePath(`/app/catalog/${productId}`);
  revalidatePath("/app/catalog");
  return { status: "success", message: "Article enregistré." };
}

export async function saveVariantAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = variantSaveSchema.safeParse(parseJsonField(formData, "payload"));
  if (!parsed.success) return invalid(parsed.error);
  const { organizationId, productId, variantId, variant } = parsed.data;
  if (!(await authorize(organizationId, "catalog.manage"))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_variant", {
    p_organization_id: organizationId,
    p_product_id: productId,
    p_variant_id: variantId,
    p_variant: {
      sku: variant.sku,
      barcode: variant.barcode,
      option_values: variant.optionValues,
      price_millimes: variant.price,
      cost_millimes: variant.cost,
      low_stock_threshold: variant.threshold,
      is_active: variant.isActive,
    },
  });
  if (error) return dbFailure("variant.save_failed", error, { organizationId, productId });

  revalidatePath(`/app/catalog/${productId}`);
  return { status: "success", message: variantId ? "Variante enregistrée." : "Variante ajoutée." };
}

// ---------------------------------------------------------------------------
// Categories, suppliers, locations (direct writes under RLS)
// ---------------------------------------------------------------------------

export async function saveCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return { ...invalid(parsed.error), values: raw };
  const { organizationId, categoryId, name } = parsed.data;
  if (!(await authorize(organizationId, "catalog.manage"))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = categoryId
    ? await supabase.from("categories").update({ name }).eq("id", categoryId).eq("organization_id", organizationId)
    : await supabase.from("categories").insert({ organization_id: organizationId, name });
  if (error) return { ...dbFailure("category.save_failed", error, { organizationId }), values: raw };

  revalidatePath("/app/catalog", "layout");
  return { status: "success", message: categoryId ? "Catégorie renommée." : "Catégorie créée." };
}

export async function deleteCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = categorySchema.pick({ organizationId: true, categoryId: true }).safeParse(formDataToObject(formData));
  if (!parsed.success || !parsed.data.categoryId) return INVALID;
  if (!(await authorize(parsed.data.organizationId, "catalog.manage"))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", parsed.data.categoryId)
    .eq("organization_id", parsed.data.organizationId);
  if (error) return dbFailure("category.delete_failed", error);

  revalidatePath("/app/catalog", "layout");
  return { status: "success", message: "Catégorie supprimée. Ses articles sont désormais sans catégorie." };
}

export async function saveSupplierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = supplierSchema.safeParse(raw);
  if (!parsed.success) return { ...invalid(parsed.error), values: raw };
  const { organizationId, supplierId, isActive, ...fields } = parsed.data;
  if (!(await authorize(organizationId, "suppliers.manage"))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const row = { ...fields, is_active: isActive };
  const { error } = supplierId
    ? await supabase.from("suppliers").update(row).eq("id", supplierId).eq("organization_id", organizationId)
    : await supabase.from("suppliers").insert({ organization_id: organizationId, ...row });
  if (error) return { ...dbFailure("supplier.save_failed", error, { organizationId }), values: raw };

  revalidatePath("/app/suppliers");
  return { status: "success", message: supplierId ? "Fournisseur enregistré." : "Fournisseur ajouté." };
}

export async function saveLocationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = locationSchema.safeParse(raw);
  if (!parsed.success) return { ...invalid(parsed.error), values: raw };
  const { organizationId, locationId, name, code, isActive } = parsed.data;
  if (!(await authorize(organizationId, "locations.manage"))) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = locationId
    ? await supabase
        .from("locations")
        .update({ name, code, is_active: isActive })
        .eq("id", locationId)
        .eq("organization_id", organizationId)
    : await supabase.from("locations").insert({ organization_id: organizationId, name, code, is_active: isActive });
  if (error) return { ...dbFailure("location.save_failed", error, { organizationId }), values: raw };

  revalidatePath("/app/settings/locations");
  return { status: "success", message: locationId ? "Emplacement enregistré." : "Emplacement ajouté." };
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

export type ImportPreviewState = ActionState & {
  batchId?: string;
  fileName?: string;
  analysis?: Pick<ImportAnalysis, "fatalErrors" | "warnings" | "rows" | "summary">;
  result?: { products_created: number; variants_created: number; categories_created: number; suppliers_created: number };
};

export async function previewImportAction(_prev: ImportPreviewState, formData: FormData): Promise<ImportPreviewState> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const file = formData.get("file");
  if (!(await authorize(organizationId, "catalog.import"))) return FORBIDDEN;
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choisissez un fichier CSV." };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { status: "error", message: "Fichier trop volumineux (2 Mo maximum)." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileName = file.name.slice(0, 255) || "import.csv";

  // 1. Ask the database which names / SKUs / barcodes already exist.
  const ids = identifiersToCheck(decodeCsvBytes(bytes).text);
  const supabase = await createSupabaseServerClient();
  const { data: conflicts, error: conflictError } = await supabase.rpc("find_catalog_conflicts", {
    p_organization_id: organizationId,
    p_names: ids.names,
    p_skus: ids.skus,
    p_barcodes: ids.barcodes,
  });
  if (conflictError) return dbFailure("import.conflicts_failed", conflictError, { organizationId });
  const existing = {
    names: new Set((conflicts ?? []).filter((c) => c.kind === "name").map((c) => c.value)),
    skus: new Set((conflicts ?? []).filter((c) => c.kind === "sku").map((c) => c.value)),
    barcodes: new Set((conflicts ?? []).filter((c) => c.kind === "barcode").map((c) => c.value)),
  };

  // 2. Validate and group rows.
  const analysis = analyzeImportFile(bytes, existing);
  const view = { fatalErrors: analysis.fatalErrors, warnings: analysis.warnings, rows: analysis.rows, summary: analysis.summary };
  if (analysis.fatalErrors.length > 0 || analysis.products.length === 0) {
    return { status: "error", fileName, analysis: view, message: analysis.fatalErrors[0] ?? "Aucun article valide à importer." };
  }

  // 3. Stage the validated payload; the commit re-checks everything in SQL.
  const { data: batchId, error } = await supabase.rpc("stage_catalog_import", {
    p_organization_id: organizationId,
    p_file_name: fileName,
    p_products: analysis.products as unknown as Json,
    p_summary: analysis.summary as unknown as Json,
  });
  if (error || !batchId) return { ...dbFailure("import.stage_failed", error ?? {}, { organizationId }), analysis: view, fileName };

  return { status: "idle", batchId, fileName, analysis: view };
}

export async function commitImportAction(prev: ImportPreviewState, formData: FormData): Promise<ImportPreviewState> {
  const batchId = String(formData.get("batchId") ?? "");
  if (!isUuid(batchId)) return INVALID;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("commit_catalog_import", { p_batch_id: batchId });
  if (error) {
    const failure = dbFailure("import.commit_failed", error, { batchId });
    const detail = error.details ? ` (article : « ${error.details} »)` : "";
    return { ...prev, status: "error", message: `${failure.message}${detail}` };
  }

  revalidatePath("/app/catalog", "layout");
  return {
    status: "success",
    fileName: prev.fileName,
    result: data as ImportPreviewState["result"],
    message: "Import terminé.",
  };
}

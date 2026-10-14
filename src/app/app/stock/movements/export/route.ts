import { NextResponse, type NextRequest } from "next/server";
import { movementExportRows } from "@/lib/domain/exports";
import { MOVEMENT_LABELS } from "@/lib/domain/stock";
import { collectPages, csvResponse, exportContext, exportFailed } from "@/lib/server/csv-export";
import { loadLocations, loadVariantInfo } from "@/lib/server/variants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StockMovementType } from "@/lib/supabase/database.types";
import { movementFilters } from "@/lib/ui/list-filters";

/** Stock movements matching the Mouvements filters, newest first. */
export async function GET(request: NextRequest) {
  const context = await exportContext("stock.view");
  if (context instanceof NextResponse) return context;
  const orgId = context.membership.organizationId;
  const filters = movementFilters(Object.fromEntries(request.nextUrl.searchParams), (v) => v in MOVEMENT_LABELS);
  const supabase = await createSupabaseServerClient();

  const { rows, error } = await collectPages((offset, limit) => {
    let query = supabase
      .from("stock_movements")
      .select("location_id, variant_id, quantity_delta, quantity_after, movement_type, reason, created_at")
      .eq("organization_id", orgId)
      .order("seq", { ascending: false })
      .range(offset, offset + limit - 1);
    if (filters.variant) query = query.eq("variant_id", filters.variant);
    if (filters.location) query = query.eq("location_id", filters.location);
    if (filters.type) query = query.eq("movement_type", filters.type as StockMovementType);
    return query;
  }, 500);
  if (error) return exportFailed(context, "movements", error);

  const [variants, locations] = await Promise.all([
    loadVariantInfo(supabase, orgId, rows.map((m) => m.variant_id)),
    loadLocations(supabase, orgId),
  ]);
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  return csvResponse(
    context,
    "movements",
    "mouvements-stock",
    movementExportRows(
      rows.map((m) => ({
        ...m,
        article: variants.get(m.variant_id)?.label ?? "?",
        sku: variants.get(m.variant_id)?.sku ?? null,
        location: locationName.get(m.location_id) ?? "",
      })),
      context.membership.timezone,
    ),
  );
}

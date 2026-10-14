import { NextResponse, type NextRequest } from "next/server";
import { stockExportRows } from "@/lib/domain/exports";
import { collectPages, csvResponse, exportContext, exportFailed } from "@/lib/server/csv-export";
import { loadLocations } from "@/lib/server/variants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { stockFilters } from "@/lib/ui/list-filters";
import { fr } from "@/i18n/fr";

/** Stock on hand matching the Stock page filters (all pages). */
export async function GET(request: NextRequest) {
  const context = await exportContext("stock.view");
  if (context instanceof NextResponse) return context;
  const orgId = context.membership.organizationId;
  const filters = stockFilters(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createSupabaseServerClient();
  const location = (await loadLocations(supabase, orgId)).find((l) => l.is_active && l.id === filters.location) ?? null;

  const { rows, error } = await collectPages(
    (offset, limit) =>
      supabase.rpc("stock_overview", {
        p_organization_id: orgId,
        p_location_id: location?.id ?? null,
        p_query: filters.q,
        p_low_only: filters.low,
        p_sort: filters.sort,
        p_limit: limit,
        p_offset: offset,
      }),
    200,
  );
  if (error) return exportFailed(context, "stock", error);
  return csvResponse(context, "stock", "stock", stockExportRows(rows, location?.name ?? fr.stock.overview.allLocations));
}

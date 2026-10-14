import { NextResponse, type NextRequest } from "next/server";
import { salesExportRows } from "@/lib/domain/exports";
import { collectPages, csvResponse, exportContext, exportFailed } from "@/lib/server/csv-export";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { salesFilters } from "@/lib/ui/list-filters";

/** Sales (or drafts) matching the Ventes list filters, all pages. */
export async function GET(request: NextRequest) {
  const context = await exportContext("sales.sell");
  if (context instanceof NextResponse) return context;
  const filters = salesFilters(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createSupabaseServerClient();
  const { rows, error } = await collectPages(
    (offset, limit) =>
      supabase.rpc("search_sales", {
        p_organization_id: context.membership.organizationId,
        p_status: filters.status,
        p_from: filters.from,
        p_to: filters.to,
        p_customer_id: filters.customer,
        p_due_only: filters.due,
        p_query: filters.q,
        p_sort: filters.sort,
        p_limit: limit,
        p_offset: offset,
      }),
    200,
  );
  if (error) return exportFailed(context, "sales", error);
  return csvResponse(context, "sales", filters.status === "draft" ? "ventes-brouillons" : "ventes", salesExportRows(rows, context.membership.timezone));
}

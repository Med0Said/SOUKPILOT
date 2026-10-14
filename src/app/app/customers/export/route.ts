import { NextResponse, type NextRequest } from "next/server";
import { customersExportRows } from "@/lib/domain/exports";
import { collectPages, csvResponse, exportContext, exportFailed } from "@/lib/server/csv-export";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { customerFilters } from "@/lib/ui/list-filters";

/** Customers matching the Clients list filters, with their balance. */
export async function GET(request: NextRequest) {
  const context = await exportContext("sales.sell");
  if (context instanceof NextResponse) return context;
  const filters = customerFilters(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createSupabaseServerClient();
  const { rows, error } = await collectPages(
    (offset, limit) =>
      supabase.rpc("search_customers", {
        p_organization_id: context.membership.organizationId,
        p_query: filters.q,
        p_due_only: filters.due,
        p_sort: filters.sort,
        p_limit: limit,
        p_offset: offset,
      }),
    200,
  );
  if (error) return exportFailed(context, "customers", error);
  return csvResponse(context, "customers", "clients", customersExportRows(rows, context.membership.timezone));
}

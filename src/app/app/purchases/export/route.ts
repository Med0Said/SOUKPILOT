import { NextResponse, type NextRequest } from "next/server";
import { purchaseOrdersExportRows } from "@/lib/domain/exports";
import { collectPages, csvResponse, exportContext, exportFailed } from "@/lib/server/csv-export";
import { purchaseOrdersQuery } from "@/lib/server/purchase-orders";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { purchaseFilters } from "@/lib/ui/list-filters";
import { fr } from "@/i18n/fr";

/** Purchase orders matching the Achats list filters (owner/manager). */
export async function GET(request: NextRequest) {
  const context = await exportContext("purchasing.manage");
  if (context instanceof NextResponse) return context;
  const filters = purchaseFilters(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createSupabaseServerClient();
  const { rows, error } = await collectPages(
    (offset, limit) => purchaseOrdersQuery(supabase, context.membership.organizationId, filters).range(offset, offset + limit - 1),
    500,
  );
  if (error) return exportFailed(context, "purchase_orders", error);
  return csvResponse(
    context,
    "purchase_orders",
    "commandes-fournisseurs",
    purchaseOrdersExportRows(
      rows.map((o) => ({ ...o, supplier: o.suppliers?.name ?? "" })),
      fr.purchases.status,
      context.membership.timezone,
    ),
  );
}

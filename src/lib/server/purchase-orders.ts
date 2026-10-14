import "server-only";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { OPEN_PO_STATUSES } from "@/lib/domain/purchasing";
import type { purchaseFilters } from "@/lib/ui/list-filters";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Purchase orders matching the Achats list filters (shared by the page and its export). */
export function purchaseOrdersQuery(supabase: Client, organizationId: string, filters: ReturnType<typeof purchaseFilters>) {
  let query = supabase
    .from("purchase_orders")
    .select("id, number, status, expected_date, ordered_total_millimes, created_at, suppliers ( name )", { count: "exact" })
    .eq("organization_id", organizationId);
  if (filters.view === "open") query = query.in("status", OPEN_PO_STATUSES);
  if (filters.supplier) query = query.eq("supplier_id", filters.supplier);
  switch (filters.sort) {
    case "oldest":
      return query.order("created_at", { ascending: true }).order("id");
    case "total_desc":
      return query.order("ordered_total_millimes", { ascending: false }).order("created_at", { ascending: false });
    case "expected":
      return query.order("expected_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
    default:
      return query.order("created_at", { ascending: false }).order("id");
  }
}

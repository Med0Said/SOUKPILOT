import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { must } from "@/lib/server/query";

/** Everything needed to display one finalized sale (RLS applies). */
export async function loadSale(supabase: SupabaseServerClient, organizationId: string, saleId: string) {
  const sale = must(await supabase
    .from("sales")
    .select("*, customers ( name, phone )")
    .eq("id", saleId)
    .eq("organization_id", organizationId)
    .maybeSingle(), "sales.detail_load_failed", { organizationId });
  if (!sale) return null;

  const [items, payments, returns, methods, location, org] = await Promise.all([
    supabase.from("sale_items").select("*").eq("sale_id", saleId).order("line_no"),
    supabase.from("sale_payments").select("*").eq("sale_id", saleId).order("created_at"),
    supabase.from("sale_returns").select("*").eq("sale_id", saleId).order("number"),
    supabase.from("payment_methods").select("id, label, kind, is_active").eq("organization_id", organizationId).order("sort_order"),
    supabase.from("locations").select("name").eq("id", sale.location_id).maybeSingle(),
    supabase.from("organizations").select("name").eq("id", organizationId).single(),
  ]);

  const fields = { organizationId };
  return {
    sale,
    items: must(items, "sales.items_load_failed", fields),
    payments: must(payments, "sales.payments_load_failed", fields),
    returns: must(returns, "sales.returns_load_failed", fields),
    methods: must(methods, "sales.methods_load_failed", fields),
    locationName: must(location, "sales.location_load_failed", fields)?.name ?? "",
    organizationName: must(org, "sales.organization_load_failed", fields).name,
  };
}

import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";

/** Everything needed to display one finalized sale (RLS applies). */
export async function loadSale(supabase: SupabaseServerClient, organizationId: string, saleId: string) {
  const { data: sale } = await supabase
    .from("sales")
    .select("*, customers ( name, phone )")
    .eq("id", saleId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!sale) return null;

  const [items, payments, returns, methods, location, org] = await Promise.all([
    supabase.from("sale_items").select("*").eq("sale_id", saleId).order("line_no"),
    supabase.from("sale_payments").select("*").eq("sale_id", saleId).order("created_at"),
    supabase.from("sale_returns").select("*").eq("sale_id", saleId).order("number"),
    supabase.from("payment_methods").select("id, label, kind, is_active").eq("organization_id", organizationId).order("sort_order"),
    supabase.from("locations").select("name").eq("id", sale.location_id).maybeSingle(),
    supabase.from("organizations").select("name").eq("id", organizationId).single(),
  ]);

  return {
    sale,
    items: items.data ?? [],
    payments: payments.data ?? [],
    returns: returns.data ?? [],
    methods: methods.data ?? [],
    locationName: location.data?.name ?? "",
    organizationName: org.data?.name ?? "",
  };
}

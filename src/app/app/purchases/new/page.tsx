import type { Metadata } from "next";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations, loadVariantInfo } from "@/lib/server/variants";
import { formatTndInput } from "@/lib/domain/money";
import { Alert, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { PurchaseOrderForm, type PoLine } from "../_components/purchase-order-form";

export const metadata: Metadata = { title: fr.purchases.form.title };

export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft: draftId } = await searchParams;
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  if (!hasPermission(context, "purchasing.manage")) return <Alert tone="error">{fr.catalog.forbidden}</Alert>;

  const supabase = await createSupabaseServerClient();
  const [locations, suppliers] = await Promise.all([
    loadLocations(supabase, orgId),
    supabase.from("suppliers").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("name"),
  ]);

  let draft: Parameters<typeof PurchaseOrderForm>[0]["draft"];
  if (draftId && /^[0-9a-f-]{36}$/i.test(draftId)) {
    const { data: po } = await supabase
      .from("purchase_orders")
      .select("id, status, supplier_id, location_id, expected_date, reference, note")
      .eq("id", draftId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (po?.status === "draft") {
      const { data: items } = await supabase
        .from("purchase_order_items")
        .select("variant_id, quantity, unit_cost_millimes")
        .eq("purchase_order_id", po.id)
        .order("line_no");
      const info = await loadVariantInfo(supabase, orgId, (items ?? []).map((i) => i.variant_id));
      draft = {
        id: po.id,
        supplierId: po.supplier_id,
        locationId: po.location_id,
        expectedDate: po.expected_date ?? "",
        reference: po.reference ?? "",
        note: po.note ?? "",
        lines: (items ?? []).map(
          (i): PoLine => ({
            variantId: i.variant_id,
            label: info.get(i.variant_id)?.label ?? "?",
            quantity: String(i.quantity),
            cost: formatTndInput(i.unit_cost_millimes),
          }),
        ),
      };
    }
  }

  return (
    <>
      <PageHeader title={draft ? fr.purchases.form.editTitle : fr.purchases.form.title} />
      <PurchaseOrderForm
        organizationId={orgId}
        suppliers={suppliers.data ?? []}
        locations={locations.filter((l) => l.is_active)}
        draft={draft}
      />
    </>
  );
}

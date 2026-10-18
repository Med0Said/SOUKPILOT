import type { Metadata } from "next";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations, loadVariantInfo } from "@/lib/server/variants";
import { formatTndInput } from "@/lib/domain/money";
import { Alert, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { CurrencyConverter } from "@/components/integrations/currency-converter";
import { enabledIntegrations } from "@/lib/server/integrations";
import { PurchaseOrderForm, type PoLine } from "../_components/purchase-order-form";
import { must } from "@/lib/server/query";
import { isUuid } from "@/lib/validation/ids";

export const metadata: Metadata = { title: fr.purchases.form.title };

export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft: draftId } = await searchParams;
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  if (!hasPermission(context, "purchasing.manage")) return <Alert tone="error">{fr.catalog.forbidden}</Alert>;

  const supabase = await createSupabaseServerClient();
  const [locations, suppliers, integrations] = await Promise.all([
    loadLocations(supabase, orgId),
    supabase.from("suppliers").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("name"),
    enabledIntegrations(orgId),
  ]);

  let draft: Parameters<typeof PurchaseOrderForm>[0]["draft"];
  if (draftId && isUuid(draftId)) {
    const po = must(await supabase
      .from("purchase_orders")
      .select("id, status, supplier_id, location_id, expected_date, reference, note")
      .eq("id", draftId)
      .eq("organization_id", orgId)
      .maybeSingle(), "purchases.draft_load_failed", { organizationId: orgId });
    if (po?.status === "draft") {
      const items = must(await supabase
        .from("purchase_order_items")
        .select("variant_id, quantity, unit_cost_millimes")
        .eq("purchase_order_id", po.id)
        .order("line_no"), "purchases.draft_items_load_failed", { organizationId: orgId });
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
      {integrations.has("exchange_rates") ? (
        <div className="mb-4">
          <CurrencyConverter organizationId={orgId} />
        </div>
      ) : null}
      <PurchaseOrderForm
        organizationId={orgId}
        suppliers={suppliers.data ?? []}
        locations={locations.filter((l) => l.is_active)}
        draft={draft}
      />
    </>
  );
}

import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations } from "@/lib/server/variants";
import { Alert, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { Cart, type CartLine } from "./cart";
import { formatBps } from "@/lib/domain/pricing";
import { must } from "@/lib/server/query";
import { isUuid } from "@/lib/validation/ids";

export const metadata: Metadata = { title: fr.sales.cart.title };

export default async function NewSalePage({ searchParams }: { searchParams: Promise<{ draft?: string; saved?: string }> }) {
  const { draft: draftId, saved } = await searchParams;
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const supabase = await createSupabaseServerClient();

  const [locations, methods, customers, org] = await Promise.all([
    loadLocations(supabase, orgId),
    supabase.from("payment_methods").select("id, label, kind").eq("organization_id", orgId).eq("is_active", true).order("sort_order"),
    supabase.from("customers").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("name").limit(1000),
    supabase.from("organizations").select("cashier_max_discount_bps").eq("id", orgId).single(),
  ]);

  let draft: Parameters<typeof Cart>[0]["draft"];
  if (draftId && isUuid(draftId)) {
    const sale = must(await supabase
      .from("sales")
      .select("id, status, location_id, customer_id, note, order_discount_millimes")
      .eq("id", draftId)
      .eq("organization_id", orgId)
      .maybeSingle(), "sales.draft_load_failed", { organizationId: orgId });
    if (sale?.status === "draft") {
      const items = must(await supabase
        .from("sale_items")
        .select("variant_id, product_name, variant_label, unit_price_millimes, quantity, discount_bps")
        .eq("sale_id", sale.id)
        .order("line_no"), "sales.draft_items_load_failed", { organizationId: orgId });
      draft = {
        saleId: sale.id,
        locationId: sale.location_id,
        customerId: sale.customer_id,
        note: sale.note ?? "",
        orderDiscount: sale.order_discount_millimes,
        lines: (items ?? []).map(
          (i): CartLine => ({
            variantId: i.variant_id,
            label: `${i.product_name} — ${i.variant_label || "Unique"}`,
            unitPriceMillimes: i.unit_price_millimes,
            available: null,
            quantity: String(i.quantity),
            discount: i.discount_bps ? formatBps(i.discount_bps).replace(" %", "") : "",
          }),
        ),
      };
    }
  }

  const activeLocations = locations.filter((l) => l.is_active);
  return (
    <>
      <PageHeader title={draft ? fr.sales.cart.draftTitle : fr.sales.cart.title} />
      {saved && draft ? (
        <div className="mb-4">
          <Alert tone="success">{fr.sales.cart.draftSaved}</Alert>
        </div>
      ) : null}
      {(methods.data ?? []).length === 0 ? (
        <Alert tone="error">{fr.sales.cart.noMethods}</Alert>
      ) : (
        <Cart
          organizationId={orgId}
          // One key per rendered cart: double taps and retries never create two sales.
          idempotencyKey={randomUUID()}
          locations={activeLocations}
          methods={methods.data ?? []}
          customers={customers.data ?? []}
          maxDiscountBps={context.membership.role === "cashier" ? (org.data?.cashier_max_discount_bps ?? 0) : null}
          draft={draft}
        />
      )}
    </>
  );
}

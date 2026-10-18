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

/** Customers listed in the cart's dropdown; beyond that the cart searches. */
const CUSTOMER_PRELOAD = 200;

export default async function NewSalePage({ searchParams }: { searchParams: Promise<{ draft?: string; saved?: string }> }) {
  const { draft: draftId, saved } = await searchParams;
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const supabase = await createSupabaseServerClient();

  const [locations, methods, customersResult, org] = await Promise.all([
    loadLocations(supabase, orgId),
    supabase.from("payment_methods").select("id, label, kind").eq("organization_id", orgId).eq("is_active", true).order("sort_order"),
    // Preload the first ones; beyond that the cart searches (CUSTOMER_PRELOAD).
    supabase
      .from("customers")
      .select("id, name", { count: "exact" })
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("name")
      .limit(CUSTOMER_PRELOAD),
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

  const customers = must(customersResult, "sales.cart_customers_load_failed", { organizationId: orgId });
  // A draft keeps its customer even when it is not among the preloaded ones.
  if (draft?.customerId && !customers.some((c) => c.id === draft.customerId)) {
    const own = must(
      await supabase.from("customers").select("id, name").eq("id", draft.customerId).eq("organization_id", orgId).maybeSingle(),
      "sales.draft_customer_load_failed",
      { organizationId: orgId },
    );
    if (own) customers.unshift(own);
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
          customers={customers}
          customerSearch={(customersResult.count ?? 0) > CUSTOMER_PRELOAD}
          maxDiscountBps={context.membership.role === "cashier" ? (org.data?.cashier_max_discount_bps ?? 0) : null}
          draft={draft}
        />
      )}
    </>
  );
}

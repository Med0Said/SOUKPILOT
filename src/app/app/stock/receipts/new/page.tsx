import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations } from "@/lib/server/variants";
import { Alert, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { StockDocumentForm } from "../../_components/stock-document-form";

export const metadata: Metadata = { title: fr.stock.receipts.newTitle };

export default async function NewReceiptPage() {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  if (!hasPermission(context, "stock.receive")) return <Alert tone="error">{fr.catalog.forbidden}</Alert>;

  const supabase = await createSupabaseServerClient();
  const [locations, suppliers] = await Promise.all([
    loadLocations(supabase, orgId),
    supabase.from("suppliers").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("name"),
  ]);
  return (
    <>
      <PageHeader title={fr.stock.receipts.newTitle} subtitle={fr.stock.receipts.newSubtitle} />
      <StockDocumentForm
        mode="receipt"
        organizationId={orgId}
        // One key per rendered form: a double submit or a retry returns the same receipt.
        idempotencyKey={randomUUID()}
        locations={locations.filter((l) => l.is_active)}
        suppliers={suppliers.data ?? []}
      />
    </>
  );
}

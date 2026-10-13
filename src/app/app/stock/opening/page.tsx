import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations } from "@/lib/server/variants";
import { Alert, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { StockDocumentForm } from "../_components/stock-document-form";

export const metadata: Metadata = { title: fr.stock.opening.title };

export default async function OpeningStockPage() {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  if (!hasPermission(context, "stock.receive")) return <Alert tone="error">{fr.catalog.forbidden}</Alert>;
  const supabase = await createSupabaseServerClient();
  const locations = await loadLocations(supabase, orgId);
  return (
    <>
      <PageHeader title={fr.stock.opening.title} subtitle={fr.stock.opening.subtitle} />
      <StockDocumentForm
        mode="opening"
        organizationId={orgId}
        idempotencyKey={randomUUID()}
        locations={locations.filter((l) => l.is_active)}
      />
    </>
  );
}

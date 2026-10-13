import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations } from "@/lib/server/variants";
import { PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { StockDocumentForm } from "../../_components/stock-document-form";

export const metadata: Metadata = { title: fr.stock.adjustments.newTitle };

export default async function NewAdjustmentPage() {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const supabase = await createSupabaseServerClient();
  const locations = await loadLocations(supabase, orgId);
  return (
    <>
      <PageHeader title={fr.stock.adjustments.newTitle} subtitle={fr.stock.adjustments.newSubtitle} />
      <StockDocumentForm
        mode="adjustment"
        organizationId={orgId}
        idempotencyKey={randomUUID()}
        locations={locations.filter((l) => l.is_active)}
      />
    </>
  );
}

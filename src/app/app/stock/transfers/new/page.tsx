import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations } from "@/lib/server/variants";
import { Alert, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { StockDocumentForm } from "../../_components/stock-document-form";

export const metadata: Metadata = { title: fr.stock.transfers.newTitle };

export default async function NewTransferPage() {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  if (!hasPermission(context, "stock.transfer")) return <Alert tone="error">{fr.catalog.forbidden}</Alert>;
  const supabase = await createSupabaseServerClient();
  const active = (await loadLocations(supabase, orgId)).filter((l) => l.is_active);
  return (
    <>
      <PageHeader title={fr.stock.transfers.newTitle} />
      {active.length < 2 ? (
        <Alert tone="info">{fr.stock.transfers.needTwo}</Alert>
      ) : (
        <StockDocumentForm mode="transfer" organizationId={orgId} idempotencyKey={randomUUID()} locations={active} />
      )}
    </>
  );
}

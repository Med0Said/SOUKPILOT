import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations } from "@/lib/server/variants";
import { documentNumber } from "@/lib/domain/stock";
import { formatDateTime } from "@/lib/format";
import { logger } from "@/lib/logger";
import { buttonClasses } from "@/components/ui/button";
import { Alert, EmptyState, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";

export const metadata: Metadata = { title: fr.stock.nav.receipts };

export default async function ReceiptsPage() {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const tz = context.membership.timezone;
  if (!hasPermission(context, "stock.receive")) return <Alert tone="error">{fr.catalog.forbidden}</Alert>;

  const supabase = await createSupabaseServerClient();
  const [receipts, locations, suppliers] = await Promise.all([
    supabase
      .from("stock_receipts")
      .select("id, number, location_id, supplier_id, reference, created_at")
      .eq("organization_id", orgId)
      .order("number", { ascending: false })
      .limit(100),
    loadLocations(supabase, orgId),
    supabase.from("suppliers").select("id, name").eq("organization_id", orgId),
  ]);
  if (receipts.error) logger.error("stock.receipts_load_failed", { organizationId: orgId, code: receipts.error.code });
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const supplierName = new Map((suppliers.data ?? []).map((s) => [s.id, s.name]));
  const rows = receipts.data ?? [];

  return (
    <>
      <PageHeader
        title={fr.stock.nav.receipts}
        actions={
          <Link href="/app/stock/receipts/new" className={buttonClasses("primary")}>
            {fr.stock.overview.receive}
          </Link>
        }
      />
      {rows.length === 0 ? <EmptyState title={fr.stock.receipts.empty} /> : null}
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/app/stock/receipts/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-background">
              <span>
                <span className="font-medium">{documentNumber("stock_receipt", r.number)}</span>
                <span className="block text-sm text-muted">
                  {[locationName.get(r.location_id), r.supplier_id ? supplierName.get(r.supplier_id) : null, r.reference]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="text-sm text-muted">{formatDateTime(r.created_at, tz)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

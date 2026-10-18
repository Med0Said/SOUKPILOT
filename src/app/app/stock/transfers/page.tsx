import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations, loadVariantInfo } from "@/lib/server/variants";
import { documentNumber } from "@/lib/domain/stock";
import { formatDateTime } from "@/lib/format";
import { buttonClasses } from "@/components/ui/button";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/list-controls";
import { listHref, pageCount, parsePage } from "@/lib/ui/list-params";
import { fr } from "@/i18n/fr";
import { must } from "@/lib/server/query";

export const metadata: Metadata = { title: fr.stock.nav.transfers };

const PAGE_SIZE = 30;

export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ created?: string; page?: string }> }) {
  const { created, page: rawPage } = await searchParams;
  const page = parsePage(rawPage);
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  if (!hasPermission(context, "stock.transfer")) return <Alert tone="error">{fr.catalog.forbidden}</Alert>;
  const t = fr.stock.transfers;

  const supabase = await createSupabaseServerClient();
  const [transfersResult, locations] = await Promise.all([
    supabase
      .from("stock_transfers")
      .select("id, number, from_location_id, to_location_id, note, created_at", { count: "exact" })
      .eq("organization_id", orgId)
      .order("number", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    loadLocations(supabase, orgId),
  ]);
  const transfers = must(transfersResult, "stock.transfers_load_failed", { organizationId: orgId });
  const pages = pageCount(transfersResult.count ?? 0, PAGE_SIZE);
  const ids = (transfers ?? []).map((tr) => tr.id);
  const lines = ids.length
    ? must(
        await supabase.from("stock_transfer_lines").select("transfer_id, variant_id, quantity").in("transfer_id", ids),
        "stock.transfer_lines_load_failed",
        { organizationId: orgId },
      )
    : [];
  const variants = await loadVariantInfo(supabase, orgId, (lines ?? []).map((l) => l.variant_id));
  const name = new Map(locations.map((l) => [l.id, l.name]));

  return (
    <>
      <PageHeader
        title={fr.stock.nav.transfers}
        actions={
          <Link href="/app/stock/transfers/new" className={buttonClasses("primary")}>
            {t.newTitle}
          </Link>
        }
      />
      <div className="space-y-3">
        {created ? <Alert tone="success">{t.created}</Alert> : null}
        {(transfers ?? []).length === 0 ? <EmptyState title={t.empty} /> : null}
        {(transfers ?? []).map((tr) => (
          <Card key={tr.id}>
            <p className="font-medium">
              {documentNumber("stock_transfer", tr.number)} · {name.get(tr.from_location_id)} → {name.get(tr.to_location_id)}
            </p>
            <p className="text-sm text-muted">{formatDateTime(tr.created_at, context.membership.timezone)}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {(lines ?? [])
                .filter((l) => l.transfer_id === tr.id)
                .map((l) => (
                  <li key={l.variant_id} className="flex justify-between gap-3">
                    <span className="truncate">{variants.get(l.variant_id)?.label ?? "?"}</span>
                    <span className="tabular-nums">{l.quantity}</span>
                  </li>
                ))}
            </ul>
            {tr.note ? <p className="mt-2 text-sm text-muted">{tr.note}</p> : null}
          </Card>
        ))}
        <Pagination page={page} pages={pages} href={(n) => listHref("/app/stock/transfers", { page: n })} />
      </div>
    </>
  );
}

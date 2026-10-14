import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatTnd } from "@/lib/domain/money";
import { formatDate } from "@/lib/format";
import { logger } from "@/lib/logger";
import { buttonClasses } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { OPEN_PO_STATUSES, poNumber, poStatusTone } from "@/lib/domain/purchasing";
import { fr } from "@/i18n/fr";

export const metadata: Metadata = { title: fr.nav.purchases };

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  if (!hasPermission(context, "purchasing.manage")) return <Alert tone="error">{fr.catalog.forbidden}</Alert>;
  const t = fr.purchases.list;
  const view = (await searchParams).view === "all" ? "all" : "open";

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("purchase_orders")
    .select("id, number, status, expected_date, ordered_total_millimes, created_at, suppliers ( name )")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (view === "open") query = query.in("status", OPEN_PO_STATUSES);
  const [{ data: orders, error }, { data: balances }] = await Promise.all([
    query,
    supabase.rpc("supplier_balances", { p_organization_id: orgId }),
  ]);
  if (error) logger.error("purchases.list_failed", { organizationId: orgId, code: error.code });
  const totalOwed = (balances ?? []).reduce((s, b) => s + Math.max(b.balance_millimes, 0), 0);

  return (
    <>
      <PageHeader
        title={fr.nav.purchases}
        subtitle={t.subtitle}
        actions={
          <Link href="/app/purchases/new" className={buttonClasses("primary")}>
            {t.new}
          </Link>
        }
      />
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              {t.owed} : <span className="font-semibold tabular-nums">{formatTnd(totalOwed)}</span>
            </p>
            <Link href="/app/suppliers" className="text-sm text-primary hover:underline">
              {t.seeSuppliers} →
            </Link>
          </div>
        </Card>
        <nav aria-label={t.filter} className="flex gap-2">
          <Link href="/app/purchases" aria-current={view === "open" ? "page" : undefined} className={buttonClasses(view === "open" ? "primary" : "secondary")}>
            {t.open}
          </Link>
          <Link
            href="/app/purchases?view=all"
            aria-current={view === "all" ? "page" : undefined}
            className={buttonClasses(view === "all" ? "primary" : "secondary")}
          >
            {t.all}
          </Link>
        </nav>
        {(orders ?? []).length === 0 ? <EmptyState title={t.empty} /> : null}
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {(orders ?? []).map((o) => (
            <li key={o.id}>
              <Link href={`/app/purchases/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-background">
                <span>
                  <span className="font-medium">{poNumber(o.number, fr.purchases.draft)}</span>
                  <span className="block text-sm text-muted">
                    {o.suppliers?.name}
                    {o.expected_date ? ` · ${t.expected(formatDate(`${o.expected_date}T12:00:00Z`, "UTC"))}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={poStatusTone(o.status)}>{fr.purchases.status[o.status]}</Badge>
                  <span className="font-semibold tabular-nums">{formatTnd(o.ordered_total_millimes)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

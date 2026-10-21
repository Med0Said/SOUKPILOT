import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatTnd } from "@/lib/domain/money";
import { formatCalendarDay } from "@/lib/format";
import { logger } from "@/lib/logger";
import { buttonClasses } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { poNumber, poStatusTone } from "@/lib/domain/purchasing";
import { ListSummary, Pagination, SortSelect } from "@/components/ui/list-controls";
import { SavedViews } from "@/components/ui/saved-views";
import { PURCHASE_DEFAULTS, canonical, purchaseFilters } from "@/lib/ui/list-filters";
import { listHref, pageCount } from "@/lib/ui/list-params";
import { purchaseOrdersQuery } from "@/lib/server/purchase-orders";
import { fr } from "@/i18n/fr";
import { must } from "@/lib/server/query";

const PAGE_SIZE = 30;

export const metadata: Metadata = { title: fr.nav.purchases };

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; supplier?: string; sort?: string; page?: string }>;
}) {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  if (!hasPermission(context, "purchasing.manage")) return <Alert tone="error">{fr.catalog.forbidden}</Alert>;
  const t = fr.purchases.list;
  const filters = purchaseFilters(await searchParams);
  const { view, sort, page } = filters;

  const supabase = await createSupabaseServerClient();
  const query = purchaseOrdersQuery(supabase, orgId, filters).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const [{ data: orders, error, count }, balancesResult, suppliersResult] = await Promise.all([
    query,
    supabase.rpc("supplier_balances", { p_organization_id: orgId }),
    supabase.from("suppliers").select("id, name").eq("organization_id", orgId).order("name"),
  ]);
  const balances = must(balancesResult, "purchases.balances_load_failed", { organizationId: orgId });
  const suppliers = must(suppliersResult, "purchases.suppliers_load_failed", { organizationId: orgId });
  const total = count ?? 0;
  const listParams = { ...filters, view: view === "all" ? view : null, sort: sort === "recent" ? null : sort };
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
        <form method="get" className="grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          {view === "all" ? <input type="hidden" name="view" value="all" /> : null}
          <div>
            <label htmlFor="supplier" className="mb-1.5 block text-sm font-medium">
              {fr.lists.purchases.supplier}
            </label>
            <select
              id="supplier"
              name="supplier"
              defaultValue={filters.supplier ?? ""}
              className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
            >
              <option value="">{fr.lists.purchases.allSuppliers}</option>
              {(suppliers ?? []).map((sup) => (
                <option key={sup.id} value={sup.id}>
                  {sup.name}
                </option>
              ))}
            </select>
          </div>
          <SortSelect value={sort} options={fr.lists.sorts.purchases} />
          <button type="submit" className={buttonClasses("secondary")}>
            {fr.lists.filter}
          </button>
        </form>
        <SavedViews organizationId={orgId} list="purchases" basePath="/app/purchases" currentQuery={canonical(filters, PURCHASE_DEFAULTS)} />
        {(orders ?? []).length === 0 ? <EmptyState title={t.empty} /> : null}
        {total > 0 ? <ListSummary total={total} exportHref={listHref("/app/purchases/export", { ...listParams, page: null })} /> : null}
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {(orders ?? []).map((o) => (
            <li key={o.id}>
              <Link href={`/app/purchases/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-background">
                <span>
                  <span className="font-medium">{poNumber(o.number, fr.purchases.draft)}</span>
                  <span className="block text-sm text-muted">
                    {o.suppliers?.name}
                    {o.expected_date ? ` · ${t.expected(formatCalendarDay(o.expected_date))}` : ""}
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
        <Pagination page={page} pages={pageCount(total, PAGE_SIZE)} href={(n) => listHref("/app/purchases", { ...listParams, page: n })} />
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatTnd } from "@/lib/domain/money";
import { formatDateTime } from "@/lib/format";
import { logger } from "@/lib/logger";
import { buttonClasses } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { ListSummary, Pagination, SortSelect } from "@/components/ui/list-controls";
import { SavedViews } from "@/components/ui/saved-views";
import { SALES_DEFAULTS, canonical, salesFilters } from "@/lib/ui/list-filters";
import { listHref, pageCount, parseDay, todayIn } from "@/lib/ui/list-params";
import { fr } from "@/i18n/fr";

const PAGE_SIZE = 30;

export const metadata: Metadata = { title: fr.nav.sales };

type Summary = {
  sales_count: number;
  gross_millimes: number;
  discount_millimes: number;
  sales_total_millimes: number;
  returns_count: number;
  returns_millimes: number;
  net_sales_millimes: number;
  credit_given_millimes: number;
  payments: { method_id: string; label: string; received_millimes: number; refunded_millimes: number; net_millimes: number }[];
};

type Params = { day?: string; status?: string; q?: string; from?: string; to?: string; customer?: string; due?: string; sort?: string; page?: string };

export default async function SalesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const context = await requireOrgContext();
  const { organizationId: orgId, timezone: tz } = context.membership;
  const t = fr.sales.list;
  const params = await searchParams;
  const day = parseDay(params.day) ?? todayIn(tz);
  const filters = salesFilters(params);
  const { status, page, sort } = filters;

  const supabase = await createSupabaseServerClient();
  const [{ data: summaryRaw, error: summaryError }, { data: sales, error }] = await Promise.all([
    supabase.rpc("sales_daily_summary", { p_organization_id: orgId, p_day: day }),
    supabase.rpc("search_sales", {
      p_organization_id: orgId,
      p_status: status,
      p_from: filters.from,
      p_to: filters.to,
      p_customer_id: filters.customer,
      p_due_only: filters.due,
      p_query: filters.q,
      p_sort: sort,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
  ]);
  const total = sales?.[0]?.total_count ?? 0;
  const pages = pageCount(total, PAGE_SIZE);
  const listParams = { ...filters, status: status === "draft" ? status : null, day: params.day ? day : null, sort: sort === "recent" ? null : sort };
  if (error || summaryError) logger.error("sales.list_failed", { organizationId: orgId, code: (error ?? summaryError)?.code });
  const summary = summaryRaw as Summary | null;

  return (
    <>
      <PageHeader
        title={fr.nav.sales}
        actions={
          <Link href="/app/sales/new" className={buttonClasses("primary")}>
            {t.newSale}
          </Link>
        }
      />
      <div className="space-y-4">
        <Card>
          <form method="get" className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-semibold">{t.dayTitle}</h2>
            <div className="flex items-end gap-2">
              <label htmlFor="day" className="sr-only">
                {t.day}
              </label>
              <input
                id="day"
                name="day"
                type="date"
                defaultValue={day}
                className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base"
              />
              <button type="submit" className={buttonClasses("secondary")}>
                {t.show}
              </button>
            </div>
          </form>
          {summary ? (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Stat label={t.count} value={String(summary.sales_count)} />
                <Stat label={t.salesTotal} value={formatTnd(summary.sales_total_millimes)} />
                <Stat label={t.returns} value={formatTnd(summary.returns_millimes)} />
                <Stat label={t.net} value={formatTnd(summary.net_sales_millimes)} strong />
              </dl>
              <h3 className="mb-2 mt-4 text-sm font-semibold">{t.byMethod}</h3>
              {summary.payments.length === 0 ? <p className="text-sm text-muted">{t.noPayments}</p> : null}
              <ul className="space-y-1 text-sm">
                {summary.payments.map((p) => (
                  <li key={p.method_id} className="flex justify-between gap-3">
                    <span>{p.label}</span>
                    <span className="tabular-nums">
                      {formatTnd(p.net_millimes)}
                      {p.refunded_millimes > 0 ? (
                        <span className="text-muted"> ({t.refunded(formatTnd(p.refunded_millimes))})</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              {summary.credit_given_millimes > 0 ? (
                <p className="mt-2 text-sm text-muted">{t.credit(formatTnd(summary.credit_given_millimes))}</p>
              ) : null}
              <p className="mt-3 text-xs text-muted">{t.definitions}</p>
            </>
          ) : null}
        </Card>

        <nav aria-label={t.filter} className="flex gap-2">
          <Link
            href="/app/sales"
            aria-current={status === "finalized" ? "page" : undefined}
            className={buttonClasses(status === "finalized" ? "primary" : "secondary")}
          >
            {t.finalized}
          </Link>
          <Link
            href="/app/sales?status=draft"
            aria-current={status === "draft" ? "page" : undefined}
            className={buttonClasses(status === "draft" ? "primary" : "secondary")}
          >
            {t.drafts}
          </Link>
        </nav>

        <form role="search" method="get" className="grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_10rem_12rem_auto_auto] lg:items-end">
          {status === "draft" ? <input type="hidden" name="status" value="draft" /> : null}
          {filters.customer ? <input type="hidden" name="customer" value={filters.customer} /> : null}
          <div>
            <label htmlFor="sales-q" className="mb-1.5 block text-sm font-medium">
              {fr.catalog.searchLabel}
            </label>
            <input
              id="sales-q"
              name="q"
              type="search"
              defaultValue={filters.q}
              placeholder={fr.lists.sales.search}
              autoComplete="off"
              className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
            />
          </div>
          <div>
            <label htmlFor="sales-from" className="mb-1.5 block text-sm font-medium">
              {fr.lists.sales.from}
            </label>
            <input id="sales-from" name="from" type="date" defaultValue={filters.from ?? ""} className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3" />
          </div>
          <div>
            <label htmlFor="sales-to" className="mb-1.5 block text-sm font-medium">
              {fr.lists.sales.to}
            </label>
            <input id="sales-to" name="to" type="date" defaultValue={filters.to ?? ""} className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3" />
          </div>
          <SortSelect value={sort} options={fr.lists.sorts.sales} />
          {status === "finalized" ? (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="due" value="1" defaultChecked={filters.due} className="size-6" />
              {fr.lists.sales.dueOnly}
            </label>
          ) : (
            <span />
          )}
          <button type="submit" className={buttonClasses("secondary")}>
            {fr.lists.filter}
          </button>
        </form>

        <SavedViews organizationId={orgId} list="sales" basePath="/app/sales" currentQuery={canonical(filters, SALES_DEFAULTS)} />

        {error ? <p className="text-sm text-danger">{fr.common.unexpectedError}</p> : null}
        {!error && (sales ?? []).length === 0 ? <EmptyState title={status === "draft" ? t.noDrafts : t.empty} /> : null}
        {(sales ?? []).length > 0 ? (
          <div>
            <ListSummary total={total} exportHref={listHref("/app/sales/export", { ...listParams, day: null, page: null })} />
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {(sales ?? []).map((s) => (
                <li key={s.sale_id}>
                  <Link
                    href={s.status === "draft" ? `/app/sales/new?draft=${s.sale_id}` : `/app/sales/${s.sale_id}`}
                    className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-background"
                  >
                    <span>
                      <span className="font-medium">{s.number ? fr.sales.number(s.number) : t.draft}</span>
                      <span className="block text-sm text-muted">
                        {formatDateTime(s.finalized_at ?? s.created_at, tz)}
                        {s.customer_name ? ` · ${s.customer_name}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {s.returned_millimes > 0 ? <Badge>{t.returned}</Badge> : null}
                      {s.status === "finalized" && s.due_millimes > 0 ? <Badge tone="warning">{t.due(formatTnd(s.due_millimes))}</Badge> : null}
                      <span className="font-semibold tabular-nums">{formatTnd(s.total_millimes)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={page} pages={pages} href={(n) => listHref("/app/sales", { ...listParams, page: n })} />
          </div>
        ) : null}
      </div>
    </>
  );
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-lg font-semibold" : "font-medium"}`}>{value}</dd>
    </div>
  );
}

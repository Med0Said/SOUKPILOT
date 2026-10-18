import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations } from "@/lib/server/variants";
import { formatTnd } from "@/lib/domain/money";
import { variantLabel } from "@/lib/domain/catalog";
import { logger } from "@/lib/logger";
import { buttonClasses } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { ListSummary, Pagination, SortSelect } from "@/components/ui/list-controls";
import { SavedViews } from "@/components/ui/saved-views";
import { STOCK_DEFAULTS, canonical, stockFilters } from "@/lib/ui/list-filters";
import { listHref, pageCount } from "@/lib/ui/list-params";
import { fr } from "@/i18n/fr";

export const metadata: Metadata = { title: fr.nav.stock };

const PAGE_SIZE = 50;
type SearchParams = { q?: string; location?: string; low?: string; sort?: string; page?: string; done?: string };

export default async function StockOverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const t = fr.stock.overview;
  const params = await searchParams;
  const parsed = stockFilters(params);
  const { q, low: lowOnly, sort, page } = parsed;

  const supabase = await createSupabaseServerClient();
  const locations = await loadLocations(supabase, orgId);
  const activeLocations = locations.filter((l) => l.is_active);
  const locationId = activeLocations.some((l) => l.id === parsed.location) ? parsed.location : null;
  const filters = { ...parsed, location: locationId };
  const canValue = hasPermission(context, "stock.valuation");

  const [overview, valuation] = await Promise.all([
    supabase.rpc("stock_overview", {
      p_organization_id: orgId,
      p_location_id: locationId,
      p_query: q,
      p_low_only: lowOnly,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
      p_sort: sort,
    }),
    canValue ? supabase.rpc("stock_valuation", { p_organization_id: orgId, p_location_id: locationId }) : null,
  ]);
  if (overview.error) logger.error("stock.overview_failed", { organizationId: orgId, code: overview.error.code });
  const rows = overview.data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const pages = pageCount(total, PAGE_SIZE);
  const v = valuation?.data?.[0];

  const pageHref = (n: number) => listHref("/app/stock", { ...filters, page: n, sort: sort === "name" ? null : sort });

  return (
    <>
      <PageHeader
        title={fr.nav.stock}
        subtitle={t.subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            {hasPermission(context, "stock.receive") ? (
              <>
                <Link href="/app/stock/receipts/new" className={buttonClasses("primary")}>
                  {t.receive}
                </Link>
                <Link href="/app/stock/opening" className={buttonClasses("secondary")}>
                  {t.opening}
                </Link>
              </>
            ) : null}
            <Link href="/app/stock/adjustments/new" className={buttonClasses("secondary")}>
              {t.adjust}
            </Link>
          </div>
        }
      />
      <div className="space-y-4">
        {params.done === "opening" ? <Alert tone="success">{t.openingDone}</Alert> : null}

        {v ? (
          <Card>
            <h2 className="mb-2 font-semibold">{t.valuationTitle}</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">{t.units}</dt>
                <dd className="text-lg font-semibold tabular-nums">{v.total_quantity}</dd>
              </div>
              <div>
                <dt className="text-muted">{t.value}</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatTnd(v.total_value_millimes)}</dd>
              </div>
              <div>
                <dt className="text-muted">{t.withoutCost}</dt>
                <dd className="text-lg font-semibold tabular-nums">{v.variants_without_cost}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted">{t.valuationHelp}</p>
          </Card>
        ) : null}

        <form role="search" method="get" className="grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-[1fr_12rem_12rem_auto_auto] sm:items-end">
          <div>
            <label htmlFor="q" className="mb-1.5 block text-sm font-medium">
              {fr.catalog.searchLabel}
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder={fr.catalog.searchPlaceholder}
              autoComplete="off"
              className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
            />
          </div>
          <div>
            <label htmlFor="location" className="mb-1.5 block text-sm font-medium">
              {t.location}
            </label>
            <select
              id="location"
              name="location"
              defaultValue={locationId ?? ""}
              className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
            >
              <option value="">{t.allLocations}</option>
              {activeLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <SortSelect value={sort} options={fr.lists.sorts.stock} />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="low" value="1" defaultChecked={lowOnly} className="size-6" />
            {t.lowOnly}
          </label>
          <button type="submit" className={buttonClasses("secondary")}>
            {fr.catalog.searchButton}
          </button>
        </form>

        <SavedViews organizationId={orgId} list="stock" basePath="/app/stock" currentQuery={canonical(filters, STOCK_DEFAULTS)} />

        {overview.error ? <Alert tone="error">{fr.common.unexpectedError}</Alert> : null}
        {!overview.error && rows.length === 0 ? (
          <EmptyState title={q || lowOnly ? t.noResults : t.empty}>{!q && !lowOnly ? t.emptyHelp : null}</EmptyState>
        ) : null}

        {rows.length > 0 ? <ListSummary total={total} exportHref={listHref("/app/stock/export", { ...filters, page: null })} /> : null}
        {rows.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {rows.map((r) => (
              <li key={r.variant_id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link href={`/app/catalog/${r.product_id}`} className="block truncate font-medium hover:underline">
                    {r.product_name}
                  </Link>
                  <p className="truncate text-sm text-muted">
                    {variantLabel(r.option_values)}
                    {r.sku ? ` · ${r.sku}` : ""}
                    {r.low_stock_threshold !== null ? ` · ${t.threshold(r.low_stock_threshold)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.is_low ? <Badge tone="warning">{t.low}</Badge> : null}
                  <Link
                    href={`/app/stock/movements?variant=${r.variant_id}`}
                    className="min-w-12 text-end text-lg font-semibold tabular-nums hover:underline"
                    aria-label={t.historyFor(r.product_name)}
                  >
                    {r.quantity}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <Pagination page={page} pages={pages} href={pageHref} />
      </div>
    </>
  );
}

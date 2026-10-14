import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatTnd } from "@/lib/domain/money";
import { logger } from "@/lib/logger";
import { buttonClasses } from "@/components/ui/button";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/layout";
import { ListSummary, Pagination, SortSelect } from "@/components/ui/list-controls";
import { SavedViews } from "@/components/ui/saved-views";
import { CATALOG_DEFAULTS, canonical, catalogFilters, type SearchParams } from "@/lib/ui/list-filters";
import { listHref, pageCount } from "@/lib/ui/list-params";
import { fr } from "@/i18n/fr";

export const metadata: Metadata = { title: fr.nav.catalog };

const PAGE_SIZE = 30;

function priceRange(min: number | null, max: number | null): string {
  if (min === null || max === null) return "—";
  return min === max ? formatTnd(min) : `${formatTnd(min)} – ${formatTnd(max)}`;
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const canManage = hasPermission(context, "catalog.manage");
  const t = fr.catalog;

  const filters = catalogFilters(await searchParams);
  const { q, category: categoryId, inactive: includeInactive, sort, page } = filters;

  const supabase = await createSupabaseServerClient();
  const [productsResult, categoriesResult] = await Promise.all([
    supabase.rpc("search_products", {
      p_organization_id: orgId,
      p_query: q,
      p_category_id: categoryId,
      p_include_inactive: includeInactive,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
      p_sort: sort,
    }),
    supabase.from("categories").select("id, name").eq("organization_id", orgId).order("name"),
  ]);
  if (productsResult.error) logger.error("catalog.search_failed", { organizationId: orgId, code: productsResult.error.code });

  const products = productsResult.data ?? [];
  const total = products[0]?.total_count ?? 0;
  const pages = pageCount(total, PAGE_SIZE);
  const current = canonical(filters, CATALOG_DEFAULTS);
  const pageHref = (n: number) => listHref("/app/catalog", { ...filters, page: n, sort: sort === "name" ? null : sort });

  return (
    <>
      <PageHeader
        title={fr.nav.catalog}
        subtitle={t.subtitle}
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Link href="/app/catalog/new" className={buttonClasses("primary")}>
                {t.newProduct}
              </Link>
              <Link href="/app/catalog/import" className={buttonClasses("secondary")}>
                {t.import}
              </Link>
              <Link href="/app/catalog/categories" className={buttonClasses("secondary")}>
                {t.categories}
              </Link>
            </div>
          ) : null
        }
      />

      <form role="search" method="get" className="mb-4 grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-[1fr_12rem_12rem_auto_auto] sm:items-end">
        <div>
          <label htmlFor="q" className="mb-1.5 block text-sm font-medium">
            {t.searchLabel}
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t.searchPlaceholder}
            autoComplete="off"
            className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
          />
        </div>
        <div>
          <label htmlFor="category" className="mb-1.5 block text-sm font-medium">
            {t.category}
          </label>
          <select
            id="category"
            name="category"
            defaultValue={categoryId ?? ""}
            className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
          >
            <option value="">{t.allCategories}</option>
            {(categoriesResult.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <SortSelect value={sort} options={fr.lists.sorts.catalog} />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="inactive" value="1" defaultChecked={includeInactive} className="size-5" />
          {t.showInactive}
        </label>
        <button type="submit" className={buttonClasses("secondary")}>
          {t.searchButton}
        </button>
      </form>

      <SavedViews organizationId={orgId} list="catalog" basePath="/app/catalog" currentQuery={current} />

      {productsResult.error ? <Alert tone="error">{fr.common.unexpectedError}</Alert> : null}

      {!productsResult.error && products.length === 0 ? (
        <EmptyState title={q || categoryId ? t.noResults : t.empty}>
          {!q && !categoryId && canManage ? t.emptyHelp : null}
        </EmptyState>
      ) : null}

      {products.length > 0 ? (
        <>
          <ListSummary total={total} exportHref={listHref("/app/catalog/export", { ...filters, page: null })} />
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {products.map((p) => (
              <li key={p.product_id}>
                <Link
                  href={`/app/catalog/${p.product_id}`}
                  className="flex flex-col gap-1 p-4 hover:bg-background sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block text-sm text-muted">
                      {p.category_name ?? t.noCategory} · {t.variantCount(p.variant_count)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-sm">
                    {!p.is_active ? <Badge>{fr.settings.inactive}</Badge> : null}
                    {!p.track_stock ? <Badge>{t.notTracked}</Badge> : null}
                    <span className="font-medium tabular-nums">{priceRange(p.min_price_millimes, p.max_price_millimes)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={page} pages={pages} href={pageHref} />
        </>
      ) : null}
    </>
  );
}

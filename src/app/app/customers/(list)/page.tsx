import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatTnd } from "@/lib/domain/money";
import { logger } from "@/lib/logger";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { buttonClasses } from "@/components/ui/button";
import { ListSummary, Pagination, SortSelect } from "@/components/ui/list-controls";
import { SavedViews } from "@/components/ui/saved-views";
import { CUSTOMER_DEFAULTS, canonical, customerFilters } from "@/lib/ui/list-filters";
import { listHref, pageCount } from "@/lib/ui/list-params";
import { fr } from "@/i18n/fr";

const PAGE_SIZE = 30;
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: fr.nav.customers };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; due?: string; sort?: string; page?: string }> }) {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const filters = customerFilters(await searchParams);
  const { q, sort, page } = filters;
  const t = fr.customers;

  const supabase = await createSupabaseServerClient();
  const [{ data: customers, error }, { data: balances }] = await Promise.all([
    supabase.rpc("search_customers", {
      p_organization_id: orgId,
      p_query: q,
      p_due_only: filters.due,
      p_sort: sort,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase.rpc("customer_balances", { p_organization_id: orgId }),
  ]);
  if (error) logger.error("customers.load_failed", { organizationId: orgId, code: error.code });
  const total = customers?.[0]?.total_count ?? 0;
  const listParams = { ...filters, sort: sort === "name" ? null : sort };
  const totalDue = (balances ?? []).reduce((s, b) => s + Math.max(b.balance_millimes, 0), 0);

  return (
    <>
      <PageHeader title={fr.nav.customers} subtitle={t.subtitle} />
      <div className="space-y-4">
        {totalDue > 0 ? (
          <Card>
            <p className="text-sm">
              {t.totalDue} : <span className="font-semibold tabular-nums">{formatTnd(totalDue)}</span>
            </p>
          </Card>
        ) : null}
        <Card>
          <h2 className="mb-3 font-semibold">{t.add}</h2>
          <CustomerForm organizationId={orgId} />
        </Card>
        <form method="get" role="search" className="grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-[1fr_12rem_auto_auto] sm:items-end">
          <div>
            <label htmlFor="q" className="mb-1.5 block text-sm font-medium">
              {fr.catalog.searchLabel}
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder={t.search}
              autoComplete="off"
              className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
            />
          </div>
          <SortSelect value={sort} options={fr.lists.sorts.customers} />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="due" value="1" defaultChecked={filters.due} className="size-5" />
            {fr.lists.customers.dueOnly}
          </label>
          <button type="submit" className={buttonClasses("secondary")}>
            {fr.lists.filter}
          </button>
        </form>
        <SavedViews organizationId={orgId} list="customers" basePath="/app/customers" currentQuery={canonical(filters, CUSTOMER_DEFAULTS)} />
        {(customers ?? []).length === 0 ? <EmptyState title={t.empty} /> : null}
        {total > 0 ? <ListSummary total={total} exportHref={listHref("/app/customers/export", { ...listParams, page: null })} /> : null}
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {(customers ?? []).map((c) => {
            const b = c.balance_millimes;
            return (
              <li key={c.customer_id}>
                <Link href={`/app/customers/${c.customer_id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-background">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block text-sm text-muted">{c.phone ?? "—"}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {!c.is_active ? <Badge>{fr.settings.inactive}</Badge> : null}
                    {b > 0 ? <Badge tone="warning">{t.owes(formatTnd(b))}</Badge> : null}
                    {b < 0 ? <Badge>{t.credit(formatTnd(-b))}</Badge> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <Pagination page={page} pages={pageCount(total, PAGE_SIZE)} href={(n) => listHref("/app/customers", { ...listParams, page: n })} />
      </div>
    </>
  );
}

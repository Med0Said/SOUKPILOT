import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ClipboardCheck, PackageSearch, Truck, UserRound, Wallet } from "lucide-react";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { variantLabel } from "@/lib/domain/catalog";
import { formatTnd } from "@/lib/domain/money";
import { percentChange, sumDays } from "@/lib/domain/reports";
import { formatCalendarDay } from "@/lib/format";
import { addDays, todayIn } from "@/lib/ui/list-params";
import { logger } from "@/lib/logger";
import { buttonClasses } from "@/components/ui/button";
import { Badge, Card, PageHeader, Stat } from "@/components/ui/layout";
import { BarChart } from "@/components/charts/bar-chart";
import { fr } from "@/i18n/fr";

export const metadata: Metadata = { title: fr.nav.dashboard };

type Summary = {
  sales_count: number;
  net_sales_millimes: number;
  payments: { net_millimes: number }[];
};

type Attention = {
  pending_adjustments: number;
  submitted_counts: number;
  late_purchase_orders: number;
  customers_owing: number;
  customer_credit_millimes: number;
};

/**
 * Dashboard per role. Live data only — never placeholder numbers.
 * Owners and managers: today, the last 7 days (with costs, so restricted) and
 * what needs attention. Cashiers: today, their drafts, low stock.
 */
export default async function DashboardPage() {
  const context = await requireOrgContext();
  const { membership, user } = context;
  const orgId = membership.organizationId;
  const t = fr.dashboard;
  const manager = hasPermission(context, "reports.view");
  const today = todayIn(membership.timezone);
  const supabase = await createSupabaseServerClient();

  const [summary, low, week, attention, suppliers, drafts] = await Promise.all([
    supabase.rpc("sales_daily_summary", { p_organization_id: orgId, p_day: today }),
    supabase.rpc("stock_overview", { p_organization_id: orgId, p_low_only: true, p_limit: 6, p_sort: "quantity_asc" }),
    manager ? supabase.rpc("report_sales_by_day", { p_organization_id: orgId, p_from: addDays(today, -13), p_to: today }) : null,
    manager ? supabase.rpc("dashboard_attention", { p_organization_id: orgId }) : null,
    hasPermission(context, "purchasing.manage") ? supabase.rpc("supplier_balances", { p_organization_id: orgId }) : null,
    supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "draft")
      .eq("created_by", user.id),
  ]);
  for (const r of [summary, low, week, attention, suppliers, drafts]) {
    if (r?.error) logger.error("dashboard.load_failed", { organizationId: orgId, code: r.error.code });
  }

  const day = summary.data as Summary | null;
  const collected = (day?.payments ?? []).reduce((s, p) => s + p.net_millimes, 0);
  const lowRows = low.data ?? [];
  const lowTotal = lowRows[0]?.total_count ?? 0;
  const weekDays = week?.data ?? [];
  const last7 = weekDays.slice(7);
  const thisWeek = sumDays(last7);
  const previousWeek = sumDays(weekDays.slice(0, 7));
  const change = percentChange(thisWeek.net_sales_millimes, previousWeek.net_sales_millimes);
  const a = (attention?.data ?? null) as Attention | null;
  const supplierOwed = (suppliers?.data ?? []).reduce((s, b) => s + Math.max(b.balance_millimes, 0), 0);

  const todo: { key: string; icon: typeof AlertTriangle; text: string; href: string }[] = [];
  if (a) {
    if (a.pending_adjustments > 0) todo.push({ key: "adj", icon: ClipboardCheck, text: t.pendingAdjustments(a.pending_adjustments), href: "/app/stock/adjustments" });
    if (a.submitted_counts > 0) todo.push({ key: "count", icon: ClipboardCheck, text: t.submittedCounts(a.submitted_counts), href: "/app/stock/counts" });
    if (a.late_purchase_orders > 0) todo.push({ key: "po", icon: Truck, text: t.latePurchaseOrders(a.late_purchase_orders), href: "/app/purchases" });
    if (a.customers_owing > 0)
      todo.push({ key: "cust", icon: UserRound, text: t.customersOwing(a.customers_owing, formatTnd(a.customer_credit_millimes)), href: "/app/customers" });
  }
  if (supplierOwed > 0) todo.push({ key: "sup", icon: Wallet, text: t.suppliersOwed(formatTnd(supplierOwed)), href: "/app/suppliers" });
  if (lowTotal > 0) todo.push({ key: "low", icon: PackageSearch, text: t.lowStock(lowTotal), href: "/app/stock?low=1" });

  return (
    <>
      <PageHeader title={`${t.welcome} — ${membership.organizationName}`} subtitle={t.intro} />
      <div className="space-y-4">
        <section aria-labelledby="today-title">
          <h2 id="today-title" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            {t.today} · {formatCalendarDay(today)}
          </h2>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t.salesToday} value={String(day?.sales_count ?? 0)} />
            <Stat label={t.netToday} value={formatTnd(day?.net_sales_millimes ?? 0)} strong />
            <Stat label={t.collectedToday} value={formatTnd(collected)} />
            <Stat
              label={t.basketToday}
              value={day && day.sales_count > 0 ? formatTnd(Math.round(day.net_sales_millimes / day.sales_count)) : "—"}
            />
          </dl>
        </section>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/sales/new" className={buttonClasses("primary")}>
            {fr.sales.list.newSale}
          </Link>
          {drafts.count ? (
            <Link href="/app/sales?status=draft" className={buttonClasses("secondary")}>
              {t.myDrafts(drafts.count)}
            </Link>
          ) : null}
          {manager ? (
            <Link href="/app/reports" className={buttonClasses("secondary")}>
              {t.seeReports}
            </Link>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {manager && week && !week.error ? (
            <Card>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">{t.last7}</h2>
                <span className="text-lg font-semibold tabular-nums">{formatTnd(thisWeek.net_sales_millimes)}</span>
              </div>
              <p className={`mb-2 text-xs ${change === null ? "text-muted" : change >= 0 ? "text-success" : "text-danger"}`}>
                {change === null ? fr.reports.noComparison : `${change > 0 ? "+" : ""}${change.toLocaleString("fr-TN")} % ${t.vsPrevious7}`}
              </p>
              <BarChart
                points={last7.map((d) => ({ label: formatCalendarDay(d.day), shortLabel: formatCalendarDay(d.day, true), value: d.net_sales_millimes }))}
                label={(max) => fr.reports.chartLabel(formatCalendarDay(last7[0]?.day ?? today), formatCalendarDay(today), max)}
                formatValue={formatTnd}
                tableCaption={t.last7}
                columnLabel={fr.reports.day}
                valueLabel={fr.reports.kpi.net}
                showTable={fr.reports.showTable}
              />
            </Card>
          ) : null}

          {manager ? (
            <Card>
              <h2 className="mb-3 font-semibold">{t.attention}</h2>
              {todo.length === 0 ? <p className="text-sm text-muted">{t.nothingPending}</p> : null}
              <ul className="space-y-1">
                {todo.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-background">
                      <item.icon aria-hidden="true" className="size-4 shrink-0 text-warning" />
                      <span className="flex-1">{item.text}</span>
                      <ArrowRight aria-hidden="true" className="size-4 text-muted rtl:rotate-180" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">{fr.stock.lowStock.title}</h2>
              {lowTotal > 0 ? <Badge tone="warning">{lowTotal}</Badge> : null}
            </div>
            {low.error ? <p className="text-sm text-danger">{fr.common.unexpectedError}</p> : null}
            {!low.error && lowTotal === 0 ? <p className="text-sm text-muted">{fr.stock.lowStock.none}</p> : null}
            <ul className="space-y-2 text-sm">
              {lowRows.map((r) => (
                <li key={r.variant_id} className="flex justify-between gap-3">
                  <span className="truncate">
                    {r.product_name}
                    {r.option_values.length ? <span className="text-muted"> — {variantLabel(r.option_values)}</span> : null}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {r.quantity} / {r.low_stock_threshold}
                  </span>
                </li>
              ))}
            </ul>
            {lowTotal > 0 ? (
              <Link href="/app/stock?low=1" className="mt-3 inline-block text-sm text-primary hover:underline">
                {fr.stock.lowStock.seeAll} →
              </Link>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">{t.organizationInfo}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">{t.yourRole}</dt>
              <dd>{fr.roles[membership.role]}</dd>
              <dt className="text-muted">{t.currency}</dt>
              <dd>{membership.currencyCode}</dd>
              <dt className="text-muted">{t.timezone}</dt>
              <dd>{membership.timezone}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}


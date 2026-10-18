import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatTnd } from "@/lib/domain/money";
import { PERIOD_PRESETS, percentChange, previousPeriod, resolvePeriod, sumDays, type Totals } from "@/lib/domain/reports";
import { formatCalendarDay } from "@/lib/format";
import { listHref, parseChoice, todayIn } from "@/lib/ui/list-params";
import { logger } from "@/lib/logger";
import { buttonClasses } from "@/components/ui/button";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { BarChart } from "@/components/charts/bar-chart";
import { fr } from "@/i18n/fr";

export const metadata: Metadata = { title: fr.reports.title };

const SORTS = ["revenue", "quantity", "margin"] as const;
type Sort = (typeof SORTS)[number];
type Params = { period?: string; from?: string; to?: string; sort?: string };

function percent(bps: number): string {
  return `${(bps / 100).toLocaleString("fr-TN", { maximumFractionDigits: 1 })} %`;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const context = await requireOrgContext();
  const t = fr.reports;
  if (!hasPermission(context, "reports.view")) return <Alert tone="error">{t.forbidden}</Alert>;
  const orgId = context.membership.organizationId;
  const params = await searchParams;
  const period = resolvePeriod(params, todayIn(context.membership.timezone));
  const previous = previousPeriod(period);
  const sort = parseChoice<Sort>(params.sort, SORTS, "revenue");

  const supabase = await createSupabaseServerClient();
  const range = { p_organization_id: orgId, p_from: period.from, p_to: period.to };
  const [days, previousDays, products, categories, payments] = await Promise.all([
    supabase.rpc("report_sales_by_day", range),
    supabase.rpc("report_sales_by_day", { p_organization_id: orgId, p_from: previous.from, p_to: previous.to }),
    supabase.rpc("report_sales_by_product", { ...range, p_group: "product", p_sort: sort, p_limit: 10 }),
    supabase.rpc("report_sales_by_product", { ...range, p_group: "category", p_limit: 50 }),
    supabase.rpc("report_payments_by_method", range),
  ]);
  const failed = [days, previousDays, products, categories, payments].find((r) => r.error);
  if (failed?.error) logger.error("reports.load_failed", { organizationId: orgId, code: failed.error.code });

  const current = sumDays(days.data ?? []);
  const before = sumDays(previousDays.data ?? []);
  const base = { period: period.preset, from: period.preset === "custom" ? period.from : null, to: period.preset === "custom" ? period.to : null };
  const exportHref = (kind: string) => listHref("/app/reports/export", { ...base, kind, sort: kind === "products" ? sort : null });

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <div className="space-y-4">
        <Card>
          <nav aria-label={t.period} className="flex flex-wrap gap-2">
            {PERIOD_PRESETS.filter((p) => p !== "custom").map((p) => (
              <Link
                key={p}
                href={listHref("/app/reports", { period: p === "7d" ? null : p, sort: sort === "revenue" ? null : sort })}
                aria-current={period.preset === p ? "page" : undefined}
                className={buttonClasses(period.preset === p ? "primary" : "secondary", "min-h-9 px-3")}
              >
                {t.presets[p]}
              </Link>
            ))}
          </nav>
          <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="period" value="custom" />
            {sort !== "revenue" ? <input type="hidden" name="sort" value={sort} /> : null}
            <div>
              <label htmlFor="from" className="mb-1 block text-sm font-medium">
                {t.from}
              </label>
              <input id="from" name="from" type="date" defaultValue={period.from} className="min-h-11 rounded-lg border border-border bg-surface px-3" />
            </div>
            <div>
              <label htmlFor="to" className="mb-1 block text-sm font-medium">
                {t.to}
              </label>
              <input id="to" name="to" type="date" defaultValue={period.to} className="min-h-11 rounded-lg border border-border bg-surface px-3" />
            </div>
            <button type="submit" className={buttonClasses("secondary")}>
              {t.apply}
            </button>
          </form>
          <p className="mt-3 text-sm font-medium" aria-live="polite">
            {t.range(formatCalendarDay(period.from), formatCalendarDay(period.to))}
          </p>
          <p className="text-xs text-muted">{t.vsPrevious(formatCalendarDay(previous.from), formatCalendarDay(previous.to))}</p>
        </Card>

        {failed ? <Alert tone="error">{fr.common.unexpectedError}</Alert> : null}

        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi label={t.kpi.net} value={formatTnd(current.net_sales_millimes)} change={percentChange(current.net_sales_millimes, before.net_sales_millimes)} strong />
          <Kpi label={t.kpi.count} value={String(current.sales_count)} change={percentChange(current.sales_count, before.sales_count)} />
          <Kpi
            label={t.kpi.basket}
            value={current.average_basket_millimes === null ? "—" : formatTnd(current.average_basket_millimes)}
            change={basketChange(current, before)}
          />
          <Kpi
            label={t.kpi.margin}
            value={formatTnd(current.margin_millimes)}
            detail={current.margin_rate_bps === null ? undefined : t.kpi.marginRate(percent(current.margin_rate_bps))}
            change={percentChange(current.margin_millimes, before.margin_millimes)}
          />
          <Kpi label={t.kpi.returns} value={formatTnd(current.returns_millimes)} />
          <Kpi label={t.kpi.credit} value={formatTnd(current.credit_given_millimes)} />
        </dl>

        {current.revenue_without_cost_millimes > 0 ? <Alert tone="info">{t.withoutCost(formatTnd(current.revenue_without_cost_millimes))}</Alert> : null}

        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{t.chartTitle}</h2>
            <ExportLink href={exportHref("days")} label={t.exportDays} />
          </div>
          <BarChart
            points={(days.data ?? []).map((d) => ({
              label: formatCalendarDay(d.day),
              shortLabel: formatCalendarDay(d.day, true),
              value: d.net_sales_millimes,
            }))}
            label={(max) => t.chartLabel(formatCalendarDay(period.from), formatCalendarDay(period.to), max)}
            formatValue={formatTnd}
            tableCaption={t.chartTitle}
            columnLabel={t.day}
            valueLabel={t.kpi.net}
            showTable={t.showTable}
            width={960}
          />
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{t.products}</h2>
              <ExportLink href={exportHref("products")} label={t.exportProducts} />
            </div>
            <nav aria-label={t.sortBy} className="mb-3 flex flex-wrap gap-2 text-sm">
              {SORTS.map((s) => (
                <Link
                  key={s}
                  href={listHref("/app/reports", { ...base, period: period.preset === "7d" ? null : period.preset, sort: s === "revenue" ? null : s })}
                  aria-current={sort === s ? "page" : undefined}
                  className={`rounded-full border px-3 py-1 ${sort === s ? "border-primary bg-primary-soft font-medium text-primary" : "border-border"}`}
                >
                  {t.sorts[s]}
                </Link>
              ))}
            </nav>
            <GroupTable rows={products.data ?? []} firstColumn={t.columns.article} />
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{t.categories}</h2>
              <ExportLink href={exportHref("categories")} label={t.exportCategories} />
            </div>
            <GroupTable rows={(categories.data ?? []).map((c) => ({ ...c, label: c.label ?? t.noCategory }))} firstColumn={t.columns.category} />
          </Card>
        </div>

        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{t.payments}</h2>
            <ExportLink href={exportHref("payments")} label={t.exportPayments} />
          </div>
          {(payments.data ?? []).length === 0 ? (
            <p className="text-sm text-muted">{t.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted">
                    <th scope="col" className="py-1 text-start font-medium">{t.columns.method}</th>
                    <th scope="col" className="py-1 text-end font-medium">{t.columns.received}</th>
                    <th scope="col" className="py-1 text-end font-medium">{t.columns.refunded}</th>
                    <th scope="col" className="py-1 text-end font-medium">{t.columns.net}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(payments.data ?? []).map((p) => (
                    <tr key={p.method_id}>
                      <td className="py-2">{p.label}</td>
                      <td className="py-2 text-end tabular-nums">{formatTnd(p.received_millimes)}</td>
                      <td className="py-2 text-end tabular-nums">{formatTnd(p.refunded_millimes)}</td>
                      <td className="py-2 text-end font-medium tabular-nums">{formatTnd(p.net_millimes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <p className="text-xs text-muted">{t.definitions}</p>
      </div>
    </>
  );
}

function basketChange(current: Totals, before: Totals): number | null {
  return current.average_basket_millimes === null || before.average_basket_millimes === null
    ? null
    : percentChange(current.average_basket_millimes, before.average_basket_millimes);
}

function Kpi({ label, value, change, detail, strong = false }: { label: string; value: string; change?: number | null; detail?: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-xl font-semibold" : "text-lg font-medium"}`}>{value}</dd>
      {detail ? <dd className="text-xs text-muted">{detail}</dd> : null}
      {change !== undefined ? (
        <dd className={`text-xs ${change === null ? "text-muted" : change >= 0 ? "text-success" : "text-danger"}`}>
          {change === null ? fr.reports.noComparison : `${change > 0 ? "+" : ""}${change.toLocaleString("fr-TN")} %`}
        </dd>
      ) : null}
    </div>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} download className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline">
      <Download aria-hidden="true" className="size-4" />
      {label}
    </a>
  );
}

type GroupRow = {
  group_id: string | null;
  label: string | null;
  quantity: number;
  revenue_millimes: number;
  margin_millimes: number;
  revenue_without_cost_millimes: number;
};

function GroupTable({ rows, firstColumn }: { rows: GroupRow[]; firstColumn: string }) {
  const t = fr.reports;
  if (rows.length === 0) return <EmptyState title={t.empty} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted">
            <th scope="col" className="py-1 text-start font-medium">{firstColumn}</th>
            <th scope="col" className="py-1 text-end font-medium">{t.columns.quantity}</th>
            <th scope="col" className="py-1 text-end font-medium">{t.columns.revenue}</th>
            <th scope="col" className="py-1 text-end font-medium">{t.columns.margin}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.group_id ?? "none"}>
              <td className="max-w-48 truncate py-2">{r.label}</td>
              <td className="py-2 text-end tabular-nums">{r.quantity}</td>
              <td className="py-2 text-end tabular-nums">{formatTnd(r.revenue_millimes)}</td>
              <td className="py-2 text-end tabular-nums">
                {r.revenue_without_cost_millimes === r.revenue_millimes && r.revenue_millimes !== 0 ? (
                  <span className="text-muted">{t.unknownCost}</span>
                ) : (
                  formatTnd(r.margin_millimes)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

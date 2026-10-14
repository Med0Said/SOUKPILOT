import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatTnd } from "@/lib/domain/money";
import { balanceDue } from "@/lib/domain/pricing";
import { formatDateTime } from "@/lib/format";
import { logger } from "@/lib/logger";
import { buttonClasses } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";

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

function todayIn(timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ day?: string; status?: string }> }) {
  const context = await requireOrgContext();
  const { organizationId: orgId, timezone: tz } = context.membership;
  const t = fr.sales.list;
  const params = await searchParams;
  const day = params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : todayIn(tz);
  const status = params.status === "draft" ? "draft" : "finalized";

  const supabase = await createSupabaseServerClient();
  const [{ data: summaryRaw, error: summaryError }, { data: sales, error }] = await Promise.all([
    supabase.rpc("sales_daily_summary", { p_organization_id: orgId, p_day: day }),
    status === "draft"
      ? supabase
          .from("sales")
          .select("id, number, status, total_millimes, returned_millimes, paid_millimes, created_at, finalized_at, customers ( name )")
          .eq("organization_id", orgId)
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(50)
      : supabase
          .from("sales")
          .select("id, number, status, total_millimes, returned_millimes, paid_millimes, created_at, finalized_at, customers ( name )")
          .eq("organization_id", orgId)
          .eq("status", "finalized")
          .order("number", { ascending: false })
          .limit(50),
  ]);
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

        {(sales ?? []).length === 0 ? <EmptyState title={status === "draft" ? t.noDrafts : t.empty} /> : null}
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {(sales ?? []).map((s) => {
            const due = balanceDue({ totalMillimes: s.total_millimes, returnedMillimes: s.returned_millimes, paidMillimes: s.paid_millimes });
            return (
              <li key={s.id}>
                <Link
                  href={s.status === "draft" ? `/app/sales/new?draft=${s.id}` : `/app/sales/${s.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-background"
                >
                  <span>
                    <span className="font-medium">{s.number ? fr.sales.number(s.number) : t.draft}</span>
                    <span className="block text-sm text-muted">
                      {formatDateTime(s.finalized_at ?? s.created_at, tz)}
                      {s.customers?.name ? ` · ${s.customers.name}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {s.returned_millimes > 0 ? <Badge>{t.returned}</Badge> : null}
                    {s.status === "finalized" && due > 0 ? <Badge tone="warning">{t.due(formatTnd(due))}</Badge> : null}
                    <span className="font-semibold tabular-nums">{formatTnd(s.total_millimes)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
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

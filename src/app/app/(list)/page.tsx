import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { variantLabel } from "@/lib/domain/catalog";
import { logger } from "@/lib/logger";
import { Badge, Card, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";

export const metadata: Metadata = { title: fr.nav.dashboard };

/**
 * Dashboard. Only live data is shown (low-stock list from the database);
 * sales figures will appear with the sales module — never placeholder numbers.
 */
export default async function DashboardPage() {
  const { membership } = await requireOrgContext();
  const t = fr.dashboard;
  const supabase = await createSupabaseServerClient();
  const { data: low, error } = await supabase.rpc("stock_overview", {
    p_organization_id: membership.organizationId,
    p_low_only: true,
    p_limit: 6,
  });
  if (error) logger.error("dashboard.low_stock_failed", { organizationId: membership.organizationId, code: error.code });
  const lowTotal = low?.[0]?.total_count ?? 0;

  return (
    <>
      <PageHeader title={`${t.welcome} — ${membership.organizationName}`} subtitle={t.intro} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">{fr.stock.lowStock.title}</h2>
            {lowTotal > 0 ? <Badge tone="warning">{lowTotal}</Badge> : null}
          </div>
          {error ? <p className="text-sm text-danger">{fr.common.unexpectedError}</p> : null}
          {!error && lowTotal === 0 ? <p className="text-sm text-muted">{fr.stock.lowStock.none}</p> : null}
          <ul className="space-y-2 text-sm">
            {(low ?? []).map((r) => (
              <li key={r.variant_id} className="flex justify-between gap-3">
                <span className="truncate">
                  {r.product_name} <span className="text-muted">— {variantLabel(r.option_values)}</span>
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
        <Card>
          <h2 className="mb-3 font-semibold">{t.nextSteps}</h2>
          <ul className="list-disc space-y-1 ps-5 text-sm text-muted">
            {t.roadmap.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

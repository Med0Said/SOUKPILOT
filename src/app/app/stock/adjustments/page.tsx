import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations, loadVariantInfo } from "@/lib/server/variants";
import { documentNumber, formatDelta } from "@/lib/domain/stock";
import { formatDateTime } from "@/lib/format";
import { buttonClasses } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/list-controls";
import { must } from "@/lib/server/query";
import { listHref, pageCount, parsePage } from "@/lib/ui/list-params";
import { fr } from "@/i18n/fr";
import { ReviewButtons } from "./review-buttons";

export const metadata: Metadata = { title: fr.stock.nav.adjustments };

const PAGE_SIZE = 30;
const COLUMNS = "id, number, kind, status, location_id, reason, created_at, reviewed_at, review_note";

export default async function AdjustmentsPage({ searchParams }: { searchParams: Promise<{ created?: string; page?: string }> }) {
  const { created, page: rawPage } = await searchParams;
  const page = parsePage(rawPage);
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const tz = context.membership.timezone;
  const canReview = hasPermission(context, "stock.adjust.review");
  const t = fr.stock.adjustments;

  const supabase = await createSupabaseServerClient();
  // Pending adjustments (awaiting approval, always few) are shown on every
  // page so none is missed; reviewed ones form the paginated history.
  const [pendingResult, historyResult, locations] = await Promise.all([
    supabase.from("stock_adjustments").select(COLUMNS).eq("organization_id", orgId).eq("status", "pending").order("number", { ascending: false }),
    supabase
      .from("stock_adjustments")
      .select(COLUMNS, { count: "exact" })
      .eq("organization_id", orgId)
      .neq("status", "pending")
      .order("number", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    loadLocations(supabase, orgId),
  ]);
  const pending = must(pendingResult, "stock.adjustments_load_failed", { organizationId: orgId });
  const history = must(historyResult, "stock.adjustments_load_failed", { organizationId: orgId });
  const pages = pageCount(historyResult.count ?? 0, PAGE_SIZE);
  const ids = [...pending, ...history].map((a) => a.id);
  const lines = ids.length
    ? must(
        await supabase.from("stock_adjustment_lines").select("adjustment_id, variant_id, quantity_delta").in("adjustment_id", ids),
        "stock.adjustment_lines_load_failed",
        { organizationId: orgId },
      )
    : [];
  const variants = await loadVariantInfo(supabase, orgId, (lines ?? []).map((l) => l.variant_id));
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const pendingFirst = [...pending, ...history];

  return (
    <>
      <PageHeader
        title={fr.stock.nav.adjustments}
        subtitle={canReview ? t.subtitleReviewer : t.subtitleCashier}
        actions={
          <Link href="/app/stock/adjustments/new" className={buttonClasses("primary")}>
            {fr.stock.overview.adjust}
          </Link>
        }
      />
      <div className="space-y-3">
        {created ? <Alert tone="success">{canReview ? t.createdReviewer : t.createdCashier}</Alert> : null}
        {pendingFirst.length === 0 ? <EmptyState title={t.empty} /> : null}
        {pendingFirst.map((a) => (
          <Card key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {documentNumber("stock_adjustment", a.number)} · {a.kind === "opening" ? fr.stock.opening.title : a.reason}
                </p>
                <p className="text-sm text-muted">
                  {locationName.get(a.location_id)} · {formatDateTime(a.created_at, tz)}
                </p>
              </div>
              <Badge tone={a.status === "pending" ? "warning" : a.status === "approved" ? "success" : "neutral"}>
                {t.status[a.status]}
              </Badge>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {(lines ?? [])
                .filter((l) => l.adjustment_id === a.id)
                .map((l) => (
                  <li key={l.variant_id} className="flex justify-between gap-3">
                    <span className="truncate">{variants.get(l.variant_id)?.label ?? "?"}</span>
                    <span className="tabular-nums">{formatDelta(l.quantity_delta)}</span>
                  </li>
                ))}
            </ul>
            {a.review_note ? <p className="mt-2 text-sm text-muted">{a.review_note}</p> : null}
            {a.status === "pending" && canReview ? <ReviewButtons adjustmentId={a.id} /> : null}
          </Card>
        ))}
        <Pagination page={page} pages={pages} href={(n) => listHref("/app/stock/adjustments", { page: n })} />
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations, loadVariantInfo } from "@/lib/server/variants";
import { documentNumber, formatDelta } from "@/lib/domain/stock";
import { formatDateTime } from "@/lib/format";
import { logger } from "@/lib/logger";
import { buttonClasses } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { ReviewButtons } from "./review-buttons";

export const metadata: Metadata = { title: fr.stock.nav.adjustments };

export default async function AdjustmentsPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { created } = await searchParams;
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const tz = context.membership.timezone;
  const canReview = hasPermission(context, "stock.adjust.review");
  const t = fr.stock.adjustments;

  const supabase = await createSupabaseServerClient();
  const [{ data: adjustments, error }, locations] = await Promise.all([
    supabase
      .from("stock_adjustments")
      .select("id, number, kind, status, location_id, reason, created_at, reviewed_at, review_note")
      .eq("organization_id", orgId)
      .order("status", { ascending: false })
      .order("number", { ascending: false })
      .limit(100),
    loadLocations(supabase, orgId),
  ]);
  if (error) logger.error("stock.adjustments_load_failed", { organizationId: orgId, code: error.code });
  const ids = (adjustments ?? []).map((a) => a.id);
  const { data: lines } = ids.length
    ? await supabase.from("stock_adjustment_lines").select("adjustment_id, variant_id, quantity_delta").in("adjustment_id", ids)
    : { data: [] as { adjustment_id: string; variant_id: string; quantity_delta: number }[] };
  const variants = await loadVariantInfo(supabase, orgId, (lines ?? []).map((l) => l.variant_id));
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const pendingFirst = [...(adjustments ?? [])].sort(
    (a, b) => Number(b.status === "pending") - Number(a.status === "pending") || b.number - a.number,
  );

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
      </div>
    </>
  );
}

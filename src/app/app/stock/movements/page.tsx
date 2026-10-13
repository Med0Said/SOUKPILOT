import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations, loadVariantInfo } from "@/lib/server/variants";
import { MOVEMENT_LABELS, formatDelta } from "@/lib/domain/stock";
import { formatDateTime } from "@/lib/format";
import { logger } from "@/lib/logger";
import { buttonClasses } from "@/components/ui/button";
import { Alert, EmptyState, PageHeader } from "@/components/ui/layout";
import type { StockMovementType } from "@/lib/supabase/database.types";
import { fr } from "@/i18n/fr";

export const metadata: Metadata = { title: fr.stock.nav.movements };

const PAGE_SIZE = 50;
const UUID = /^[0-9a-f-]{36}$/i;

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string; location?: string; type?: string; page?: string }>;
}) {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const tz = context.membership.timezone;
  const t = fr.stock.movements;
  const params = await searchParams;
  const variantId = params.variant && UUID.test(params.variant) ? params.variant : null;
  const locationId = params.location && UUID.test(params.location) ? params.location : null;
  const type = params.type && params.type in MOVEMENT_LABELS ? (params.type as StockMovementType) : null;
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.page ?? "1", 10) || 1));

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("stock_movements")
    .select("id, location_id, variant_id, quantity_delta, quantity_after, movement_type, reason, created_at", { count: "exact" })
    .eq("organization_id", orgId)
    .order("seq", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (variantId) query = query.eq("variant_id", variantId);
  if (locationId) query = query.eq("location_id", locationId);
  if (type) query = query.eq("movement_type", type);
  const [{ data: movements, count, error }, locations] = await Promise.all([query, loadLocations(supabase, orgId)]);
  if (error) logger.error("stock.movements_load_failed", { organizationId: orgId, code: error.code });

  const variants = await loadVariantInfo(supabase, orgId, [
    ...(movements ?? []).map((m) => m.variant_id),
    ...(variantId ? [variantId] : []),
  ]);
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    if (variantId) sp.set("variant", variantId);
    if (locationId) sp.set("location", locationId);
    if (type) sp.set("type", type);
    if (p > 1) sp.set("page", String(p));
    return `/app/stock/movements?${sp.toString()}`;
  };

  return (
    <>
      <PageHeader
        title={fr.stock.nav.movements}
        subtitle={variantId ? variants.get(variantId)?.label : t.subtitle}
      />
      <form method="get" className="mb-4 grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        {variantId ? <input type="hidden" name="variant" value={variantId} /> : null}
        <div>
          <label htmlFor="location" className="mb-1.5 block text-sm font-medium">
            {fr.stock.form.location}
          </label>
          <select
            id="location"
            name="location"
            defaultValue={locationId ?? ""}
            className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
          >
            <option value="">{fr.stock.overview.allLocations}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="type" className="mb-1.5 block text-sm font-medium">
            {t.type}
          </label>
          <select
            id="type"
            name="type"
            defaultValue={type ?? ""}
            className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
          >
            <option value="">{t.allTypes}</option>
            {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClasses("secondary")}>
          {fr.catalog.searchButton}
        </button>
      </form>
      {variantId ? (
        <Link href="/app/stock/movements" className="mb-3 inline-block text-sm text-primary hover:underline">
          {t.allArticles}
        </Link>
      ) : null}

      {error ? <Alert tone="error">{fr.common.unexpectedError}</Alert> : null}
      {!error && (movements ?? []).length === 0 ? <EmptyState title={t.empty} /> : null}
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {(movements ?? []).map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-3 p-3">
            <div className="min-w-0">
              <Link href={`/app/stock/movements?variant=${m.variant_id}`} className="block truncate text-sm font-medium hover:underline">
                {variants.get(m.variant_id)?.label ?? "?"}
              </Link>
              <p className="text-xs text-muted">
                {MOVEMENT_LABELS[m.movement_type]} · {locationName.get(m.location_id)} · {formatDateTime(m.created_at, tz)}
              </p>
              {m.reason ? <p className="text-xs text-muted">{m.reason}</p> : null}
            </div>
            <div className="shrink-0 text-end">
              <p className={`font-semibold tabular-nums ${m.quantity_delta < 0 ? "text-danger" : "text-success"}`}>
                {formatDelta(m.quantity_delta)}
              </p>
              <p className="text-xs text-muted tabular-nums">{t.after(m.quantity_after)}</p>
            </div>
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <nav aria-label={fr.catalog.pagination} className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href(page - 1)} className={buttonClasses("secondary")}>
              ← {fr.catalog.previous}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">{fr.catalog.pageOf(page, pages)}</span>
          {page < pages ? (
            <Link href={href(page + 1)} className={buttonClasses("secondary")}>
              {fr.catalog.next} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}

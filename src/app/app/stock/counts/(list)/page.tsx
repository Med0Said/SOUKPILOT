import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations } from "@/lib/server/variants";
import { documentNumber } from "@/lib/domain/stock";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { CreateCountForm } from "../create-count-form";
import { must } from "@/lib/server/query";

export const metadata: Metadata = { title: fr.stock.nav.counts };

export default async function CountsPage() {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const t = fr.stock.counts;
  const supabase = await createSupabaseServerClient();
  const [countsResult, locations] = await Promise.all([
    supabase
      .from("stock_counts")
      .select("id, number, location_id, status, note, created_at")
      .eq("organization_id", orgId)
      .order("number", { ascending: false })
      .limit(50),
    loadLocations(supabase, orgId),
  ]);
  const counts = must(countsResult, "stock.counts_load_failed", { organizationId: orgId });
  const name = new Map(locations.map((l) => [l.id, l.name]));

  return (
    <>
      <PageHeader title={fr.stock.nav.counts} subtitle={t.subtitle} />
      <div className="space-y-4">
        {hasPermission(context, "stock.count.manage") ? (
          <Card>
            <h2 className="mb-3 font-semibold">{t.newTitle}</h2>
            <CreateCountForm
              organizationId={orgId}
              idempotencyKey={randomUUID()}
              locations={locations.filter((l) => l.is_active)}
            />
          </Card>
        ) : null}
        {(counts ?? []).length === 0 ? <EmptyState title={t.empty} /> : null}
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {(counts ?? []).map((c) => (
            <li key={c.id}>
              <Link href={`/app/stock/counts/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-background">
                <span>
                  <span className="font-medium">{documentNumber("stock_count", c.number)}</span>
                  <span className="block text-sm text-muted">
                    {name.get(c.location_id)} · {formatDateTime(c.created_at, context.membership.timezone)}
                    {c.note ? ` · ${c.note}` : ""}
                  </span>
                </span>
                <Badge tone={c.status === "approved" ? "success" : c.status === "cancelled" ? "neutral" : "warning"}>
                  {t.status[c.status]}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

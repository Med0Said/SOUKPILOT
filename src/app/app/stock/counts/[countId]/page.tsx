import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations, loadVariantInfo } from "@/lib/server/variants";
import { countDifference, documentNumber, formatDelta } from "@/lib/domain/stock";
import { Badge, Breadcrumbs, Card, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { CountSheet, CountTransitions } from "./count-sheet";

export const metadata: Metadata = { title: fr.stock.nav.counts };

export default async function CountPage({ params }: { params: Promise<{ countId: string }> }) {
  const { countId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(countId)) notFound();
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const canReview = hasPermission(context, "stock.count.manage");
  const t = fr.stock.counts;

  const supabase = await createSupabaseServerClient();
  const { data: count } = await supabase
    .from("stock_counts")
    .select("id, number, location_id, status, note")
    .eq("id", countId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!count) notFound();
  const [{ data: items }, locations] = await Promise.all([
    supabase.from("stock_count_items").select("variant_id, expected_quantity, counted_quantity").eq("count_id", countId),
    loadLocations(supabase, orgId),
  ]);
  const variants = await loadVariantInfo(supabase, orgId, (items ?? []).map((i) => i.variant_id));
  const rows = (items ?? [])
    .map((i) => ({
      variantId: i.variant_id,
      label: variants.get(i.variant_id)?.label ?? "?",
      sku: variants.get(i.variant_id)?.sku ?? null,
      expected: i.expected_quantity,
      counted: i.counted_quantity,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  const countedRows = rows.filter((r) => r.counted !== null);
  const differences = countedRows.filter((r) => countDifference(r.expected, r.counted) !== 0);

  return (
    <>
      <Breadcrumbs items={[{ label: fr.nav.stock, href: "/app/stock" }, { label: fr.stock.nav.counts, href: "/app/stock/counts" }, { label: documentNumber("stock_count", count.number) }]} />
      <PageHeader
        title={documentNumber("stock_count", count.number)}
        subtitle={`${locations.find((l) => l.id === count.location_id)?.name ?? ""}${count.note ? ` · ${count.note}` : ""}`}
        actions={<Badge tone={count.status === "approved" ? "success" : "warning"}>{t.status[count.status]}</Badge>}
      />
      <div className="space-y-4">
        <p className="text-sm text-muted">{t.progress(countedRows.length, rows.length)}</p>
        <CountTransitions countId={count.id} status={count.status} canReview={canReview} />

        {count.status === "in_progress" ? <CountSheet countId={count.id} rows={rows} /> : null}

        {count.status !== "in_progress" && canReview ? (
          <Card>
            <h2 className="mb-1 font-semibold">{t.differences}</h2>
            <p className="mb-3 text-sm text-muted">{t.differencesHelp}</p>
            {differences.length === 0 ? <p className="text-sm text-muted">{t.noDifference}</p> : null}
            {differences.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th scope="col" className="p-2 text-start font-medium">{fr.importPage.product}</th>
                    <th scope="col" className="p-2 text-end font-medium">{t.expected}</th>
                    <th scope="col" className="p-2 text-end font-medium">{t.counted}</th>
                    <th scope="col" className="p-2 text-end font-medium">{t.difference}</th>
                  </tr>
                </thead>
                <tbody>
                  {differences.map((r) => (
                    <tr key={r.variantId} className="border-b border-border">
                      <td className="p-2">{r.label}</td>
                      <td className="p-2 text-end tabular-nums">{r.expected}</td>
                      <td className="p-2 text-end tabular-nums">{r.counted}</td>
                      <td className="p-2 text-end font-medium tabular-nums">
                        {formatDelta(countDifference(r.expected, r.counted) ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </Card>
        ) : null}
      </div>
    </>
  );
}

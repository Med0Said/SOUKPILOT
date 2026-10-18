import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations, loadVariantInfo } from "@/lib/server/variants";
import { documentNumber } from "@/lib/domain/stock";
import { formatTnd } from "@/lib/domain/money";
import { formatDateTime } from "@/lib/format";
import { Alert, Breadcrumbs, Card, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { must } from "@/lib/server/query";

export const metadata: Metadata = { title: fr.stock.nav.receipts };

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ receiptId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { receiptId } = await params;
  const { created } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(receiptId)) notFound();
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  if (!hasPermission(context, "stock.receive")) return <Alert tone="error">{fr.catalog.forbidden}</Alert>;
  const t = fr.stock.receipts;

  const supabase = await createSupabaseServerClient();
  const receipt = must(await supabase
    .from("stock_receipts")
    .select("id, number, location_id, supplier_id, reference, note, created_at")
    .eq("id", receiptId)
    .eq("organization_id", orgId)
    .maybeSingle(), "stock.receipt_load_failed", { organizationId: orgId });
  if (!receipt) notFound();

  const [linesResult, locations, supplier] = await Promise.all([
    supabase.from("stock_receipt_lines").select("variant_id, quantity, unit_cost_millimes").eq("receipt_id", receiptId),
    loadLocations(supabase, orgId),
    receipt.supplier_id
      ? supabase.from("suppliers").select("name").eq("id", receipt.supplier_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const lines = must(linesResult, "stock.receipt_lines_load_failed", { organizationId: orgId });
  const variants = await loadVariantInfo(supabase, orgId, (lines ?? []).map((l) => l.variant_id));
  const totalUnits = (lines ?? []).reduce((n, l) => n + l.quantity, 0);
  const knownTotal = (lines ?? []).reduce((n, l) => n + (l.unit_cost_millimes ?? 0) * l.quantity, 0);
  const allCosted = (lines ?? []).every((l) => l.unit_cost_millimes !== null);

  return (
    <>
      <Breadcrumbs items={[{ label: fr.nav.stock, href: "/app/stock" }, { label: fr.stock.nav.receipts, href: "/app/stock/receipts" }, { label: documentNumber("stock_receipt", receipt.number) }]} />
      <PageHeader
        title={documentNumber("stock_receipt", receipt.number)}
        subtitle={formatDateTime(receipt.created_at, context.membership.timezone)}
      />
      <div className="space-y-4">
        {created ? <Alert tone="success">{t.created}</Alert> : null}
        <Card>
          <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">{fr.stock.form.location}</dt>
            <dd>{locations.find((l) => l.id === receipt.location_id)?.name}</dd>
            <dt className="text-muted">{fr.stock.form.supplier}</dt>
            <dd>{supplier.data?.name ?? "—"}</dd>
            <dt className="text-muted">{fr.stock.form.reference}</dt>
            <dd>{receipt.reference ?? "—"}</dd>
            {receipt.note ? (
              <>
                <dt className="text-muted">{fr.stock.form.note}</dt>
                <dd className="whitespace-pre-line">{receipt.note}</dd>
              </>
            ) : null}
          </dl>
        </Card>
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th scope="col" className="p-2 text-start font-medium">{fr.importPage.product}</th>
                <th scope="col" className="p-2 text-end font-medium">{fr.stock.form.quantity}</th>
                <th scope="col" className="p-2 text-end font-medium">{fr.stock.form.unitCost}</th>
              </tr>
            </thead>
            <tbody>
              {(lines ?? []).map((l) => (
                <tr key={l.variant_id} className="border-b border-border">
                  <td className="p-2">{variants.get(l.variant_id)?.label ?? "?"}</td>
                  <td className="p-2 text-end tabular-nums">{l.quantity}</td>
                  <td className="p-2 text-end tabular-nums">{l.unit_cost_millimes === null ? "—" : formatTnd(l.unit_cost_millimes)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="p-2 text-start">{t.total}</th>
                <td className="p-2 text-end font-semibold tabular-nums">{totalUnits}</td>
                <td className="p-2 text-end font-semibold tabular-nums">
                  {formatTnd(knownTotal)}
                  {allCosted ? "" : " *"}
                </td>
              </tr>
            </tfoot>
          </table>
          {allCosted ? null : <p className="mt-2 text-xs text-muted">{t.partialCost}</p>}
        </Card>
      </div>
    </>
  );
}

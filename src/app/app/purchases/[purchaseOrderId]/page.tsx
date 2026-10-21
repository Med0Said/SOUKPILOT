import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLocations, loadVariantInfo } from "@/lib/server/variants";
import { formatTnd } from "@/lib/domain/money";
import { poNumber, poStatusTone } from "@/lib/domain/purchasing";
import { documentNumber } from "@/lib/domain/stock";
import { formatCalendarDay, formatDateTime } from "@/lib/format";
import { buttonClasses } from "@/components/ui/button";
import { Alert, Badge, Breadcrumbs, Card, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { PoTransitions, ReceiveForm } from "./po-forms";
import { must } from "@/lib/server/query";
import { isUuid } from "@/lib/validation/ids";

export const metadata: Metadata = { title: fr.nav.purchases };

export default async function PurchaseOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ purchaseOrderId: string }>;
  searchParams: Promise<{ saved?: string; received?: string }>;
}) {
  const { purchaseOrderId } = await params;
  const { saved, received } = await searchParams;
  if (!isUuid(purchaseOrderId)) notFound();
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const tz = context.membership.timezone;
  if (!hasPermission(context, "purchasing.manage")) return <Alert tone="error">{fr.catalog.forbidden}</Alert>;
  const t = fr.purchases.detail;

  const supabase = await createSupabaseServerClient();
  const po = must(await supabase
    .from("purchase_orders")
    .select("*, suppliers ( name )")
    .eq("id", purchaseOrderId)
    .eq("organization_id", orgId)
    .maybeSingle(), "purchases.detail_load_failed", { organizationId: orgId });
  if (!po) notFound();

  const [itemsResult, receiptsResult, locations] = await Promise.all([
    supabase.from("purchase_order_items").select("*").eq("purchase_order_id", po.id).order("line_no"),
    supabase
      .from("stock_receipts")
      .select("id, number, created_at, total_cost_millimes, reference")
      .eq("purchase_order_id", po.id)
      .order("number"),
    loadLocations(supabase, orgId),
  ]);
  const items = must(itemsResult, "purchases.items_load_failed", { organizationId: orgId });
  const receipts = must(receiptsResult, "purchases.receipts_load_failed", { organizationId: orgId });
  const info = await loadVariantInfo(supabase, orgId, (items ?? []).map((i) => i.variant_id));
  const open = po.status === "ordered" || po.status === "partially_received";

  return (
    <>
      <Breadcrumbs items={[{ label: fr.nav.purchases, href: "/app/purchases" }, { label: poNumber(po.number, fr.purchases.draft) }]} />
      <PageHeader
        title={poNumber(po.number, fr.purchases.draft)}
        subtitle={`${po.suppliers?.name ?? ""} · ${t.deliverTo(locations.find((l) => l.id === po.location_id)?.name ?? "")}`}
        actions={<Badge tone={poStatusTone(po.status)}>{fr.purchases.status[po.status]}</Badge>}
      />
      <div className="space-y-4">
        {saved ? <Alert tone="success">{t.saved}</Alert> : null}
        {received ? <Alert tone="success">{t.receivedDone}</Alert> : null}

        <Card>
          <dl className="mb-3 grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
            {po.expected_date ? (
              <>
                <dt className="text-muted">{fr.purchases.form.expectedDate}</dt>
                <dd>{formatCalendarDay(po.expected_date)}</dd>
              </>
            ) : null}
            {po.reference ? (
              <>
                <dt className="text-muted">{fr.purchases.form.reference}</dt>
                <dd>{po.reference}</dd>
              </>
            ) : null}
            {po.ordered_at ? (
              <>
                <dt className="text-muted">{t.orderedAt}</dt>
                <dd>{formatDateTime(po.ordered_at, tz)}</dd>
              </>
            ) : null}
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th scope="col" className="p-2 text-start font-medium">{fr.importPage.product}</th>
                  <th scope="col" className="p-2 text-end font-medium">{t.ordered}</th>
                  <th scope="col" className="p-2 text-end font-medium">{t.received}</th>
                  <th scope="col" className="p-2 text-end font-medium">{fr.stock.form.unitCost}</th>
                  <th scope="col" className="p-2 text-end font-medium">{fr.purchases.form.total}</th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((i) => (
                  <tr key={i.id} className="border-b border-border">
                    <td className="p-2">{info.get(i.variant_id)?.label ?? "?"}</td>
                    <td className="p-2 text-end tabular-nums">{i.quantity}</td>
                    <td className="p-2 text-end tabular-nums">{i.received_quantity}</td>
                    <td className="p-2 text-end tabular-nums">{formatTnd(i.unit_cost_millimes)}</td>
                    <td className="p-2 text-end tabular-nums">{formatTnd(i.quantity * i.unit_cost_millimes)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={4} className="p-2 text-start">
                    {fr.purchases.form.total}
                  </th>
                  <td className="p-2 text-end font-semibold tabular-nums">{formatTnd(po.ordered_total_millimes)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {po.note ? <p className="mt-3 whitespace-pre-line text-sm text-muted">{po.note}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {po.status === "draft" ? (
              <Link href={`/app/purchases/new?draft=${po.id}`} className={buttonClasses("secondary")}>
                {t.edit}
              </Link>
            ) : null}
            <PoTransitions purchaseOrderId={po.id} status={po.status} />
          </div>
        </Card>

        {open ? (
          <Card>
            <h2 className="mb-1 font-semibold">{t.receiveTitle}</h2>
            <p className="mb-3 text-sm text-muted">{t.receiveHelp}</p>
            <ReceiveForm
              purchaseOrderId={po.id}
              idempotencyKey={randomUUID()}
              items={(items ?? [])
                .filter((i) => i.received_quantity < i.quantity)
                .map((i) => ({
                  id: i.id,
                  label: info.get(i.variant_id)?.label ?? "?",
                  remaining: i.quantity - i.received_quantity,
                  unitCost: i.unit_cost_millimes,
                }))}
            />
          </Card>
        ) : null}

        {(receipts ?? []).length > 0 ? (
          <Card>
            <h2 className="mb-2 font-semibold">{t.receipts}</h2>
            <ul className="space-y-1 text-sm">
              {(receipts ?? []).map((r) => (
                <li key={r.id}>
                  <Link href={`/app/stock/receipts/${r.id}`} className="flex justify-between gap-3 hover:underline">
                    <span>
                      {documentNumber("stock_receipt", r.number)} · {formatDateTime(r.created_at, tz)}
                      {r.reference ? ` · ${r.reference}` : ""}
                    </span>
                    <span className="tabular-nums">{formatTnd(r.total_cost_millimes)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}

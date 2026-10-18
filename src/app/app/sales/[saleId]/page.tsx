import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSale } from "@/lib/server/sales";
import { formatTnd } from "@/lib/domain/money";
import { balanceDue, formatBps } from "@/lib/domain/pricing";
import { formatDateTime } from "@/lib/format";
import { buttonClasses } from "@/components/ui/button";
import { Alert, Breadcrumbs, Card, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { PaymentForm, ReturnForm } from "./sale-forms";
import { must } from "@/lib/server/query";
import { isUuid } from "@/lib/validation/ids";

export const metadata: Metadata = { title: fr.nav.sales };

export default async function SalePage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<{ created?: string; returned?: string }>;
}) {
  const { saleId } = await params;
  const { created, returned } = await searchParams;
  if (!isUuid(saleId)) notFound();
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const tz = context.membership.timezone;
  const t = fr.sales.detail;

  const supabase = await createSupabaseServerClient();
  const data = await loadSale(supabase, orgId, saleId);
  if (!data || data.sale.status !== "finalized") notFound();
  const { sale, items, payments, returns, methods } = data;
  const canReturn = hasPermission(context, "sales.return");
  const canMargin = hasPermission(context, "sales.viewMargin");
  const due = balanceDue({ totalMillimes: sale.total_millimes, returnedMillimes: sale.returned_millimes, paidMillimes: sale.paid_millimes });
  const methodLabel = new Map(methods.map((m) => [m.id, m.label]));
  const activeMethods = methods.filter((m) => m.is_active).map((m) => ({ id: m.id, label: m.label }));

  // Estimated gross margin (owner/manager): net sales − cost snapshot of sold units, known costs only.
  let margin: { value: number; complete: boolean } | null = null;
  if (canMargin) {
    const costs = must(await supabase
      .from("sale_item_costs")
      .select("sale_item_id, unit_cost_millimes")
      .in(
        "sale_item_id",
        items.map((i) => i.id),
      ), "sales.costs_load_failed", { organizationId: orgId });
    const cost = new Map((costs ?? []).map((c) => [c.sale_item_id, c.unit_cost_millimes]));
    // BigInt: cost × quantity can exceed Number.MAX_SAFE_INTEGER in extreme cases.
    let value = 0n;
    let complete = true;
    for (const i of items) {
      const unitCost = cost.get(i.id);
      const keptQty = i.quantity - i.returned_quantity;
      if (unitCost === null || unitCost === undefined) {
        if (keptQty > 0) complete = false;
        continue;
      }
      value += BigInt(i.net_total_millimes - i.returned_millimes) - BigInt(unitCost) * BigInt(keptQty);
    }
    margin = { value: Number(value), complete };
  }

  return (
    <>
      <Breadcrumbs items={[{ label: fr.nav.sales, href: "/app/sales" }, { label: fr.sales.number(sale.number as number) }]} />
      <PageHeader
        title={fr.sales.number(sale.number as number)}
        subtitle={`${formatDateTime(sale.finalized_at as string, tz)} · ${data.locationName}${sale.customers?.name ? ` · ${sale.customers.name}` : ""}`}
        actions={
          <Link href={`/app/sales/${sale.id}/receipt`} className={buttonClasses("secondary")}>
            {t.receipt}
          </Link>
        }
      />
      <div className="space-y-4">
        {created ? <Alert tone="success">{t.created}</Alert> : null}
        {returned ? <Alert tone="success">{t.returnDone}</Alert> : null}

        <Card>
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {i.product_name}
                    {i.variant_label ? <span className="text-muted"> — {i.variant_label}</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {i.quantity} × {formatTnd(i.unit_price_millimes)}
                    {i.discount_bps > 0 ? ` · ${t.discount} ${formatBps(i.discount_bps)}` : ""}
                    {i.returned_quantity > 0 ? ` · ${t.returnedQty(i.returned_quantity)}` : ""}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">{formatTnd(i.net_total_millimes)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
            <Row label={fr.sales.cart.subtotal} value={formatTnd(sale.subtotal_millimes + sale.line_discount_millimes)} />
            <Row label={fr.sales.cart.discounts} value={`− ${formatTnd(sale.line_discount_millimes + sale.order_discount_millimes)}`} />
            <Row label={fr.sales.cart.total} value={formatTnd(sale.total_millimes)} strong />
            {sale.returned_millimes > 0 ? <Row label={t.returns} value={`− ${formatTnd(sale.returned_millimes)}`} /> : null}
            <Row label={t.paid} value={formatTnd(sale.paid_millimes)} />
            <Row
              label={due >= 0 ? t.due : t.owed}
              value={formatTnd(Math.abs(due))}
              strong
              tone={due !== 0 ? "warning" : undefined}
            />
          </dl>
          {margin ? (
            <p className="mt-3 text-xs text-muted">
              {t.margin(formatTnd(margin.value))}
              {margin.complete ? "" : ` ${t.marginPartial}`}
            </p>
          ) : null}
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">{t.paymentsTitle}</h2>
          {payments.length === 0 ? <p className="text-sm text-muted">{t.noPayments}</p> : null}
          <ul className="space-y-1 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-3">
                <span>
                  {p.kind === "refund" ? t.refund : t.payment} · {methodLabel.get(p.method_id)} ·{" "}
                  <span className="text-muted">{formatDateTime(p.created_at, tz)}</span>
                </span>
                <span className="tabular-nums">
                  {p.kind === "refund" ? "− " : ""}
                  {formatTnd(p.amount_millimes)}
                </span>
              </li>
            ))}
          </ul>
          {due > 0 ? (
            <div className="mt-4">
              <PaymentForm mode="payment" saleId={sale.id} methods={activeMethods} due={due} idempotencyKey={randomUUID()} />
            </div>
          ) : null}
          {due < 0 && canReturn ? (
            <div className="mt-4">
              <PaymentForm mode="refund" saleId={sale.id} methods={activeMethods} due={-due} idempotencyKey={randomUUID()} />
            </div>
          ) : null}
        </Card>

        {returns.length > 0 ? (
          <Card>
            <h2 className="mb-2 font-semibold">{t.returnsTitle}</h2>
            <ul className="space-y-1 text-sm">
              {returns.map((r) => (
                <li key={r.id} className="flex justify-between gap-3">
                  <span>
                    {fr.sales.returnNumber(r.number)} · {r.reason} · <span className="text-muted">{formatDateTime(r.created_at, tz)}</span>
                  </span>
                  <span className="tabular-nums">{formatTnd(r.amount_millimes)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {canReturn && items.some((i) => i.returned_quantity < i.quantity) ? (
          <Card>
            <h2 className="mb-1 font-semibold">{t.returnTitle}</h2>
            <p className="mb-3 text-sm text-muted">{t.returnHelp}</p>
            <ReturnForm
              saleId={sale.id}
              idempotencyKey={randomUUID()}
              methods={activeMethods}
              items={items
                .filter((i) => i.returned_quantity < i.quantity)
                .map((i) => ({
                  id: i.id,
                  label: `${i.product_name}${i.variant_label ? ` — ${i.variant_label}` : ""}`,
                  remaining: i.quantity - i.returned_quantity,
                  trackStock: i.track_stock,
                }))}
            />
          </Card>
        ) : null}
      </div>
    </>
  );
}

function Row({ label, value, strong = false, tone }: { label: string; value: string; strong?: boolean; tone?: "warning" }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""} ${tone === "warning" ? "text-danger" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

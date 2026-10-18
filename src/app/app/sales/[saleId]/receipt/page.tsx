import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSale } from "@/lib/server/sales";
import { formatTnd } from "@/lib/domain/money";
import { formatBps } from "@/lib/domain/pricing";
import { formatDateTime } from "@/lib/format";
import { fr } from "@/i18n/fr";
import { PrintButton } from "./print-button";
import { isUuid } from "@/lib/validation/ids";

export const metadata: Metadata = { title: fr.sales.receipt.title };

/** Internal receipt (ticket). Explicitly NOT a fiscal invoice. */
export default async function ReceiptPage({ params }: { params: Promise<{ saleId: string }> }) {
  const { saleId } = await params;
  if (!isUuid(saleId)) notFound();
  const context = await requireOrgContext();
  const supabase = await createSupabaseServerClient();
  const data = await loadSale(supabase, context.membership.organizationId, saleId);
  if (!data || data.sale.status !== "finalized") notFound();
  const { sale, items, payments, methods } = data;
  const t = fr.sales.receipt;
  const label = new Map(methods.map((m) => [m.id, m.label]));

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-4 flex justify-between gap-2 print:hidden">
        <a href={`/app/sales/${sale.id}`} className="text-sm text-primary hover:underline">
          ← {fr.sales.number(sale.number as number)}
        </a>
        <PrintButton label={t.print} />
      </div>
      <article className="rounded-lg border border-border bg-white p-4 font-mono text-[13px] leading-snug text-black print:border-0 print:p-0">
        <header className="mb-3 text-center">
          <p className="text-base font-bold">{data.organizationName}</p>
          <p>{data.locationName}</p>
          <p className="mt-1">{t.ticket(fr.sales.number(sale.number as number))}</p>
          <p>{formatDateTime(sale.finalized_at as string, context.membership.timezone)}</p>
          {sale.customers?.name ? <p>{t.customer(sale.customers.name)}</p> : null}
        </header>
        <table className="w-full">
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="align-top">
                <td className="py-0.5 pe-2">
                  {i.product_name}
                  {i.variant_label ? ` ${i.variant_label}` : ""}
                  <br />
                  {i.quantity} × {formatTnd(i.unit_price_millimes)}
                  {i.discount_bps > 0 ? ` −${formatBps(i.discount_bps)}` : ""}
                </td>
                <td className="py-0.5 text-end">{formatTnd(i.line_total_millimes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="my-2 border-t border-dashed border-black" />
        {sale.order_discount_millimes > 0 ? (
          <p className="flex justify-between">
            <span>{t.orderDiscount}</span>
            <span>− {formatTnd(sale.order_discount_millimes)}</span>
          </p>
        ) : null}
        <p className="flex justify-between text-base font-bold">
          <span>{t.total}</span>
          <span>{formatTnd(sale.total_millimes)}</span>
        </p>
        {payments.map((p) => (
          <p key={p.id} className="flex justify-between">
            <span>
              {p.kind === "refund" ? t.refund : ""}
              {label.get(p.method_id)}
            </span>
            <span>
              {p.kind === "refund" ? "− " : ""}
              {formatTnd(p.amount_millimes)}
            </span>
          </p>
        ))}
        {sale.returned_millimes > 0 ? (
          <p className="flex justify-between">
            <span>{t.returns}</span>
            <span>− {formatTnd(sale.returned_millimes)}</span>
          </p>
        ) : null}
        {sale.total_millimes - sale.returned_millimes - sale.paid_millimes > 0 ? (
          <p className="flex justify-between font-bold">
            <span>{t.due}</span>
            <span>{formatTnd(sale.total_millimes - sale.returned_millimes - sale.paid_millimes)}</span>
          </p>
        ) : null}
        <div className="my-2 border-t border-dashed border-black" />
        <p className="text-center">{t.thanks}</p>
        <p className="mt-2 text-center text-[11px]">{t.notInvoice}</p>
      </article>
    </div>
  );
}

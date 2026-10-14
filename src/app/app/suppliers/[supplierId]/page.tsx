import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatTnd } from "@/lib/domain/money";
import { documentNumber } from "@/lib/domain/stock";
import { formatDate, formatDateTime } from "@/lib/format";
import { Alert, Badge, Breadcrumbs, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { SupplierForm } from "../supplier-form";
import { SupplierPaymentForm } from "./supplier-payment-form";

export const metadata: Metadata = { title: fr.nav.suppliers };

function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function SupplierPage({ params }: { params: Promise<{ supplierId: string }> }) {
  const { supplierId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(supplierId)) notFound();
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const tz = context.membership.timezone;
  if (!hasPermission(context, "purchasing.manage")) return <Alert tone="error">{fr.catalog.forbidden}</Alert>;
  const t = fr.purchases.supplier;

  const supabase = await createSupabaseServerClient();
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, name, phone, email, notes, is_active")
    .eq("id", supplierId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!supplier) notFound();

  const [{ data: balances }, { data: receipts }, { data: payments }, { data: methods }] = await Promise.all([
    supabase.rpc("supplier_balances", { p_organization_id: orgId }),
    supabase
      .from("stock_receipts")
      .select("id, number, created_at, total_cost_millimes, lines_without_cost, reference")
      .eq("organization_id", orgId)
      .eq("supplier_id", supplierId)
      .order("number", { ascending: false })
      .limit(100),
    supabase
      .from("supplier_payments")
      .select("id, kind, amount_millimes, paid_on, reference, method_id")
      .eq("organization_id", orgId)
      .eq("supplier_id", supplierId)
      .order("paid_on", { ascending: false })
      .limit(100),
    supabase.from("payment_methods").select("id, label, is_active").eq("organization_id", orgId).order("sort_order"),
  ]);
  const b = (balances ?? []).find((x) => x.supplier_id === supplierId);
  const methodLabel = new Map((methods ?? []).map((m) => [m.id, m.label]));

  return (
    <>
      <Breadcrumbs items={[{ label: fr.nav.suppliers, href: "/app/suppliers" }, { label: supplier.name }]} />
      <PageHeader title={supplier.name} subtitle={supplier.phone ?? undefined} />
      <div className="space-y-4">
        <Card>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-muted">{t.purchases}</dt>
              <dd className="font-medium tabular-nums">{formatTnd(b?.purchases_millimes ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-muted">{t.paid}</dt>
              <dd className="font-medium tabular-nums">{formatTnd(b?.paid_millimes ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-muted">{(b?.balance_millimes ?? 0) >= 0 ? t.owed : t.credit}</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatTnd(Math.abs(b?.balance_millimes ?? 0))}</dd>
            </div>
          </dl>
          {b && b.receipts_without_cost > 0 ? <p className="mt-2 text-xs text-muted">{t.withoutCost(b.receipts_without_cost)}</p> : null}
          <p className="mt-2 text-xs text-muted">{t.definition}</p>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">{t.recordTitle}</h2>
          <SupplierPaymentForm
            organizationId={orgId}
            supplierId={supplierId}
            idempotencyKey={randomUUID()}
            today={todayIn(tz)}
            methods={(methods ?? []).filter((m) => m.is_active).map((m) => ({ id: m.id, label: m.label }))}
          />
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">{t.paymentsTitle}</h2>
          {(payments ?? []).length === 0 ? <EmptyState title={t.noPayments} /> : null}
          <ul className="space-y-1 text-sm">
            {(payments ?? []).map((p) => (
              <li key={p.id} className="flex justify-between gap-3">
                <span>
                  {formatDate(`${p.paid_on}T12:00:00Z`, "UTC")} · {methodLabel.get(p.method_id)}
                  {p.reference ? ` · ${p.reference}` : ""}
                  {p.kind === "refund" ? <Badge>{t.refund}</Badge> : null}
                </span>
                <span className="tabular-nums">
                  {p.kind === "refund" ? "− " : ""}
                  {formatTnd(p.amount_millimes)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">{t.receiptsTitle}</h2>
          {(receipts ?? []).length === 0 ? <EmptyState title={t.noReceipts} /> : null}
          <ul className="space-y-1 text-sm">
            {(receipts ?? []).map((r) => (
              <li key={r.id}>
                <Link href={`/app/stock/receipts/${r.id}`} className="flex justify-between gap-3 hover:underline">
                  <span>
                    {documentNumber("stock_receipt", r.number)} · {formatDateTime(r.created_at, tz)}
                    {r.reference ? ` · ${r.reference}` : ""}
                  </span>
                  <span className="tabular-nums">
                    {formatTnd(r.total_cost_millimes)}
                    {r.lines_without_cost > 0 ? " *" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        {hasPermission(context, "suppliers.manage") ? (
          <Card>
            <h2 className="mb-3 font-semibold">{t.edit}</h2>
            <SupplierForm
              organizationId={orgId}
              supplier={{
                id: supplier.id,
                name: supplier.name,
                phone: supplier.phone ?? "",
                email: supplier.email ?? "",
                notes: supplier.notes ?? "",
                isActive: supplier.is_active,
              }}
            />
          </Card>
        ) : null}
      </div>
    </>
  );
}

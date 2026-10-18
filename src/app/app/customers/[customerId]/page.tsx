import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatTnd } from "@/lib/domain/money";
import { balanceDue } from "@/lib/domain/pricing";
import { formatDateTime } from "@/lib/format";
import { Badge, Breadcrumbs, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/list-controls";
import { listHref, pageCount, parsePage } from "@/lib/ui/list-params";
import { fr } from "@/i18n/fr";
import { CustomerForm } from "../customer-form";
import { must } from "@/lib/server/query";
import { isUuid } from "@/lib/validation/ids";

export const metadata: Metadata = { title: fr.nav.customers };

const PAGE_SIZE = 30;

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { customerId } = await params;
  const page = parsePage((await searchParams).page);
  if (!isUuid(customerId)) notFound();
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const t = fr.customers;
  const supabase = await createSupabaseServerClient();

  const customer = must(await supabase
    .from("customers")
    .select("id, name, phone, address, notes, is_active")
    .eq("id", customerId)
    .eq("organization_id", orgId)
    .maybeSingle(), "customers.detail_load_failed", { organizationId: orgId });
  if (!customer) notFound();

  const [salesResult, balancesResult] = await Promise.all([
    supabase
      .from("sales")
      .select("id, number, finalized_at, total_millimes, returned_millimes, paid_millimes", { count: "exact" })
      .eq("organization_id", orgId)
      .eq("customer_id", customerId)
      .eq("status", "finalized")
      .order("number", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.rpc("customer_balances", { p_organization_id: orgId }),
  ]);
  const sales = must(salesResult, "customers.history_load_failed", { organizationId: orgId });
  const pages = pageCount(salesResult.count ?? 0, PAGE_SIZE);
  // Over ALL the customer's sales (the history below is one page of them).
  const balance = must(balancesResult, "customers.balance_load_failed", { organizationId: orgId }).find((b) => b.customer_id === customerId)?.balance_millimes ?? 0;

  return (
    <>
      <Breadcrumbs items={[{ label: fr.nav.customers, href: "/app/customers" }, { label: customer.name }]} />
      <PageHeader
        title={customer.name}
        subtitle={customer.phone ?? undefined}
        actions={balance !== 0 ? <Badge tone={balance > 0 ? "warning" : "neutral"}>{balance > 0 ? t.owes(formatTnd(balance)) : t.credit(formatTnd(-balance))}</Badge> : null}
      />
      <div className="space-y-4">
        <Card>
          <h2 className="mb-2 font-semibold">{t.history}</h2>
          {(sales ?? []).length === 0 ? <EmptyState title={t.noSales} /> : null}
          <ul className="divide-y divide-border">
            {(sales ?? []).map((s) => {
              const due = balanceDue({ totalMillimes: s.total_millimes, returnedMillimes: s.returned_millimes, paidMillimes: s.paid_millimes });
              return (
                <li key={s.id}>
                  <Link href={`/app/sales/${s.id}`} className="flex justify-between gap-3 py-2 text-sm hover:underline">
                    <span>
                      {fr.sales.number(s.number as number)} · {formatDateTime(s.finalized_at as string, context.membership.timezone)}
                    </span>
                    <span className="tabular-nums">
                      {formatTnd(s.total_millimes)}
                      {due > 0 ? <span className="text-danger"> ({t.owes(formatTnd(due))})</span> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={page}
            pages={pages}
            href={(n) => listHref(`/app/customers/${customerId}`, { page: n })}
            label={fr.lists.paginationHistory}
          />
        </Card>
        {hasPermission(context, "customers.manage") ? (
          <Card>
            <h2 className="mb-3 font-semibold">{t.edit}</h2>
            <CustomerForm
              organizationId={orgId}
              customer={{
                id: customer.id,
                name: customer.name,
                phone: customer.phone ?? "",
                address: customer.address ?? "",
                notes: customer.notes ?? "",
                isActive: customer.is_active,
              }}
            />
          </Card>
        ) : null}
      </div>
    </>
  );
}

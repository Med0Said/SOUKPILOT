import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatTnd } from "@/lib/domain/money";
import { logger } from "@/lib/logger";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: fr.nav.customers };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const q = ((await searchParams).q ?? "").slice(0, 100).trim();
  const t = fr.customers;

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("customers")
    .select("id, name, phone, is_active")
    .eq("organization_id", orgId)
    .order("name")
    .limit(200);
  if (q) query = query.ilike("name", `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const [{ data: customers, error }, { data: balances }] = await Promise.all([
    query,
    supabase.rpc("customer_balances", { p_organization_id: orgId }),
  ]);
  if (error) logger.error("customers.load_failed", { organizationId: orgId, code: error.code });
  const balance = new Map((balances ?? []).map((b) => [b.customer_id, b.balance_millimes]));
  const totalDue = (balances ?? []).reduce((s, b) => s + Math.max(b.balance_millimes, 0), 0);

  return (
    <>
      <PageHeader title={fr.nav.customers} subtitle={t.subtitle} />
      <div className="space-y-4">
        {totalDue > 0 ? (
          <Card>
            <p className="text-sm">
              {t.totalDue} : <span className="font-semibold tabular-nums">{formatTnd(totalDue)}</span>
            </p>
          </Card>
        ) : null}
        <Card>
          <h2 className="mb-3 font-semibold">{t.add}</h2>
          <CustomerForm organizationId={orgId} />
        </Card>
        <form method="get" role="search">
          <label htmlFor="q" className="sr-only">
            {fr.catalog.searchLabel}
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t.search}
            className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
          />
        </form>
        {(customers ?? []).length === 0 ? <EmptyState title={t.empty} /> : null}
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {(customers ?? []).map((c) => {
            const b = balance.get(c.id) ?? 0;
            return (
              <li key={c.id}>
                <Link href={`/app/customers/${c.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-background">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block text-sm text-muted">{c.phone ?? "—"}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {!c.is_active ? <Badge>{fr.settings.inactive}</Badge> : null}
                    {b > 0 ? <Badge tone="warning">{t.owes(formatTnd(b))}</Badge> : null}
                    {b < 0 ? <Badge>{t.credit(formatTnd(-b))}</Badge> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

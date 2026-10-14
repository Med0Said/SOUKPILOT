import type { Metadata } from "next";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { formatTnd } from "@/lib/domain/money";
import Link from "next/link";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { SupplierForm } from "../supplier-form";

export const metadata: Metadata = { title: fr.nav.suppliers };

export default async function SuppliersPage() {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const t = fr.suppliersPage;
  if (!hasPermission(context, "suppliers.manage")) {
    return <Alert tone="error">{fr.catalog.forbidden}</Alert>;
  }

  const supabase = await createSupabaseServerClient();
  const { data: suppliers, error } = await supabase
    .from("suppliers")
    .select("id, name, phone, email, notes, is_active")
    .eq("organization_id", orgId)
    .order("is_active", { ascending: false })
    .order("name");
  if (error) logger.error("suppliers.load_failed", { organizationId: orgId, code: error.code });
  const { data: balances } = await supabase.rpc("supplier_balances", { p_organization_id: orgId });
  const balance = new Map((balances ?? []).map((b) => [b.supplier_id, b.balance_millimes]));

  return (
    <>
      <PageHeader title={fr.nav.suppliers} subtitle={t.subtitle} />
      <div className="space-y-4">
        {error ? <Alert tone="error">{fr.common.unexpectedError}</Alert> : null}
        <Card>
          <h2 className="mb-3 font-semibold">{t.add}</h2>
          <SupplierForm organizationId={orgId} />
        </Card>
        {(suppliers ?? []).length === 0 && !error ? <EmptyState title={t.empty} /> : null}
        {(suppliers ?? []).map((s) => (
          <details key={s.id} className="rounded-xl border border-border bg-surface">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 p-4">
              <span className="font-medium">{s.name}</span>
              <span className="text-sm text-muted">
                {[s.phone, s.is_active ? null : fr.settings.inactive].filter(Boolean).join(" · ")}
                {(balance.get(s.id) ?? 0) > 0 ? (
                  <span className="ms-2 font-medium text-danger tabular-nums">{fr.purchases.supplier.owes(formatTnd(balance.get(s.id) ?? 0))}</span>
                ) : null}
              </span>
            </summary>
            <div className="space-y-3 border-t border-border p-4">
              <Link href={`/app/suppliers/${s.id}`} className="inline-block text-sm text-primary hover:underline">
                {fr.purchases.supplier.account} →
              </Link>
              <SupplierForm
                organizationId={orgId}
                supplier={{
                  id: s.id,
                  name: s.name,
                  phone: s.phone ?? "",
                  email: s.email ?? "",
                  notes: s.notes ?? "",
                  isActive: s.is_active,
                }}
              />
            </div>
          </details>
        ))}
      </div>
    </>
  );
}

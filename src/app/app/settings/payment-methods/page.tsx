import type { Metadata } from "next";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatBps } from "@/lib/domain/pricing";
import { Badge, Card, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { DiscountSettingForm, PaymentMethodForm } from "./payment-method-forms";
import { must } from "@/lib/server/query";

export const metadata: Metadata = { title: fr.paymentMethods.title };

export default async function PaymentMethodsPage() {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const canManage = hasPermission(context, "paymentMethods.manage");
  const t = fr.paymentMethods;
  const supabase = await createSupabaseServerClient();
  const [methodsResult, orgResult] = await Promise.all([
    supabase.from("payment_methods").select("id, label, kind, sort_order, is_active").eq("organization_id", orgId).order("sort_order"),
    supabase.from("organizations").select("cashier_max_discount_bps").eq("id", orgId).single(),
  ]);
  const methods = must(methodsResult, "settings.payment_methods_load_failed", { organizationId: orgId });
  const org = must(orgResult, "settings.organization_load_failed", { organizationId: orgId });

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <div className="space-y-4">
        <Card>
          <ul className="divide-y divide-border">
            {(methods ?? []).map((m) => (
              <li key={m.id} className="py-3">
                {canManage ? (
                  <PaymentMethodForm
                    organizationId={orgId}
                    method={{ id: m.id, label: m.label, kind: m.kind, sortOrder: m.sort_order, isActive: m.is_active }}
                  />
                ) : (
                  <div className="flex justify-between text-sm">
                    <span>{m.label}</span>
                    <Badge tone={m.is_active ? "success" : "neutral"}>{m.is_active ? fr.settings.active : fr.settings.inactive}</Badge>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
        {canManage ? (
          <Card>
            <h2 className="mb-3 font-semibold">{t.add}</h2>
            <PaymentMethodForm organizationId={orgId} />
          </Card>
        ) : null}
        <Card>
          <h2 className="mb-1 font-semibold">{t.discountTitle}</h2>
          <p className="mb-3 text-sm text-muted">{t.discountHelp}</p>
          {hasPermission(context, "organization.update") ? (
            <DiscountSettingForm organizationId={orgId} currentBps={org?.cashier_max_discount_bps ?? 0} />
          ) : (
            <p className="text-sm">{formatBps(org?.cashier_max_discount_bps ?? 0)}</p>
          )}
        </Card>
      </div>
    </>
  );
}

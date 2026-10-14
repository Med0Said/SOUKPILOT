import type { Metadata } from "next";
import { Mail, ScanBarcode, Coins, type LucideIcon } from "lucide-react";
import { requireOrgContext } from "@/lib/auth/organization";
import { providerStatus, type ProviderStatus } from "@/lib/integrations/http";
import { enabledIntegrations } from "@/lib/server/integrations";
import { formatDateTime } from "@/lib/format";
import { Alert, Badge, Breadcrumbs, PageHeader } from "@/components/ui/layout";
import { CurrencyConverter } from "@/components/integrations/currency-converter";
import type { IntegrationKey } from "@/lib/supabase/database.types";
import { fr } from "@/i18n/fr";
import { IntegrationSwitch } from "./integration-switch";

export const metadata: Metadata = { title: fr.integrations.title };

type Card = {
  key: IntegrationKey;
  icon: LucideIcon;
  text: { name: string; description: string; provider: string; licence: string; dataSent: string; limits: string };
  status: ProviderStatus[];
};

export default async function IntegrationsPage() {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const tz = context.membership.timezone;
  const t = fr.integrations;
  const isOwner = context.membership.role === "owner";
  const enabled = await enabledIntegrations(orgId);

  const cards: Card[] = [
    { key: "barcode_lookup", icon: ScanBarcode, text: t.barcode, status: [providerStatus("openfoodfacts"), providerStatus("openbeautyfacts")] },
    { key: "exchange_rates", icon: Coins, text: t.rates, status: [providerStatus("exchange_rates")] },
  ];

  const lastCall = (statuses: ProviderStatus[]) => {
    const ok = statuses.map((s) => s.lastSuccessAt).filter(Boolean).sort().at(-1) ?? null;
    const failed = statuses.filter((s) => s.lastFailureAt).sort((a, b) => (a.lastFailureAt! < b.lastFailureAt! ? -1 : 1)).at(-1) ?? null;
    if (failed && (!ok || failed.lastFailureAt! > ok)) return t.failed(formatDateTime(failed.lastFailureAt!, tz), failed.lastFailure ?? "");
    return ok ? t.ok(formatDateTime(ok, tz)) : t.never;
  };

  return (
    <>
      <Breadcrumbs items={[{ label: fr.nav.settings, href: "/app/settings" }, { label: t.title }]} />
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <div className="space-y-4">
        {!isOwner ? <Alert tone="info">{t.ownerOnly}</Alert> : null}

        {cards.map((card) => {
          const on = enabled.has(card.key);
          return (
            <section key={card.key} aria-labelledby={`int-${card.key}`} className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <card.icon aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <h2 id={`int-${card.key}`} className="font-semibold">
                      {card.text.name}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-muted">{card.text.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={on ? "success" : "neutral"}>{on ? t.enabled : t.disabled}</Badge>
                  {isOwner ? <IntegrationSwitch organizationId={orgId} integration={card.key} enabled={on} /> : null}
                </div>
              </div>
              <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-muted">{t.provider}</dt>
                <dd>{card.text.provider}</dd>
                <dt className="text-muted">{t.licence}</dt>
                <dd>{card.text.licence}</dd>
                <dt className="text-muted">{t.dataSent}</dt>
                <dd>{card.text.dataSent}</dd>
                <dt className="text-muted">{t.limits}</dt>
                <dd>{card.text.limits}</dd>
                <dt className="text-muted">{t.status}</dt>
                <dd>{lastCall(card.status)}</dd>
              </dl>
              {card.key === "exchange_rates" && on ? (
                <div className="mt-4">
                  <CurrencyConverter organizationId={orgId} />
                </div>
              ) : null}
            </section>
          );
        })}

        <section aria-labelledby="int-email" className="rounded-xl border border-dashed border-border p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-background text-muted">
                <Mail aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 id="int-email" className="font-semibold">
                  {t.email.name}
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">{t.email.description}</p>
                <p className="mt-2 max-w-2xl text-sm">{t.email.later}</p>
              </div>
            </div>
            <Badge>{t.notAvailable}</Badge>
          </div>
        </section>

        <p className="text-xs text-muted">{t.safety}</p>
      </div>
    </>
  );
}

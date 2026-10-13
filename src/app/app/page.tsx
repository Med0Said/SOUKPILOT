import type { Metadata } from "next";
import { requireOrgContext } from "@/lib/auth/organization";
import { Card, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";

export const metadata: Metadata = { title: fr.nav.dashboard };

/**
 * Milestone 1 dashboard: no business metrics yet. Per product rules we do not
 * display placeholder or hard-coded figures as if they were live data.
 */
export default async function DashboardPage() {
  const { membership } = await requireOrgContext();
  const t = fr.dashboard;

  return (
    <>
      <PageHeader title={`${t.welcome} — ${membership.organizationName}`} subtitle={t.intro} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">{t.organizationInfo}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">{t.yourRole}</dt>
            <dd>{fr.roles[membership.role]}</dd>
            <dt className="text-muted">{t.currency}</dt>
            <dd>{membership.currencyCode}</dd>
            <dt className="text-muted">{t.timezone}</dt>
            <dd>{membership.timezone}</dd>
          </dl>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">{t.nextSteps}</h2>
          <ul className="list-disc space-y-1 ps-5 text-sm text-muted">
            {t.roadmap.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

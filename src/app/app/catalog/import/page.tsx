import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { MAX_IMPORT_ROWS, TEMPLATE_HEADERS } from "@/lib/domain/catalog-import";
import { Alert, Card, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: fr.importPage.title };

export default async function ImportPage() {
  const context = await requireOrgContext();
  const t = fr.importPage;
  if (!hasPermission(context, "catalog.import")) {
    return <Alert tone="error">{fr.catalog.forbidden}</Alert>;
  }
  return (
    <>
      <Link href="/app/catalog" className="mb-3 inline-block text-sm text-primary underline-offset-4 hover:underline">
        ← {fr.nav.catalog}
      </Link>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <div className="space-y-4">
        <Card>
          <h2 className="mb-2 font-semibold">{t.howTitle}</h2>
          <ol className="list-decimal space-y-1 ps-5 text-sm text-muted">
            <li>
              {t.step1}{" "}
              <a href="/app/catalog/import/template" className="text-primary underline-offset-4 hover:underline" download>
                {t.downloadTemplate}
              </a>
            </li>
            <li>{t.step2}</li>
            <li>{t.step3(MAX_IMPORT_ROWS)}</li>
            <li>{t.step4}</li>
          </ol>
          <p className="mt-3 text-xs text-muted">
            {t.columns} : {TEMPLATE_HEADERS.join(", ")}. {t.columnsHelp}
          </p>
        </Card>
        <ImportWizard organizationId={context.membership.organizationId} />
      </div>
    </>
  );
}

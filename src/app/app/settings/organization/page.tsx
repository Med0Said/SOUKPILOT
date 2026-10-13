import type { Metadata } from "next";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { Alert, Card, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { OrganizationForm } from "./organization-form";

export const metadata: Metadata = { title: fr.settings.organizationTitle };

export default async function OrganizationSettingsPage() {
  const context = await requireOrgContext();
  const { membership } = context;
  const canEdit = hasPermission(context, "organization.update");

  const supabase = await createSupabaseServerClient();
  const { data: locations, error } = await supabase
    .from("locations")
    .select("id, name, code, is_active")
    .eq("organization_id", membership.organizationId)
    .order("created_at");
  if (error) logger.error("locations.load_failed", { organizationId: membership.organizationId, code: error.code });

  return (
    <>
      <PageHeader title={fr.settings.organizationTitle} subtitle={fr.settings.organizationSubtitle} />
      <div className="space-y-4">
        <Card>
          {canEdit ? null : (
            <div className="mb-4">
              <Alert tone="info">{fr.settings.readOnly}</Alert>
            </div>
          )}
          <OrganizationForm
            organizationId={membership.organizationId}
            name={membership.organizationName}
            timezone={membership.timezone}
            disabled={!canEdit}
          />
          <p className="mt-4 text-xs text-muted">
            {fr.settings.currency} : {membership.currencyCode}. {fr.settings.currencyFixed}
          </p>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">{fr.settings.locations}</h2>
          {error ? <Alert tone="error">{fr.common.unexpectedError}</Alert> : null}
          <ul className="divide-y divide-border">
            {(locations ?? []).map((location) => (
              <li key={location.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {location.name}
                  {location.code ? <span className="ms-2 text-xs text-muted">{location.code}</span> : null}
                </span>
                <span className="text-xs text-muted">
                  {location.is_active ? fr.settings.active : fr.settings.inactive}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

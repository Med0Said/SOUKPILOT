import type { Metadata } from "next";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { Alert, Badge, Card, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { LocationForm } from "./location-form";

export const metadata: Metadata = { title: fr.nav.locations };

export default async function LocationsPage() {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const canManage = hasPermission(context, "locations.manage");
  const t = fr.locations;

  const supabase = await createSupabaseServerClient();
  const { data: locations, error } = await supabase
    .from("locations")
    .select("id, name, code, is_active")
    .eq("organization_id", orgId)
    .order("created_at");
  if (error) logger.error("locations.load_failed", { organizationId: orgId, code: error.code });

  return (
    <>
      <PageHeader title={fr.nav.locations} subtitle={t.subtitle} />
      <div className="space-y-4">
        {error ? <Alert tone="error">{fr.common.unexpectedError}</Alert> : null}
        <Card>
          <ul className="divide-y divide-border">
            {(locations ?? []).map((location) => (
              <li key={location.id} className="py-3">
                {canManage ? (
                  <LocationForm
                    organizationId={orgId}
                    location={{ id: location.id, name: location.name, code: location.code, isActive: location.is_active }}
                  />
                ) : (
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {location.name}
                      {location.code ? <span className="ms-2 text-xs text-muted">{location.code}</span> : null}
                    </span>
                    <Badge tone={location.is_active ? "success" : "neutral"}>
                      {location.is_active ? fr.settings.active : fr.settings.inactive}
                    </Badge>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
        {canManage ? (
          <Card>
            <h2 className="mb-1 font-semibold">{t.addTitle}</h2>
            <p className="mb-4 text-sm text-muted">{t.addHelp}</p>
            <LocationForm organizationId={orgId} />
          </Card>
        ) : null}
      </div>
    </>
  );
}

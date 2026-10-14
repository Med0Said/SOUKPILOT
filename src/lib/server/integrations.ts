import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { IntegrationKey } from "@/lib/supabase/database.types";

/** Integrations switched on for this organization (RLS: members only). */
export async function enabledIntegrations(organizationId: string): Promise<Set<IntegrationKey>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("organization_integrations").select("integration, enabled").eq("organization_id", organizationId);
  return new Set((data ?? []).filter((r) => r.enabled).map((r) => r.integration));
}

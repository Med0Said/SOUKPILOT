import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { IntegrationKey } from "@/lib/supabase/database.types";
import { logger } from "@/lib/logger";

/** Integrations switched on for this organization (RLS: members only). */
export async function enabledIntegrations(organizationId: string): Promise<Set<IntegrationKey>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("organization_integrations").select("integration, enabled").eq("organization_id", organizationId);
  // On failure every integration counts as off: the safe default.
  if (error) logger.warn("integrations.switches_load_failed", { organizationId, code: error.code });
  return new Set((data ?? []).filter((r) => r.enabled).map((r) => r.integration));
}

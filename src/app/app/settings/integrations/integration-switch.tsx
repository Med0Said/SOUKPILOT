"use client";

import { useActionState } from "react";
import { setIntegrationAction } from "@/app/_actions/integrations";
import { initialActionState } from "@/lib/actions";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import type { IntegrationKey } from "@/lib/supabase/database.types";
import { fr } from "@/i18n/fr";

/** Owner's on/off switch for one integration (server-enforced, audited). */
export function IntegrationSwitch({ organizationId, integration, enabled }: { organizationId: string; integration: IntegrationKey; enabled: boolean }) {
  const [state, action] = useActionState(setIntegrationAction, initialActionState);
  const t = fr.integrations;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="integration" value={integration} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <SubmitButton variant={enabled ? "secondary" : "primary"}>
        {enabled ? t.disable : t.enable}
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

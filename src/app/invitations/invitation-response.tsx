"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { respondToInvitationAction } from "@/app/_actions/organizations";
import { fr } from "@/i18n/fr";

export function InvitationResponse({ invitationId }: { invitationId: string }) {
  const [state, action] = useActionState(respondToInvitationAction, initialActionState);
  return (
    <form action={action} className="mt-3 space-y-3">
      <ActionMessage state={state} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="accept">
          {fr.invitations.accept}
        </SubmitButton>
        <SubmitButton name="decision" value="decline" variant="secondary">
          {fr.invitations.decline}
        </SubmitButton>
      </div>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { TextField } from "@/components/ui/field";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { updateOrganizationAction } from "@/app/_actions/organizations";
import { fr } from "@/i18n/fr";

export function OrganizationForm({
  organizationId,
  name,
  timezone,
  disabled,
}: {
  organizationId: string;
  name: string;
  timezone: string;
  disabled: boolean;
}) {
  const [state, action] = useActionState(updateOrganizationAction, initialActionState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <ActionMessage state={state} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <TextField
        id="name"
        label={fr.onboarding.orgName}
        defaultValue={state.values?.name ?? name}
        disabled={disabled}
        required
        error={state.fieldErrors?.name}
      />
      <TextField
        id="timezone"
        label={fr.onboarding.timezone}
        defaultValue={state.values?.timezone ?? timezone}
        hint="Ex. : Africa/Tunis"
        disabled={disabled}
        required
        error={state.fieldErrors?.timezone}
      />
      {disabled ? null : <SubmitButton>{fr.settings.save}</SubmitButton>}
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { SelectField, TextField } from "@/components/ui/field";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { COMMON_TIME_ZONES } from "@/lib/validation/schemas";
import { createOrganizationAction } from "@/app/_actions/organizations";
import { fr } from "@/i18n/fr";

const t = fr.onboarding;

export function CreateOrganizationForm() {
  const [state, action] = useActionState(createOrganizationAction, initialActionState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <ActionMessage state={state} />
      <TextField
        id="name"
        label={t.orgName}
        placeholder={t.orgNamePlaceholder}
        autoComplete="organization"
        required
        defaultValue={state.values?.name}
        error={state.fieldErrors?.name}
      />
      <TextField
        id="locationName"
        label={t.locationName}
        required
        defaultValue={state.values?.locationName ?? "Boutique principale"}
        error={state.fieldErrors?.locationName}
      />
      <SelectField
        id="timezone"
        label={t.timezone}
        defaultValue={state.values?.timezone ?? "Africa/Tunis"}
        error={state.fieldErrors?.timezone}
        options={COMMON_TIME_ZONES.map((zone) => ({ value: zone, label: zone }))}
      />
      <SubmitButton className="w-full">{t.submit}</SubmitButton>
    </form>
  );
}

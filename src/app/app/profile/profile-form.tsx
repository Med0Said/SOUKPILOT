"use client";

import { useActionState } from "react";
import { TextField } from "@/components/ui/field";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { updateProfileAction } from "@/app/_actions/organizations";
import { fr } from "@/i18n/fr";

export function ProfileForm({ email, fullName, phone }: { email: string; fullName: string; phone: string }) {
  const [state, action] = useActionState(updateProfileAction, initialActionState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <ActionMessage state={state} />
      <TextField id="email" label={fr.auth.email} value={email} readOnly disabled />
      <TextField
        id="fullName"
        label={fr.auth.fullName}
        autoComplete="name"
        defaultValue={state.values?.fullName ?? fullName}
        error={state.fieldErrors?.fullName}
      />
      <TextField
        id="phone"
        type="tel"
        inputMode="tel"
        label={fr.profile.phone}
        hint={fr.profile.phoneHint}
        autoComplete="tel"
        defaultValue={state.values?.phone ?? phone}
        error={state.fieldErrors?.phone}
      />
      <SubmitButton>{fr.settings.save}</SubmitButton>
    </form>
  );
}

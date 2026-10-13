"use client";

import { useActionState } from "react";
import { CheckboxField, TextField } from "@/components/ui/field";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { saveLocationAction } from "@/app/_actions/catalog";
import { fr } from "@/i18n/fr";

type Location = { id: string; name: string; code: string | null; isActive: boolean };

export function LocationForm({ organizationId, location }: { organizationId: string; location?: Location }) {
  const [state, action] = useActionState(saveLocationAction, initialActionState);
  const prefix = location ? `loc-${location.id}` : "loc-new";
  return (
    <form action={action} className="space-y-3" noValidate>
      <ActionMessage state={state} />
      <input type="hidden" name="organizationId" value={organizationId} />
      {location ? <input type="hidden" name="locationId" value={location.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <TextField
          id={`${prefix}-name`}
          name="name"
          label={fr.locations.name}
          required
          defaultValue={state.values?.name ?? location?.name}
          error={state.fieldErrors?.name}
        />
        <TextField
          id={`${prefix}-code`}
          name="code"
          label={fr.locations.code}
          hint={fr.locations.codeHint}
          defaultValue={state.values?.code ?? location?.code ?? ""}
          error={state.fieldErrors?.code}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CheckboxField id={`${prefix}-active`} name="isActive" label={fr.settings.active} defaultChecked={location?.isActive ?? true} />
        <SubmitButton variant={location ? "secondary" : "primary"}>{location ? fr.settings.save : fr.locations.add}</SubmitButton>
      </div>
    </form>
  );
}

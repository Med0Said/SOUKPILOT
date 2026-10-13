"use client";

import { useActionState } from "react";
import { SelectField, TextField } from "@/components/ui/field";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { createCountAction } from "@/app/_actions/stock";
import { fr } from "@/i18n/fr";

export function CreateCountForm({
  organizationId,
  idempotencyKey,
  locations,
}: {
  organizationId: string;
  idempotencyKey: string;
  locations: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(createCountAction, initialActionState);
  const t = fr.stock.counts;
  return (
    <form action={action} className="space-y-3" noValidate>
      <ActionMessage state={state} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          id="count-location"
          name="locationId"
          label={fr.stock.form.location}
          options={locations.map((l) => ({ value: l.id, label: l.name }))}
          error={state.fieldErrors?.locationId}
        />
        <TextField id="count-note" name="note" label={t.note} placeholder={t.notePlaceholder} error={state.fieldErrors?.note} />
      </div>
      <p className="text-xs text-muted">{t.createHelp}</p>
      <SubmitButton>{t.create}</SubmitButton>
    </form>
  );
}

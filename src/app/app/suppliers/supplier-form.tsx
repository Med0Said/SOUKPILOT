"use client";

import { useActionState } from "react";
import { CheckboxField, TextAreaField, TextField } from "@/components/ui/field";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { saveSupplierAction } from "@/app/_actions/catalog";
import { fr } from "@/i18n/fr";

type Supplier = { id: string; name: string; phone: string; email: string; notes: string; isActive: boolean };

export function SupplierForm({ organizationId, supplier }: { organizationId: string; supplier?: Supplier }) {
  const [state, action] = useActionState(saveSupplierAction, initialActionState);
  const t = fr.suppliersPage;
  const p = supplier ? `sup-${supplier.id}` : "sup-new";
  const v = state.values;
  return (
    <form action={action} className="space-y-3" noValidate>
      <ActionMessage state={state} />
      <input type="hidden" name="organizationId" value={organizationId} />
      {supplier ? <input type="hidden" name="supplierId" value={supplier.id} /> : null}
      <TextField id={`${p}-name`} name="name" label={t.name} required defaultValue={v?.name ?? supplier?.name} error={state.fieldErrors?.name} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          id={`${p}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          label={t.phone}
          defaultValue={v?.phone ?? supplier?.phone}
          error={state.fieldErrors?.phone}
        />
        <TextField
          id={`${p}-email`}
          name="email"
          type="email"
          inputMode="email"
          label={t.email}
          defaultValue={v?.email ?? supplier?.email}
          error={state.fieldErrors?.email}
        />
      </div>
      <TextAreaField id={`${p}-notes`} name="notes" label={t.notes} defaultValue={v?.notes ?? supplier?.notes} error={state.fieldErrors?.notes} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CheckboxField id={`${p}-active`} name="isActive" label={fr.settings.active} defaultChecked={supplier?.isActive ?? true} />
        <SubmitButton variant={supplier ? "secondary" : "primary"}>{supplier ? fr.settings.save : t.create}</SubmitButton>
      </div>
    </form>
  );
}

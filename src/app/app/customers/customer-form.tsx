"use client";

import { useActionState } from "react";
import { CheckboxField, TextAreaField, TextField } from "@/components/ui/field";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { saveCustomerAction } from "@/app/_actions/sales";
import { fr } from "@/i18n/fr";

type Customer = { id: string; name: string; phone: string; address: string; notes: string; isActive: boolean };

export function CustomerForm({ organizationId, customer }: { organizationId: string; customer?: Customer }) {
  const [state, action] = useActionState(saveCustomerAction, initialActionState);
  const t = fr.customers;
  const p = customer ? `cus-${customer.id}` : "cus-new";
  const v = state.values;
  return (
    <form action={action} className="space-y-3" noValidate>
      <ActionMessage state={state} />
      <input type="hidden" name="organizationId" value={organizationId} />
      {customer ? <input type="hidden" name="customerId" value={customer.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField id={`${p}-name`} name="name" label={t.name} required defaultValue={v?.name ?? customer?.name} error={state.fieldErrors?.name} />
        <TextField
          id={`${p}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          label={t.phone}
          defaultValue={v?.phone ?? customer?.phone}
          error={state.fieldErrors?.phone}
        />
      </div>
      <TextField id={`${p}-address`} name="address" label={t.address} defaultValue={v?.address ?? customer?.address} error={state.fieldErrors?.address} />
      <TextAreaField id={`${p}-notes`} name="notes" label={t.notes} defaultValue={v?.notes ?? customer?.notes} error={state.fieldErrors?.notes} />
      <p className="text-xs text-muted">{t.privacy}</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {customer ? <CheckboxField id={`${p}-active`} name="isActive" label={fr.settings.active} defaultChecked={customer.isActive} /> : <span />}
        <SubmitButton variant={customer ? "secondary" : "primary"}>{customer ? fr.settings.save : t.create}</SubmitButton>
      </div>
    </form>
  );
}

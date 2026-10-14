"use client";

import { useActionState } from "react";
import { SelectField, TextField } from "@/components/ui/field";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { supplierPaymentAction } from "@/app/_actions/purchasing";
import { fr } from "@/i18n/fr";

export function SupplierPaymentForm({
  organizationId,
  supplierId,
  idempotencyKey,
  today,
  methods,
}: {
  organizationId: string;
  supplierId: string;
  idempotencyKey: string;
  today: string;
  methods: { id: string; label: string }[];
}) {
  const [state, action] = useActionState(supplierPaymentAction, initialActionState);
  const t = fr.purchases.supplier;
  const v = state.values;
  return (
    <form action={action} className="space-y-3" noValidate>
      <ActionMessage state={state} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          id="sp-kind"
          name="kind"
          label={t.kind}
          defaultValue={v?.kind ?? "payment"}
          options={[
            { value: "payment", label: t.payment },
            { value: "refund", label: t.refundReceived },
          ]}
        />
        <SelectField
          id="sp-method"
          name="methodId"
          label={fr.sales.cart.method}
          defaultValue={v?.methodId}
          options={methods.map((m) => ({ value: m.id, label: m.label }))}
          error={state.fieldErrors?.methodId}
        />
        <TextField id="sp-amount" name="amount" label={fr.sales.cart.amount} inputMode="decimal" defaultValue={v?.amount} error={state.fieldErrors?.amount} />
        <TextField id="sp-date" name="paidOn" type="date" label={t.date} defaultValue={v?.paidOn ?? today} error={state.fieldErrors?.paidOn} />
        <TextField id="sp-ref" name="reference" label={t.reference} placeholder={t.referencePlaceholder} defaultValue={v?.reference} />
        <TextField id="sp-note" name="note" label={fr.stock.form.note} defaultValue={v?.note} />
      </div>
      <SubmitButton confirmMessage={t.confirm}>{t.record}</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { formatBps } from "@/lib/domain/pricing";
import { savePaymentMethodAction, updateDiscountSettingAction } from "@/app/_actions/sales";
import { fr } from "@/i18n/fr";

const t = fr.paymentMethods;
const KINDS = ["cash", "card", "transfer", "check", "mobile", "other"] as const;

type Method = { id: string; label: string; kind: string; sortOrder: number; isActive: boolean };

export function PaymentMethodForm({ organizationId, method }: { organizationId: string; method?: Method }) {
  const [state, action] = useActionState(savePaymentMethodAction, initialActionState);
  const p = method ? `pm-${method.id}` : "pm-new";
  return (
    <form action={action} className="space-y-3" noValidate>
      <ActionMessage state={state} />
      <input type="hidden" name="organizationId" value={organizationId} />
      {method ? <input type="hidden" name="methodId" value={method.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_7rem]">
        <TextField id={`${p}-label`} name="label" label={t.label} defaultValue={state.values?.label ?? method?.label} error={state.fieldErrors?.label} />
        <SelectField
          id={`${p}-kind`}
          name="kind"
          label={t.kind}
          defaultValue={method?.kind ?? "other"}
          options={KINDS.map((k) => ({ value: k, label: t.kinds[k] }))}
        />
        <TextField
          id={`${p}-order`}
          name="sortOrder"
          label={t.order}
          inputMode="numeric"
          defaultValue={state.values?.sortOrder ?? String(method?.sortOrder ?? 50)}
          error={state.fieldErrors?.sortOrder}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CheckboxField id={`${p}-active`} name="isActive" label={fr.settings.active} defaultChecked={method?.isActive ?? true} />
        <SubmitButton variant={method ? "secondary" : "primary"}>{method ? fr.settings.save : t.create}</SubmitButton>
      </div>
    </form>
  );
}

export function DiscountSettingForm({ organizationId, currentBps }: { organizationId: string; currentBps: number }) {
  const [state, action] = useActionState(updateDiscountSettingAction, initialActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
      <ActionMessage state={state} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="w-40">
        <TextField
          id="max-discount"
          name="maxDiscount"
          label={t.discountLabel}
          inputMode="decimal"
          defaultValue={state.values?.maxDiscount ?? formatBps(currentBps).replace(" %", "")}
          error={state.fieldErrors?.maxDiscount}
        />
      </div>
      <SubmitButton variant="secondary">{fr.settings.save}</SubmitButton>
    </form>
  );
}

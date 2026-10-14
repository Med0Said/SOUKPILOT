"use client";

import { useActionState, useState } from "react";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { formatTnd, formatTndInput } from "@/lib/domain/money";
import { recordPaymentAction, refundAction, returnAction } from "@/app/_actions/sales";
import { fr } from "@/i18n/fr";

const t = fr.sales.detail;
type Method = { id: string; label: string };

export function PaymentForm({
  mode,
  saleId,
  methods,
  due,
  idempotencyKey,
}: {
  mode: "payment" | "refund";
  saleId: string;
  methods: Method[];
  due: number;
  idempotencyKey: string;
}) {
  const [state, action] = useActionState(mode === "payment" ? recordPaymentAction : refundAction, initialActionState);
  return (
    <form action={action} className="space-y-3 rounded-lg bg-background p-3" noValidate>
      <h3 className="text-sm font-semibold">{mode === "payment" ? t.addPayment : t.addRefund}</h3>
      <ActionMessage state={state} />
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          id={`${mode}-method`}
          name="methodId"
          label={fr.sales.cart.method}
          options={methods.map((m) => ({ value: m.id, label: m.label }))}
          error={state.fieldErrors?.methodId}
        />
        <TextField
          id={`${mode}-amount`}
          name="amount"
          label={fr.sales.cart.amount}
          inputMode="decimal"
          defaultValue={formatTndInput(due)}
          hint={mode === "payment" ? t.dueHint(formatTnd(due)) : t.owedHint(formatTnd(due))}
          error={state.fieldErrors?.amount}
        />
      </div>
      <SubmitButton variant={mode === "payment" ? "primary" : "secondary"} confirmMessage={mode === "refund" ? t.confirmRefund : undefined}>
        {mode === "payment" ? t.recordPayment : t.recordRefund}
      </SubmitButton>
    </form>
  );
}

type Item = { id: string; label: string; remaining: number; trackStock: boolean };

export function ReturnForm({
  saleId,
  idempotencyKey,
  items,
  methods,
}: {
  saleId: string;
  idempotencyKey: string;
  items: Item[];
  methods: Method[];
}) {
  const [state, action] = useActionState(returnAction, initialActionState);
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState(items.map((i) => ({ saleItemId: i.id, quantity: "", restock: i.trackStock })));
  const [refundMethodId, setRefundMethodId] = useState(methods[0]?.id ?? "");
  const [refundAmount, setRefundAmount] = useState("");
  const errors = state.fieldErrors ?? {};

  const payload = JSON.stringify({
    saleId,
    idempotencyKey,
    reason,
    lines: lines.map((l) => ({ ...l, quantity: l.quantity.trim() === "" ? "0" : l.quantity })),
    refundMethodId: refundAmount.trim() ? refundMethodId : "",
    refundAmount,
  });

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="payload" value={payload} />
      <ActionMessage state={state} />
      {errors.lines ? <p className="text-sm text-danger">{errors.lines}</p> : null}
      <ul className="space-y-3">
        {items.map((item, index) => (
          <li key={item.id} className="rounded-lg border border-border p-3">
            <p className="mb-2 text-sm font-medium">
              {item.label} <span className="text-muted">({t.returnable(item.remaining)})</span>
            </p>
            <div className="grid grid-cols-2 items-end gap-3">
              <TextField
                id={`ret-${item.id}`}
                label={fr.stock.form.quantity}
                inputMode="numeric"
                placeholder="0"
                value={lines[index].quantity}
                onChange={(e) => setLines((ls) => ls.map((l, i) => (i === index ? { ...l, quantity: e.target.value } : l)))}
                error={errors[`lines.${index}.quantity`]}
              />
              {item.trackStock ? (
                <CheckboxField
                  id={`restock-${item.id}`}
                  label={t.restock}
                  hint={t.restockHint}
                  checked={lines[index].restock}
                  onChange={(e) => setLines((ls) => ls.map((l, i) => (i === index ? { ...l, restock: e.target.checked } : l)))}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <TextField
        id="return-reason"
        label={fr.stock.form.reason}
        placeholder={t.reasonPlaceholder}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={errors.reason}
      />
      <div className="grid gap-3 rounded-lg bg-background p-3 sm:grid-cols-2">
        <SelectField
          id="refund-method"
          label={t.refundMethod}
          value={refundMethodId}
          onChange={(e) => setRefundMethodId(e.target.value)}
          options={methods.map((m) => ({ value: m.id, label: m.label }))}
          error={errors.refundMethodId}
        />
        <TextField
          id="refund-amount"
          label={t.refundNow}
          hint={t.refundNowHint}
          inputMode="decimal"
          placeholder="0,000"
          value={refundAmount}
          onChange={(e) => setRefundAmount(e.target.value)}
          error={errors.refundAmount}
        />
      </div>
      <SubmitButton variant="danger" confirmMessage={t.confirmReturn}>
        {t.submitReturn}
      </SubmitButton>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { CheckboxField, TextField } from "@/components/ui/field";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { formatTnd, formatTndInput } from "@/lib/domain/money";
import { purchaseOrderTransitionAction, receivePurchaseOrderAction } from "@/app/_actions/purchasing";
import type { PurchaseOrderStatus } from "@/lib/supabase/database.types";
import { fr } from "@/i18n/fr";

const t = fr.purchases.detail;

export function PoTransitions({ purchaseOrderId, status }: { purchaseOrderId: string; status: PurchaseOrderStatus }) {
  const [state, action] = useActionState(purchaseOrderTransitionAction, initialActionState);
  return (
    <form action={action} className="flex flex-wrap gap-2">
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      {status === "draft" ? (
        <SubmitButton name="step" value="place" confirmMessage={t.confirmPlace}>
          {t.place}
        </SubmitButton>
      ) : null}
      {status === "draft" || status === "ordered" ? (
        <SubmitButton name="step" value="cancel" variant="danger" confirmMessage={t.confirmCancel}>
          {t.cancel}
        </SubmitButton>
      ) : null}
      {status === "partially_received" ? (
        <SubmitButton name="step" value="close" variant="secondary" confirmMessage={t.confirmClose}>
          {t.close}
        </SubmitButton>
      ) : null}
      <div className="w-full">
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

type Item = { id: string; label: string; remaining: number; unitCost: number };

export function ReceiveForm({ purchaseOrderId, idempotencyKey, items }: { purchaseOrderId: string; idempotencyKey: string; items: Item[] }) {
  const [state, action] = useActionState(receivePurchaseOrderAction, initialActionState);
  const [lines, setLines] = useState(items.map((i) => ({ itemId: i.id, quantity: String(i.remaining), cost: formatTndInput(i.unitCost) })));
  const [reference, setReference] = useState("");
  const [updateCosts, setUpdateCosts] = useState(true);
  const errors = state.fieldErrors ?? {};
  const payload = JSON.stringify({
    purchaseOrderId,
    idempotencyKey,
    reference,
    updateCosts,
    lines: lines.map((l) => ({ ...l, quantity: l.quantity.trim() === "" ? "0" : l.quantity })),
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
              {item.label} <span className="text-muted">({t.remaining(item.remaining)})</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                id={`rcv-${item.id}`}
                label={t.receivedNow}
                inputMode="numeric"
                value={lines[index].quantity}
                onChange={(e) => setLines((ls) => ls.map((l, i) => (i === index ? { ...l, quantity: e.target.value } : l)))}
                error={errors[`lines.${index}.quantity`]}
              />
              <TextField
                id={`rcv-cost-${item.id}`}
                label={fr.stock.form.unitCost}
                hint={t.orderedCost(formatTnd(item.unitCost))}
                inputMode="decimal"
                value={lines[index].cost}
                onChange={(e) => setLines((ls) => ls.map((l, i) => (i === index ? { ...l, cost: e.target.value } : l)))}
                error={errors[`lines.${index}.cost`]}
              />
            </div>
          </li>
        ))}
      </ul>
      <TextField id="rcv-ref" label={fr.stock.form.reference} placeholder={fr.stock.form.referencePlaceholder} value={reference} onChange={(e) => setReference(e.target.value)} />
      <CheckboxField
        id="rcv-update-costs"
        label={fr.stock.form.updateCosts}
        hint={fr.stock.form.updateCostsHint}
        checked={updateCosts}
        onChange={(e) => setUpdateCosts(e.target.checked)}
      />
      <SubmitButton pendingLabel={fr.stock.form.saving} confirmMessage={t.confirmReceive}>
        {t.receive}
      </SubmitButton>
    </form>
  );
}

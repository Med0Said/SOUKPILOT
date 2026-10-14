"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Alert, ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { variantLabel } from "@/lib/domain/catalog";
import { formatTnd, formatTndInput, parseTnd } from "@/lib/domain/money";
import { savePurchaseOrderAction, variantCostsAction } from "@/app/_actions/purchasing";
import type { VariantSearchResult } from "@/app/_actions/stock";
import { VariantPicker } from "@/app/app/stock/_components/variant-picker";
import { fr } from "@/i18n/fr";

const t = fr.purchases.form;

export type PoLine = { variantId: string; label: string; quantity: string; cost: string };
type Option = { id: string; name: string };

export function PurchaseOrderForm({
  organizationId,
  suppliers,
  locations,
  draft,
}: {
  organizationId: string;
  suppliers: Option[];
  locations: Option[];
  draft?: {
    id: string;
    supplierId: string;
    locationId: string;
    expectedDate: string;
    reference: string;
    note: string;
    lines: PoLine[];
  };
}) {
  const [state, action] = useActionState(savePurchaseOrderAction, initialActionState);
  const id = useId();
  const errors = state.fieldErrors ?? {};
  const [supplierId, setSupplierId] = useState(draft?.supplierId ?? suppliers[0]?.id ?? "");
  const [locationId, setLocationId] = useState(draft?.locationId ?? locations[0]?.id ?? "");
  const [expectedDate, setExpectedDate] = useState(draft?.expectedDate ?? "");
  const [reference, setReference] = useState(draft?.reference ?? "");
  const [note, setNote] = useState(draft?.note ?? "");
  const [lines, setLines] = useState<PoLine[]>(draft?.lines ?? []);
  const [, startLookup] = useTransition();

  function add(v: VariantSearchResult) {
    if (lines.some((l) => l.variantId === v.variantId)) return;
    setLines((c) => [...c, { variantId: v.variantId, label: `${v.productName} — ${variantLabel(v.optionValues)}`, quantity: "1", cost: "" }]);
    // Pre-fill the last known purchase cost.
    startLookup(async () => {
      const costs = await variantCostsAction(organizationId, [v.variantId]);
      const cost = costs[v.variantId];
      if (cost !== null && cost !== undefined) {
        setLines((c) => c.map((l) => (l.variantId === v.variantId && l.cost === "" ? { ...l, cost: formatTndInput(cost) } : l)));
      }
    });
  }
  const update = (variantId: string, patch: Partial<PoLine>) =>
    setLines((c) => c.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)));

  const total = lines.reduce((sum, l) => {
    const q = Number.parseInt(l.quantity, 10);
    const c = parseTnd(l.cost);
    return Number.isInteger(q) && q > 0 && c.ok ? sum + BigInt(q) * BigInt(c.millimes) : sum;
  }, 0n);

  const payload = JSON.stringify({
    organizationId,
    purchaseOrderId: draft?.id ?? "",
    supplierId,
    locationId,
    expectedDate,
    reference,
    note,
    lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, cost: l.cost })),
  });

  if (suppliers.length === 0) return <Alert tone="info">{t.noSupplier}</Alert>;

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="payload" value={payload} />
      <ActionMessage state={state} />
      <section className="grid gap-4 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
        <SelectField
          id={`${id}-supplier`}
          label={t.supplier}
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          error={errors.supplierId}
        />
        <SelectField
          id={`${id}-location`}
          label={t.location}
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          options={locations.map((l) => ({ value: l.id, label: l.name }))}
          error={errors.locationId}
        />
        <TextField
          id={`${id}-date`}
          type="date"
          label={t.expectedDate}
          value={expectedDate}
          onChange={(e) => setExpectedDate(e.target.value)}
          error={errors.expectedDate}
        />
        <TextField id={`${id}-ref`} label={t.reference} value={reference} onChange={(e) => setReference(e.target.value)} error={errors.reference} />
        <div className="sm:col-span-2">
          <TextAreaField id={`${id}-note`} label={t.note} value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} />
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
        <VariantPicker organizationId={organizationId} locationId={locationId || null} onPick={add} excludeIds={new Set(lines.map((l) => l.variantId))} />
        {errors.lines ? <Alert tone="error">{errors.lines}</Alert> : null}
        {lines.length === 0 ? <p className="text-sm text-muted">{fr.stock.form.noLines}</p> : null}
        <ul className="space-y-3">
          {lines.map((l, index) => {
            const e = (f: string) => errors[`lines.${index}.${f}`];
            return (
              <li key={l.variantId} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">{l.label}</p>
                  <Button variant="ghost" onClick={() => setLines((c) => c.filter((x) => x.variantId !== l.variantId))}>
                    {fr.stock.form.remove}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    id={`${id}-${l.variantId}-q`}
                    label={fr.stock.form.quantity}
                    inputMode="numeric"
                    value={l.quantity}
                    onChange={(ev) => update(l.variantId, { quantity: ev.target.value })}
                    error={e("quantity")}
                  />
                  <TextField
                    id={`${id}-${l.variantId}-c`}
                    label={fr.stock.form.unitCost}
                    inputMode="decimal"
                    value={l.cost}
                    onChange={(ev) => update(l.variantId, { cost: ev.target.value })}
                    error={e("cost")}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-end font-semibold tabular-nums">
          {t.total} : {formatTnd(Number(total))}
        </p>
      </section>

      <p className="text-xs text-muted">{t.help}</p>
      <SubmitButton pendingLabel={fr.stock.form.saving}>{draft ? t.update : t.save}</SubmitButton>
    </form>
  );
}

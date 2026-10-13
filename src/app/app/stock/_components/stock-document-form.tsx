"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Alert, ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { variantLabel } from "@/lib/domain/catalog";
import {
  createAdjustmentAction,
  postReceiptAction,
  postTransferAction,
  recordOpeningAction,
  type VariantSearchResult,
} from "@/app/_actions/stock";
import { fr } from "@/i18n/fr";
import { VariantPicker } from "./variant-picker";

export type StockFormMode = "receipt" | "opening" | "adjustment" | "transfer";

type Option = { id: string; name: string };
type Line = {
  variantId: string;
  label: string;
  available: number;
  quantity: string;
  cost: string;
  direction: "in" | "out";
};

const ACTIONS = {
  receipt: postReceiptAction,
  opening: recordOpeningAction,
  adjustment: createAdjustmentAction,
  transfer: postTransferAction,
} as const;

const t = fr.stock.form;

export function StockDocumentForm({
  mode,
  organizationId,
  idempotencyKey,
  locations,
  suppliers = [],
}: {
  mode: StockFormMode;
  organizationId: string;
  idempotencyKey: string;
  locations: Option[];
  suppliers?: Option[];
}) {
  const [state, action] = useActionState(ACTIONS[mode], initialActionState);
  const formId = useId();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [toLocationId, setToLocationId] = useState(locations[1]?.id ?? "");
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [updateCosts, setUpdateCosts] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const errors = state.fieldErrors ?? {};
  const withCost = mode === "receipt" || mode === "opening";

  function add(variant: VariantSearchResult) {
    setLines((current) =>
      current.some((l) => l.variantId === variant.variantId)
        ? current
        : [
            ...current,
            {
              variantId: variant.variantId,
              label: `${variant.productName} — ${variantLabel(variant.optionValues)}`,
              available: variant.quantity,
              quantity: mode === "adjustment" ? "" : "1",
              cost: "",
              direction: "out",
            },
          ],
    );
  }

  const update = (variantId: string, patch: Partial<Line>) =>
    setLines((current) => current.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)));

  const quantityFor = (l: Line) =>
    mode === "adjustment" && l.direction === "out" && l.quantity.trim() !== "" ? `-${l.quantity.trim()}` : l.quantity;

  const payload = JSON.stringify({
    organizationId,
    idempotencyKey,
    ...(mode === "transfer" ? { fromLocationId: locationId, toLocationId } : { locationId }),
    ...(mode === "receipt" ? { supplierId, reference, note, updateCosts } : {}),
    ...(mode === "transfer" ? { note } : {}),
    ...(mode === "adjustment" ? { reason } : {}),
    lines: lines.map((l) => ({
      variantId: l.variantId,
      quantity: quantityFor(l),
      ...(withCost ? { cost: l.cost } : {}),
    })),
  });

  const locationOptions = locations.map((l) => ({ value: l.id, label: l.name }));

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="payload" value={payload} />
      <ActionMessage state={state} />

      <section className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id={`${formId}-location`}
            label={mode === "transfer" ? t.from : t.location}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            options={locationOptions}
            error={errors.locationId ?? errors.fromLocationId}
          />
          {mode === "transfer" ? (
            <SelectField
              id={`${formId}-to`}
              label={t.to}
              value={toLocationId}
              onChange={(e) => setToLocationId(e.target.value)}
              options={locationOptions}
              error={errors.toLocationId}
            />
          ) : null}
          {mode === "receipt" ? (
            <SelectField
              id={`${formId}-supplier`}
              label={t.supplier}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              options={[{ value: "", label: fr.productForm.none }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
            />
          ) : null}
          {mode === "receipt" ? (
            <TextField
              id={`${formId}-reference`}
              label={t.reference}
              placeholder={t.referencePlaceholder}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              error={errors.reference}
            />
          ) : null}
        </div>
        {mode === "adjustment" ? (
          <TextField
            id={`${formId}-reason`}
            label={t.reason}
            placeholder={t.reasonPlaceholder}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            error={errors.reason}
          />
        ) : null}
        {mode === "receipt" || mode === "transfer" ? (
          <TextAreaField id={`${formId}-note`} label={t.note} value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} />
        ) : null}
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-6">
        <VariantPicker
          organizationId={organizationId}
          locationId={locationId || null}
          onPick={add}
          excludeIds={new Set(lines.map((l) => l.variantId))}
        />
        {errors.lines ? <Alert tone="error">{errors.lines}</Alert> : null}
        {lines.length === 0 ? <p className="text-sm text-muted">{t.noLines}</p> : null}
        <ul className="space-y-3">
          {lines.map((l, index) => {
            const e = (field: string) => errors[`lines.${index}.${field}`];
            return (
              <li key={l.variantId} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.label}</p>
                    <p className="text-xs text-muted">{t.available(l.available)}</p>
                  </div>
                  <Button variant="ghost" onClick={() => setLines((c) => c.filter((x) => x.variantId !== l.variantId))}>
                    {t.remove}
                  </Button>
                </div>
                {e("variantId") ? <p className="mb-2 text-sm text-danger">{e("variantId")}</p> : null}
                <div className="grid gap-3 sm:grid-cols-3">
                  {mode === "adjustment" ? (
                    <SelectField
                      id={`${formId}-${l.variantId}-dir`}
                      label={t.direction}
                      value={l.direction}
                      onChange={(ev) => update(l.variantId, { direction: ev.target.value as Line["direction"] })}
                      options={[
                        { value: "out", label: t.out },
                        { value: "in", label: t.in },
                      ]}
                    />
                  ) : null}
                  <TextField
                    id={`${formId}-${l.variantId}-qty`}
                    label={t.quantity}
                    inputMode="numeric"
                    value={l.quantity}
                    onChange={(ev) => update(l.variantId, { quantity: ev.target.value })}
                    error={e("quantity")}
                  />
                  {withCost ? (
                    <TextField
                      id={`${formId}-${l.variantId}-cost`}
                      label={t.unitCost}
                      inputMode="decimal"
                      placeholder={fr.productForm.unknown}
                      value={l.cost}
                      onChange={(ev) => update(l.variantId, { cost: ev.target.value })}
                      error={e("cost")}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {mode === "receipt" ? (
          <CheckboxField
            id={`${formId}-update-costs`}
            label={t.updateCosts}
            hint={t.updateCostsHint}
            checked={updateCosts}
            onChange={(e) => setUpdateCosts(e.target.checked)}
          />
        ) : null}
      </section>

      <p className="text-xs text-muted">{t.help[mode]}</p>
      <SubmitButton className="w-full sm:w-auto" pendingLabel={t.saving} confirmMessage={t.confirm[mode]}>
        {t.submit[mode]}
      </SubmitButton>
    </form>
  );
}

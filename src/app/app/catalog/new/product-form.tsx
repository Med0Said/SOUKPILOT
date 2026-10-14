"use client";

import { useActionState, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { BarcodeLookup } from "@/components/integrations/barcode-lookup";
import { Alert, ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { LIMITS, cleanText, combinations, optionsKey, variantLabel } from "@/lib/domain/catalog";
import { createProductAction } from "@/app/_actions/catalog";
import { fr } from "@/i18n/fr";

type Option = { name: string; values: string };
type VariantRow = {
  key: string;
  optionValues: string[];
  sku: string;
  barcode: string;
  price: string;
  cost: string;
  threshold: string;
};

const t = fr.productForm;

function newRow(key: string, optionValues: string[], price = "", cost = ""): VariantRow {
  return { key, optionValues, sku: "", barcode: "", price, cost, threshold: "" };
}

function splitValues(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(/[,;\n]/)
    .map(cleanText)
    .filter((v) => v !== "" && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()));
}

export function ProductForm({
  organizationId,
  categories,
  suppliers,
  barcodeLookup = false,
}: {
  organizationId: string;
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  /** Barcode pre-fill integration switched on for this organization. */
  barcodeLookup?: boolean;
}) {
  const [state, action] = useActionState(createProductAction, initialActionState);
  const formId = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [trackStock, setTrackStock] = useState(true);
  const [options, setOptions] = useState<Option[]>([]);
  const [defaultPrice, setDefaultPrice] = useState("");
  const [defaultCost, setDefaultCost] = useState("");
  // Deterministic keys (they feed element ids, which must match between server and client).
  const nextKey = useRef(1);
  const makeKey = () => `v${nextKey.current++}`;
  const [variants, setVariants] = useState<VariantRow[]>([newRow("v0", [])]);

  const errors = state.fieldErrors ?? {};
  const optionNames = options.map((o) => cleanText(o.name));
  const outOfSync = variants.some((v) => v.optionValues.length !== options.length);

  function generate() {
    const lists = options.map((o) => splitValues(o.values));
    if (lists.some((l) => l.length === 0)) return;
    const existing = new Map(variants.map((v) => [optionsKey(v.optionValues), v]));
    const combos = combinations(lists).slice(0, LIMITS.maxVariantsPerProduct);
    setVariants(combos.map((combo) => existing.get(optionsKey(combo)) ?? newRow(makeKey(), combo, defaultPrice, defaultCost)));
  }

  function updateVariant(key: string, patch: Partial<VariantRow>) {
    setVariants((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const payload = JSON.stringify({
    organizationId,
    name,
    description,
    categoryId,
    supplierId,
    trackStock,
    optionNames,
    variants: variants.map((v) => ({
      sku: v.sku,
      barcode: v.barcode,
      optionValues: v.optionValues,
      price: v.price,
      cost: v.cost,
      threshold: v.threshold,
    })),
  });

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="payload" value={payload} />
      <ActionMessage state={state} />

      <section className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-6">
        <h2 className="font-semibold">{t.general}</h2>
        <TextField id={`${formId}-name`} label={t.name} value={name} onChange={(e) => setName(e.target.value)} required error={errors.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id={`${formId}-category`}
            label={t.category}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={[{ value: "", label: t.none }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <SelectField
            id={`${formId}-supplier`}
            label={t.supplier}
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            options={[{ value: "", label: t.none }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
          />
        </div>
        <TextAreaField
          id={`${formId}-description`}
          label={t.description}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
        />
        <CheckboxField
          id={`${formId}-track`}
          label={t.trackStock}
          hint={t.trackStockHint}
          checked={trackStock}
          onChange={(e) => setTrackStock(e.target.checked)}
        />
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-6">
        <div>
          <h2 className="font-semibold">{t.options}</h2>
          <p className="text-sm text-muted">{t.optionsHelp}</p>
        </div>
        {errors.optionNames ? <Alert tone="error">{errors.optionNames}</Alert> : null}
        {options.map((option, index) => (
          <div key={index} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
            <TextField
              id={`${formId}-opt-${index}-name`}
              label={t.optionName}
              placeholder={t.optionNamePlaceholder}
              value={option.name}
              onChange={(e) => setOptions((opts) => opts.map((o, i) => (i === index ? { ...o, name: e.target.value } : o)))}
            />
            <TextField
              id={`${formId}-opt-${index}-values`}
              label={t.optionValues}
              placeholder={t.optionValuesPlaceholder}
              value={option.values}
              onChange={(e) => setOptions((opts) => opts.map((o, i) => (i === index ? { ...o, values: e.target.value } : o)))}
            />
            <Button variant="ghost" onClick={() => setOptions((opts) => opts.filter((_, i) => i !== index))}>
              {t.removeOption}
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {options.length < LIMITS.maxOptions ? (
            <Button variant="secondary" onClick={() => setOptions((opts) => [...opts, { name: "", values: "" }])}>
              {t.addOption}
            </Button>
          ) : null}
        </div>
        {options.length > 0 ? (
          <div className="grid gap-3 rounded-lg bg-background p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <TextField
              id={`${formId}-default-price`}
              label={t.defaultPrice}
              inputMode="decimal"
              value={defaultPrice}
              onChange={(e) => setDefaultPrice(e.target.value)}
            />
            <TextField
              id={`${formId}-default-cost`}
              label={t.defaultCost}
              inputMode="decimal"
              value={defaultCost}
              onChange={(e) => setDefaultCost(e.target.value)}
            />
            <Button onClick={generate}>{t.generate}</Button>
          </div>
        ) : null}
        {options.length === 0 && variants.length !== 1 ? (
          <Button variant="secondary" onClick={() => setVariants([newRow(makeKey(), [])])}>
            {t.singleVariant}
          </Button>
        ) : null}
        {outOfSync ? <Alert tone="info">{t.regenerate}</Alert> : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">{t.variants(variants.length)}</h2>
        {errors.variants ? <Alert tone="error">{errors.variants}</Alert> : null}
        {variants.map((v, index) => {
          const e = (field: string) => errors[`variants.${index}.${field}`];
          return (
            <fieldset key={v.key} className="rounded-xl border border-border bg-surface p-4">
              <legend className="px-1 text-sm font-medium">{variantLabel(v.optionValues)}</legend>
              {e("optionValues") ? <p className="mb-2 text-sm text-danger">{e("optionValues")}</p> : null}
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField
                  id={`${v.key}-price`}
                  label={t.price}
                  inputMode="decimal"
                  placeholder="0,000"
                  value={v.price}
                  onChange={(ev) => updateVariant(v.key, { price: ev.target.value })}
                  required
                  error={e("price")}
                />
                <TextField
                  id={`${v.key}-cost`}
                  label={t.cost}
                  inputMode="decimal"
                  placeholder={t.unknown}
                  value={v.cost}
                  onChange={(ev) => updateVariant(v.key, { cost: ev.target.value })}
                  error={e("cost")}
                />
                <TextField
                  id={`${v.key}-threshold`}
                  label={t.threshold}
                  inputMode="numeric"
                  value={v.threshold}
                  onChange={(ev) => updateVariant(v.key, { threshold: ev.target.value })}
                  error={e("threshold")}
                />
                <TextField
                  id={`${v.key}-sku`}
                  label={t.sku}
                  value={v.sku}
                  onChange={(ev) => updateVariant(v.key, { sku: ev.target.value })}
                  error={e("sku")}
                />
                <TextField
                  id={`${v.key}-barcode`}
                  label={t.barcode}
                  inputMode="numeric"
                  value={v.barcode}
                  onChange={(ev) => updateVariant(v.key, { barcode: ev.target.value })}
                  error={e("barcode")}
                />
                {barcodeLookup ? <BarcodeLookup organizationId={organizationId} code={v.barcode} onUseName={setName} /> : null}
                {variants.length > 1 ? (
                  <div className="flex items-end">
                    <Button variant="ghost" onClick={() => setVariants((rows) => rows.filter((r) => r.key !== v.key))}>
                      {t.removeVariant}
                    </Button>
                  </div>
                ) : null}
              </div>
            </fieldset>
          );
        })}
      </section>

      <p className="text-xs text-muted">{t.moneyHint}</p>
      <SubmitButton className="w-full sm:w-auto">{t.submit}</SubmitButton>
    </form>
  );
}

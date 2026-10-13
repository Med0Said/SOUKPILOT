"use client";

import { useActionState, useState } from "react";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { saveVariantAction, updateProductAction } from "@/app/_actions/catalog";
import { fr } from "@/i18n/fr";

const t = fr.productForm;

type Product = {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  supplierId: string;
  trackStock: boolean;
  isActive: boolean;
};

export function ProductEditForm({
  organizationId,
  product,
  categories,
  suppliers,
}: {
  organizationId: string;
  product: Product;
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(updateProductAction, initialActionState);
  const v = state.values;
  return (
    <form action={action} className="space-y-4" noValidate>
      <ActionMessage state={state} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="productId" value={product.id} />
      <TextField id="name" label={t.name} defaultValue={v?.name ?? product.name} required error={state.fieldErrors?.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="categoryId"
          label={t.category}
          defaultValue={v?.categoryId ?? product.categoryId}
          options={[{ value: "", label: t.none }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <SelectField
          id="supplierId"
          label={t.supplier}
          defaultValue={v?.supplierId ?? product.supplierId}
          options={[{ value: "", label: t.none }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
        />
      </div>
      <TextAreaField
        id="description"
        label={t.description}
        defaultValue={v?.description ?? product.description}
        error={state.fieldErrors?.description}
      />
      <div className="flex flex-wrap gap-6">
        <CheckboxField id="trackStock" label={t.trackStock} defaultChecked={product.trackStock} />
        <CheckboxField id="isActive" label={t.active} hint={t.activeHint} defaultChecked={product.isActive} />
      </div>
      <SubmitButton>{fr.settings.save}</SubmitButton>
    </form>
  );
}

type Variant = {
  id: string;
  optionValues: string[];
  sku: string;
  barcode: string;
  price: string;
  cost: string;
  threshold: string;
  isActive: boolean;
};

/** Edits one variant (or adds one when `variant` is omitted), price and cost together. */
export function VariantEditor({
  organizationId,
  productId,
  optionNames,
  variant,
}: {
  organizationId: string;
  productId: string;
  optionNames: string[];
  variant?: Variant;
}) {
  const [state, action] = useActionState(saveVariantAction, initialActionState);
  const prefix = variant ? `var-${variant.id}` : "var-new";
  const [form, setForm] = useState<Omit<Variant, "id">>(
    variant ?? {
      optionValues: optionNames.map(() => ""),
      sku: "",
      barcode: "",
      price: "",
      cost: "",
      threshold: "",
      isActive: true,
    },
  );
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const e = (field: string) => state.fieldErrors?.[`variant.${field}`];

  const payload = JSON.stringify({
    organizationId,
    productId,
    variantId: variant?.id ?? "",
    variant: {
      sku: form.sku,
      barcode: form.barcode,
      optionValues: form.optionValues,
      price: form.price,
      cost: form.cost,
      threshold: form.threshold,
      isActive: form.isActive,
    },
  });

  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="payload" value={payload} />
      <ActionMessage state={state} />
      {optionNames.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {optionNames.map((name, i) => (
            <TextField
              key={name}
              id={`${prefix}-opt-${i}`}
              label={name}
              value={form.optionValues[i] ?? ""}
              onChange={(ev) => set({ optionValues: form.optionValues.map((v, j) => (j === i ? ev.target.value : v)) })}
              error={i === 0 ? e("optionValues") ?? e(`optionValues.${i}`) : e(`optionValues.${i}`)}
            />
          ))}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField id={`${prefix}-price`} label={t.price} inputMode="decimal" value={form.price} onChange={(ev) => set({ price: ev.target.value })} error={e("price")} />
        <TextField
          id={`${prefix}-cost`}
          label={t.cost}
          inputMode="decimal"
          placeholder={t.unknown}
          value={form.cost}
          onChange={(ev) => set({ cost: ev.target.value })}
          error={e("cost")}
        />
        <TextField
          id={`${prefix}-threshold`}
          label={t.threshold}
          inputMode="numeric"
          value={form.threshold}
          onChange={(ev) => set({ threshold: ev.target.value })}
          error={e("threshold")}
        />
        <TextField id={`${prefix}-sku`} label={t.sku} value={form.sku} onChange={(ev) => set({ sku: ev.target.value })} error={e("sku")} />
        <TextField
          id={`${prefix}-barcode`}
          label={t.barcode}
          inputMode="numeric"
          value={form.barcode}
          onChange={(ev) => set({ barcode: ev.target.value })}
          error={e("barcode")}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CheckboxField
          id={`${prefix}-active`}
          label={t.active}
          checked={form.isActive}
          onChange={(ev) => set({ isActive: ev.target.checked })}
        />
        <SubmitButton variant={variant ? "secondary" : "primary"}>{variant ? fr.settings.save : t.addVariantButton}</SubmitButton>
      </div>
    </form>
  );
}

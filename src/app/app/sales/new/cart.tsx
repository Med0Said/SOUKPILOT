"use client";

import { useActionState, useId, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Alert, ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { variantLabel } from "@/lib/domain/catalog";
import { formatTnd, formatTndInput, parseTnd } from "@/lib/domain/money";
import { formatBps, parsePercentToBps, priceSale } from "@/lib/domain/pricing";
import { finalizeSaleAction, quickCreateCustomerAction, saveDraftAction, searchCustomersAction } from "@/app/_actions/sales";
import type { VariantSearchResult } from "@/app/_actions/stock";
import { VariantPicker } from "@/app/app/stock/_components/variant-picker";
import { fr } from "@/i18n/fr";

const t = fr.sales.cart;

export type CartLine = {
  variantId: string;
  label: string;
  unitPriceMillimes: number;
  available: number | null;
  quantity: string;
  discount: string;
};

type Option = { id: string; name: string };
type Method = { id: string; label: string; kind: string };

export function Cart({
  organizationId,
  idempotencyKey,
  locations,
  methods,
  customers: initialCustomers,
  customerSearch = false,
  maxDiscountBps,
  draft,
}: {
  organizationId: string;
  idempotencyKey: string;
  locations: Option[];
  methods: Method[];
  customers: Option[];
  /** The shop has more customers than the dropdown preloads: offer a search. */
  customerSearch?: boolean;
  /** null = no limit (owner/manager). */
  maxDiscountBps: number | null;
  draft?: { saleId: string; locationId: string; customerId: string | null; note: string; orderDiscount: number; lines: CartLine[] };
}) {
  const [finalizeState, finalizeAction] = useActionState(finalizeSaleAction, initialActionState);
  const [draftState, draftAction] = useActionState(saveDraftAction, initialActionState);
  const state = finalizeState.status !== "idle" ? finalizeState : draftState;
  const errors = state.fieldErrors ?? {};
  const id = useId();

  const [locationId, setLocationId] = useState(draft?.locationId ?? locations[0]?.id ?? "");
  const [customers, setCustomers] = useState(initialCustomers);
  const [customerId, setCustomerId] = useState(draft?.customerId ?? "");
  const [note, setNote] = useState(draft?.note ?? "");
  const [orderDiscount, setOrderDiscount] = useState(draft && draft.orderDiscount > 0 ? formatTndInput(draft.orderDiscount) : "");
  const [lines, setLines] = useState<CartLine[]>(draft?.lines ?? []);
  const [payments, setPayments] = useState<{ methodId: string; amount: string }[]>([]);
  const [received, setReceived] = useState("");
  const [newCustomer, setNewCustomer] = useState({ open: false, name: "", phone: "", error: "" });
  const [creating, startCreate] = useTransition();
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<{ id: string; name: string; phone: string | null }[] | null>(null);
  const customerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customerRequest = useRef(0);

  function searchCustomers(value: string) {
    setCustomerQuery(value);
    if (customerTimer.current) clearTimeout(customerTimer.current);
    if (value.trim().length < 2) {
      setCustomerResults(null);
      return;
    }
    const request = ++customerRequest.current;
    customerTimer.current = setTimeout(async () => {
      const found = await searchCustomersAction(organizationId, value);
      if (request === customerRequest.current) setCustomerResults(found);
    }, 250);
  }

  function chooseCustomer(customer: { id: string; name: string }) {
    setCustomers((list) => (list.some((c) => c.id === customer.id) ? list : [{ id: customer.id, name: customer.name }, ...list]));
    setCustomerId(customer.id);
    setCustomerQuery("");
    setCustomerResults(null);
  }

  function add(v: VariantSearchResult) {
    setLines((current) => {
      const existing = current.find((l) => l.variantId === v.variantId);
      if (existing) {
        // Scanning the same article again adds one unit.
        return current.map((l) =>
          l.variantId === v.variantId ? { ...l, quantity: String((Number.parseInt(l.quantity, 10) || 0) + 1) } : l,
        );
      }
      return [
        ...current,
        {
          variantId: v.variantId,
          label: `${v.productName} — ${variantLabel(v.optionValues)}`,
          unitPriceMillimes: v.priceMillimes,
          available: v.trackStock ? v.quantity : null,
          quantity: "1",
          discount: "",
        },
      ];
    });
  }
  const update = (variantId: string, patch: Partial<CartLine>) =>
    setLines((c) => c.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)));

  // Live preview with the same rules as the database (estimate until validated).
  const preview = useMemo(() => {
    try {
      const priced = lines.map((l) => {
        const q = Number.parseInt(l.quantity, 10);
        const bps = parsePercentToBps(l.discount);
        if (!Number.isInteger(q) || q < 1 || bps === null) throw new Error("invalid");
        return { quantity: q, unitPriceMillimes: l.unitPriceMillimes, discountBps: bps };
      });
      const od = orderDiscount.trim() === "" ? 0 : parseTnd(orderDiscount);
      const orderMillimes = typeof od === "number" ? od : od.ok ? od.millimes : null;
      if (orderMillimes === null) throw new Error("invalid");
      return priceSale(priced, orderMillimes);
    } catch {
      return null;
    }
  }, [lines, orderDiscount]);

  const paidMillimes = payments.reduce((sum, p) => {
    const r = parseTnd(p.amount);
    return sum + (r.ok ? r.millimes : 0);
  }, 0);
  const due = preview ? preview.total - paidMillimes : null;
  const cashMethod = methods.find((m) => m.kind === "cash");
  const cashPaid = payments
    .filter((p) => p.methodId === cashMethod?.id)
    .reduce((s, p) => s + (parseTnd(p.amount).ok ? (parseTnd(p.amount) as { millimes: number }).millimes : 0), 0);
  const receivedParsed = parseTnd(received);
  const change = receivedParsed.ok && cashPaid > 0 ? receivedParsed.millimes - cashPaid : null;

  const payload = JSON.stringify({
    organizationId,
    idempotencyKey,
    saleId: draft?.saleId ?? "",
    locationId,
    customerId,
    note,
    orderDiscount,
    lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, discount: l.discount })),
    payments,
  });

  function payAll(methodId: string) {
    if (!preview) return;
    setPayments([{ methodId, amount: formatTndInput(preview.total) }]);
  }

  function createCustomer() {
    startCreate(async () => {
      const result = await quickCreateCustomerAction(organizationId, newCustomer.name, newCustomer.phone);
      if (!result.ok) {
        setNewCustomer((c) => ({ ...c, error: result.message }));
        return;
      }
      setCustomers((list) => [...list, { id: result.id, name: result.name }].sort((a, b) => a.name.localeCompare(b.name, "fr")));
      setCustomerId(result.id);
      setNewCustomer({ open: false, name: "", phone: "", error: "" });
    });
  }

  return (
    <form action={finalizeAction} className="space-y-5" noValidate>
      <input type="hidden" name="payload" value={payload} />
      <ActionMessage state={state} />

      <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
        <VariantPicker organizationId={organizationId} locationId={locationId || null} onPick={add} excludeIds={new Set()} />
        {errors.lines ? <Alert tone="error">{errors.lines}</Alert> : null}
        {lines.length === 0 ? <p className="text-sm text-muted">{t.empty}</p> : null}
        <ul className="space-y-3">
          {lines.map((l, index) => {
            const e = (f: string) => errors[`lines.${index}.${f}`];
            const priced = preview?.lines[index];
            return (
              <li key={l.variantId} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.label}</p>
                    <p className="text-xs text-muted">
                      {formatTnd(l.unitPriceMillimes)}
                      {l.available !== null ? ` · ${fr.stock.picker.inStock(l.available)}` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => setLines((c) => c.filter((x) => x.variantId !== l.variantId))}>
                    {fr.stock.form.remove}
                  </Button>
                </div>
                <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                  <TextField
                    id={`${id}-${l.variantId}-q`}
                    label={t.quantity}
                    inputMode="numeric"
                    value={l.quantity}
                    onChange={(ev) => update(l.variantId, { quantity: ev.target.value })}
                    error={e("quantity")}
                  />
                  <TextField
                    id={`${id}-${l.variantId}-d`}
                    label={t.discount}
                    inputMode="decimal"
                    placeholder="0"
                    value={l.discount}
                    onChange={(ev) => update(l.variantId, { discount: ev.target.value })}
                    error={e("discount")}
                  />
                  <p className="min-h-11 content-center text-end text-sm font-semibold tabular-nums">
                    {priced ? formatTnd(priced.lineTotal) : "—"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        {maxDiscountBps !== null ? <p className="text-xs text-muted">{t.maxDiscount(formatBps(maxDiscountBps))}</p> : null}
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {locations.length > 1 ? (
            <SelectField
              id={`${id}-location`}
              label={fr.stock.form.location}
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              options={locations.map((l) => ({ value: l.id, label: l.name }))}
              error={errors.locationId}
            />
          ) : null}
          <div className="space-y-2">
            {customerSearch ? (
              <div className="space-y-1">
                <TextField
                  id={`${id}-customer-search`}
                  label={t.searchCustomer}
                  hint={t.searchCustomerHint}
                  type="search"
                  autoComplete="off"
                  value={customerQuery}
                  onChange={(e) => searchCustomers(e.target.value)}
                />
                {customerResults ? (
                  <ul aria-live="polite" className="divide-y divide-border rounded-lg border border-border bg-surface">
                    {customerResults.length === 0 ? <li className="p-2 text-sm text-muted">{t.noCustomerFound}</li> : null}
                    {customerResults.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => chooseCustomer(c)} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-start text-sm hover:bg-background">
                          <span className="font-medium">{c.name}</span>
                          {c.phone ? <span className="text-muted">{c.phone}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <SelectField
              id={`${id}-customer`}
              label={t.customer}
              hint={t.customerHint}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              options={[{ value: "", label: t.noCustomer }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
            />
            {!newCustomer.open ? (
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => setNewCustomer((c) => ({ ...c, open: true }))}
              >
                + {t.newCustomer}
              </button>
            ) : (
              <div className="space-y-2 rounded-lg bg-background p-3">
                {newCustomer.error ? <Alert tone="error">{newCustomer.error}</Alert> : null}
                <TextField
                  id={`${id}-nc-name`}
                  label={fr.customers.name}
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer((c) => ({ ...c, name: e.target.value }))}
                />
                <TextField
                  id={`${id}-nc-phone`}
                  label={fr.customers.phone}
                  inputMode="tel"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button onClick={createCustomer} disabled={creating}>
                    {creating ? fr.common.loading : t.createCustomer}
                  </Button>
                  <Button variant="ghost" onClick={() => setNewCustomer({ open: false, name: "", phone: "", error: "" })}>
                    {t.cancel}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <TextField
            id={`${id}-order-discount`}
            label={t.orderDiscount}
            inputMode="decimal"
            placeholder="0,000"
            value={orderDiscount}
            onChange={(e) => setOrderDiscount(e.target.value)}
            error={errors.orderDiscount}
          />
          <TextField id={`${id}-note`} label={t.note} value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">{t.subtotal}</dt>
            <dd className="tabular-nums">{preview ? formatTnd(preview.subtotal + preview.lineDiscount) : "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t.discounts}</dt>
            <dd className="tabular-nums">{preview ? `− ${formatTnd(preview.lineDiscount + preview.orderDiscount)}` : "—"}</dd>
          </div>
          <div className="flex justify-between text-lg font-semibold">
            <dt>{t.total}</dt>
            <dd className="tabular-nums">{preview ? formatTnd(preview.total) : "—"}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted">{t.previewNote}</p>

        <h2 className="pt-2 font-semibold">{t.payments}</h2>
        <div className="flex flex-wrap gap-2">
          {methods.map((m) => (
            <Button key={m.id} variant="secondary" onClick={() => payAll(m.id)} disabled={!preview || preview.total === 0}>
              {t.payAll(m.label)}
            </Button>
          ))}
        </div>
        {payments.map((p, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
            <SelectField
              id={`${id}-pm-${index}`}
              label={t.method}
              value={p.methodId}
              onChange={(e) => setPayments((ps) => ps.map((x, i) => (i === index ? { ...x, methodId: e.target.value } : x)))}
              options={methods.map((m) => ({ value: m.id, label: m.label }))}
            />
            <TextField
              id={`${id}-pa-${index}`}
              label={t.amount}
              inputMode="decimal"
              value={p.amount}
              onChange={(e) => setPayments((ps) => ps.map((x, i) => (i === index ? { ...x, amount: e.target.value } : x)))}
              error={errors[`payments.${index}.amount`]}
            />
            <Button variant="ghost" onClick={() => setPayments((ps) => ps.filter((_, i) => i !== index))}>
              {fr.stock.form.remove}
            </Button>
          </div>
        ))}
        {methods[0] ? (
          <button
            type="button"
            className="text-sm text-primary hover:underline"
            onClick={() => setPayments((ps) => [...ps, { methodId: methods[0].id, amount: "" }])}
          >
            + {t.addPayment}
          </button>
        ) : null}
        {cashPaid > 0 ? (
          <div className="grid grid-cols-2 items-end gap-3 rounded-lg bg-background p-3">
            <TextField
              id={`${id}-received`}
              label={t.received}
              inputMode="decimal"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
            />
            <p className="min-h-11 content-center text-end text-sm">
              {t.change} : <span className="font-semibold tabular-nums">{change !== null && change >= 0 ? formatTnd(change) : "—"}</span>
            </p>
          </div>
        ) : null}
        {due !== null ? (
          <p className={`text-sm font-medium ${due > 0 ? "text-danger" : ""}`}>
            {due > 0 ? t.remaining(formatTnd(due)) : due < 0 ? t.overpaid : t.settled}
          </p>
        ) : null}
        {due !== null && due > 0 && !customerId ? <Alert tone="info">{t.creditNeedsCustomer}</Alert> : null}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SubmitButton className="sm:min-w-56" pendingLabel={fr.stock.form.saving} confirmMessage={t.confirm}>
          {t.finalize}
        </SubmitButton>
        <SubmitButton variant="secondary" formAction={draftAction} pendingLabel={fr.stock.form.saving}>
          {t.saveDraft}
        </SubmitButton>
      </div>
    </form>
  );
}

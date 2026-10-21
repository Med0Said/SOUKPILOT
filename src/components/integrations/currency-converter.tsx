"use client";

import { useId, useState, useTransition } from "react";
import { ArrowRightLeft } from "lucide-react";
import { convertCurrencyAction, type ConversionResult } from "@/app/_actions/integrations";
import { formatTnd } from "@/lib/domain/money";
import { fr } from "@/i18n/fr";

const CURRENCIES = ["EUR", "USD", "GBP", "CNY", "TRY", "AED", "SAR", "DZD", "LYD", "MAD"] as const;

/**
 * Indicative conversion of a supplier price to dinars. Display only: the
 * user reads the result and types the cost himself/herself; nothing is saved.
 */
export function CurrencyConverter({ organizationId }: { organizationId: string }) {
  const t = fr.integrations.rates;
  const id = useId();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>("EUR");
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function convert(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => setResult(await convertCurrencyAction(organizationId, amount, currency)));
  }

  return (
    <details className="rounded-xl border border-border bg-surface p-4">
      <summary className="cursor-pointer font-medium">{t.title}</summary>
      <form onSubmit={convert} className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`${id}-amount`} className="mb-1 block text-sm font-medium">
            {t.amount}
          </label>
          <input
            id={`${id}-amount`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            className="min-h-11 w-32 rounded-lg border border-border bg-surface px-3"
          />
        </div>
        <div>
          <label htmlFor={`${id}-currency`} className="mb-1 block text-sm font-medium">
            {t.currency}
          </label>
          <select
            id={`${id}-currency`}
            value={currency}
            onChange={(e) => setCurrency(e.target.value as (typeof CURRENCIES)[number])}
            className="min-h-11 rounded-lg border border-border bg-surface px-3"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-background">
          <ArrowRightLeft aria-hidden="true" className="size-4" />
          {t.convert}
        </button>
      </form>
      <div aria-live="polite" className="mt-3 text-sm">
        {result?.status === "ok" ? (
          <>
            <p className="text-lg font-semibold tabular-nums">
              {t.result(result.amount.toLocaleString("fr-TN"), result.currency, formatTnd(result.millimes))}
            </p>
            <p className="text-xs text-muted">
              {t.detail(result.date, result.tndPerUnit.toLocaleString("fr-TN", { maximumFractionDigits: 4 }), result.currency)}
            </p>
          </>
        ) : null}
        {result?.status === "invalid" ? <p className="text-danger">{t.invalid}</p> : null}
        {result?.status === "unavailable" ? <p className="text-muted">{t.unavailable}</p> : null}
        {result?.status === "rate_limited" ? <p className="text-muted">{t.rateLimited}</p> : null}
        {result?.status === "disabled" ? <p className="text-muted">{fr.integrations.disabled}</p> : null}
      </div>
    </details>
  );
}

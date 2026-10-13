"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { countTransitionAction, recordCountAction } from "@/app/_actions/stock";
import { fr } from "@/i18n/fr";

const t = fr.stock.counts;

type Row = { variantId: string; label: string; sku: string | null; counted: number | null };

/**
 * Blind count sheet: counters see what they count, not the book quantity
 * (avoids confirming the system figure instead of counting). Only rows that
 * were edited are sent when saving.
 */
export function CountSheet({ countId, rows }: { countId: string; rows: Row[] }) {
  const [state, action] = useActionState(recordCountAction, initialActionState);
  const [values, setValues] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? rows.filter((r) => r.label.toLowerCase().includes(f) || r.sku?.toLowerCase().includes(f)) : rows;
  }, [filter, rows]);

  const changed = Object.entries(values).filter(([id, v]) => {
    const row = rows.find((r) => r.variantId === id);
    return v.trim() !== "" && String(row?.counted ?? "") !== v.trim();
  });
  const payload = JSON.stringify({ countId, items: changed.map(([variantId, counted]) => ({ variantId, counted })) });

  return (
    // Typed values are kept after saving: once saved they equal the refreshed
    // `counted` values and no longer count as changes; on error nothing is lost.
    <form action={action} className="space-y-3">
      <input type="hidden" name="payload" value={payload} />
      <ActionMessage state={state} />
      <div className="sticky top-14 z-[5] space-y-2 bg-background py-2 md:top-0">
        <label htmlFor="count-filter" className="sr-only">
          {t.filter}
        </label>
        <input
          id="count-filter"
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (visible.length === 1) inputs.current.get(visible[0].variantId)?.focus();
            }
          }}
          placeholder={t.filter}
          autoComplete="off"
          className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
        />
        <SubmitButton className="w-full sm:w-auto" pendingLabel={fr.stock.form.saving}>
          {t.save(changed.length)}
        </SubmitButton>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {visible.map((r) => (
          <li key={r.variantId} className="flex items-center justify-between gap-3 p-3">
            <label htmlFor={`c-${r.variantId}`} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{r.label}</span>
              <span className="block text-xs text-muted">
                {r.sku ?? ""}
                {r.counted !== null ? ` · ${t.alreadyCounted(r.counted)}` : ""}
              </span>
            </label>
            <input
              id={`c-${r.variantId}`}
              ref={(el) => {
                if (el) inputs.current.set(r.variantId, el);
                else inputs.current.delete(r.variantId);
              }}
              inputMode="numeric"
              pattern="[0-9]*"
              value={values[r.variantId] ?? (r.counted === null ? "" : String(r.counted))}
              onChange={(e) => setValues((v) => ({ ...v, [r.variantId]: e.target.value }))}
              className="min-h-11 w-24 rounded-lg border border-border bg-surface px-3 text-end text-base tabular-nums"
              aria-label={t.countedFor(r.label)}
            />
          </li>
        ))}
      </ul>
    </form>
  );
}

export function CountTransitions({
  countId,
  status,
  canReview,
}: {
  countId: string;
  status: "in_progress" | "submitted" | "approved" | "cancelled";
  canReview: boolean;
}) {
  const [state, action] = useActionState(countTransitionAction, initialActionState);
  if (status === "approved" || status === "cancelled") return <ActionMessage state={state} />;
  return (
    <form action={action} className="space-y-2">
      <ActionMessage state={state} />
      <input type="hidden" name="countId" value={countId} />
      <div className="flex flex-wrap gap-2">
        {status === "in_progress" ? (
          <SubmitButton name="step" value="submit" variant="secondary" confirmMessage={t.confirmSubmit}>
            {t.submit}
          </SubmitButton>
        ) : null}
        {status === "submitted" && canReview ? (
          <>
            <SubmitButton name="step" value="approve" confirmMessage={t.confirmApprove}>
              {t.approve}
            </SubmitButton>
            <SubmitButton name="step" value="reject" variant="secondary">
              {t.reject}
            </SubmitButton>
          </>
        ) : null}
        {canReview ? (
          <SubmitButton name="step" value="cancel" variant="danger" confirmMessage={t.confirmCancel}>
            {t.cancel}
          </SubmitButton>
        ) : null}
      </div>
      {status === "submitted" && !canReview ? <p className="text-sm text-muted">{t.waiting}</p> : null}
    </form>
  );
}

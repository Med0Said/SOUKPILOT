"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { searchVariantsAction, type VariantSearchResult } from "@/app/_actions/stock";
import { variantLabel } from "@/lib/domain/catalog";
import { fr } from "@/i18n/fr";

const t = fr.stock.picker;

/**
 * Search box for adding articles to a stock document. Works with handheld
 * barcode scanners (they type the code then press Enter): an exact barcode or
 * SKU match is added immediately.
 */
export function VariantPicker({
  organizationId,
  locationId,
  onPick,
  excludeIds,
}: {
  organizationId: string;
  locationId: string | null;
  onPick: (variant: VariantSearchResult) => void;
  excludeIds: ReadonlySet<string>;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VariantSearchResult[]>([]);
  const [pending, startTransition] = useTransition();
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const current = ++requestId.current;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const found = await searchVariantsAction(organizationId, q, locationId);
        if (current === requestId.current) setResults(found);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, organizationId, locationId]);

  function pick(variant: VariantSearchResult) {
    onPick(variant);
    setQuery("");
    setResults([]);
  }

  async function onEnter() {
    const q = query.trim();
    if (!q) return;
    const found = await searchVariantsAction(organizationId, q, locationId);
    const exact = found.filter((v) => v.barcode === q || v.sku?.toUpperCase() === q.toUpperCase());
    if (exact.length === 1) pick(exact[0]);
    else setResults(found);
  }

  const visible = query.trim().length >= 2 ? results.filter((r) => !excludeIds.has(r.variantId)) : [];

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {t.label}
      </label>
      <input
        id={id}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void onEnter();
          }
        }}
        placeholder={t.placeholder}
        autoComplete="off"
        className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-xs text-muted">
        {pending ? fr.common.loading : t.hint}
      </p>
      {visible.length > 0 ? (
        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface">
          {visible.map((v) => (
            <li key={v.variantId}>
              <button
                type="button"
                onClick={() => pick(v)}
                disabled={!v.trackStock}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-start hover:bg-background disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{v.productName}</span>
                  <span className="block truncate text-xs text-muted">
                    {variantLabel(v.optionValues)}
                    {v.sku ? ` · ${v.sku}` : ""}
                    {!v.trackStock ? ` · ${fr.catalog.notTracked}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted">{t.inStock(v.quantity)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {query.trim().length >= 2 && !pending && results.length === 0 ? <p className="text-sm text-muted">{t.none}</p> : null}
    </div>
  );
}

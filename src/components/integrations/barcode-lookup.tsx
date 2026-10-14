"use client";

import { useState, useTransition } from "react";
import { ExternalLink, ScanSearch } from "lucide-react";
import { lookupBarcodeAction, type BarcodeLookupResult } from "@/app/_actions/integrations";
import { isValidGtin, normalizeGtin } from "@/lib/integrations/gtin";
import { fr } from "@/i18n/fr";

/**
 * "Chercher ce code-barres": asks the server for a suggestion and shows it.
 * Nothing is applied unless the user clicks "Utiliser ce nom".
 */
export function BarcodeLookup({ organizationId, code, onUseName }: { organizationId: string; code: string; onUseName: (name: string) => void }) {
  const t = fr.integrations.barcode;
  const [result, setResult] = useState<(BarcodeLookupResult & { code: string }) | null>(null);
  const [pending, startTransition] = useTransition();
  const normalized = normalizeGtin(code);
  const valid = isValidGtin(normalized);
  // A suggestion only applies to the code it was found for.
  const shown = result && result.code === normalized ? result : null;

  function search() {
    startTransition(async () => {
      const r = await lookupBarcodeAction(organizationId, normalized);
      setResult({ ...r, code: normalized });
    });
  }

  const message =
    shown?.status === "not_found"
      ? t.notFound
      : shown?.status === "unavailable"
        ? t.unavailable
        : shown?.status === "rate_limited"
          ? t.rateLimited
          : shown?.status === "invalid"
            ? t.invalid
            : shown?.status === "disabled"
              ? fr.integrations.disabled
              : null;

  return (
    <div className="col-span-full space-y-2">
      <button
        type="button"
        onClick={search}
        disabled={!valid || pending}
        title={valid ? undefined : t.invalid}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ScanSearch aria-hidden="true" className="size-4" />
        {pending ? t.searching : t.button}
      </button>
      <div aria-live="polite">
        {message ? <p className="text-sm text-muted">{message}</p> : null}
        {shown?.status === "found" ? (
          <div className="rounded-lg border border-border bg-background p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.suggestion}</p>
            <p className="font-medium">{shown.suggestion.name}</p>
            <p className="text-muted">{[shown.suggestion.brand, shown.suggestion.quantity].filter(Boolean).join(" · ")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onUseName(shown.suggestion.name);
                  setResult(null);
                }}
                className="min-h-9 rounded-lg bg-primary px-3 font-medium text-primary-foreground"
              >
                {t.use}
              </button>
              <button type="button" onClick={() => setResult(null)} className="min-h-9 rounded-lg px-3 text-muted hover:text-foreground">
                {t.dismiss}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              {t.attribution(shown.suggestion.source)}{" "}
              <a href={shown.suggestion.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                {t.viewSource}
                <ExternalLink aria-hidden="true" className="size-3" />
              </a>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

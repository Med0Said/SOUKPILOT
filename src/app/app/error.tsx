"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { fr } from "@/i18n/fr";

/**
 * Consistent failure state for app pages. Shows no technical detail (it may
 * contain internals); the digest lets support match the server log entry.
 */
// Next 16 passes `retry` (re-fetches and re-renders the segment); the older
// `reset` prop no longer exists, so a button wired to it did nothing.
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.warn("SoukPilot page error", error.digest ?? "");
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert aria-hidden="true" className="size-6" />
      </span>
      <h1 className="text-xl font-semibold">{fr.ui.error.title}</h1>
      <p className="text-sm text-muted">{fr.ui.error.body}</p>
      {error.digest ? <p className="text-xs text-muted">Réf. {error.digest}</p> : null}
      <Button onClick={() => retry()}>
        <RefreshCw aria-hidden="true" className="size-4" />
        {fr.ui.error.retry}
      </Button>
    </div>
  );
}

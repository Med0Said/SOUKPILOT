"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { DEFAULT_LOCALE, localeDirection } from "@/i18n/config";
import { fr } from "@/i18n/fr";
import "./globals.css";

/**
 * Shown when the root layout itself fails (it replaces it, so it brings its
 * own <html>, <body> and styles). Next's built-in fallback is in English and
 * uses inline styles, which our CSP blocks. The theme follows the operating
 * system ("system"): the user's cookie is not available to this page.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang={DEFAULT_LOCALE} dir={localeDirection(DEFAULT_LOCALE)} data-theme="system">
      <body className="min-h-dvh antialiased">
        <title>{`${fr.ui.error.title} · ${fr.app.name}`}</title>
        <main role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
            <TriangleAlert aria-hidden="true" className="size-6" />
          </span>
          <h1 className="text-xl font-semibold">{fr.ui.error.title}</h1>
          <p className="text-sm text-muted">{fr.ui.error.body}</p>
          {error.digest ? <p className="text-xs text-muted">Réf. {error.digest}</p> : null}
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            {fr.ui.error.retry}
          </button>
        </main>
      </body>
    </html>
  );
}

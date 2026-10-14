import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { fr } from "@/i18n/fr";

/**
 * Custom 404 (also shown when a record belongs to another organization).
 * Replaces Next.js's built-in page, whose inline styles are blocked by our
 * Content-Security-Policy. Uses classes only.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">{fr.app.name}</p>
      <h1 className="text-2xl font-semibold">{fr.common.notFound}</h1>
      <p className="text-sm text-muted">{fr.common.notFoundHelp}</p>
      <Link href="/app" className={buttonClasses("primary")}>
        {fr.common.backHome}
      </Link>
    </main>
  );
}

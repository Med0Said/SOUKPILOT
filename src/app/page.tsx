import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { fr } from "@/i18n/fr";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">{fr.app.name}</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        La gestion simple pour les commerces tunisiens.
      </h1>
      <p className="text-lg text-muted">{fr.app.tagline}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/signup" className={buttonClasses("primary")}>
          {fr.auth.signupLink}
        </Link>
        <Link href="/login" className={buttonClasses("secondary")}>
          {fr.auth.loginLink}
        </Link>
      </div>
      <p className="text-xs text-muted">Version pilote — en cours de développement.</p>
    </main>
  );
}

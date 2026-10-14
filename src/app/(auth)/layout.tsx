import Link from "next/link";
import type { ReactNode } from "react";
import { fr } from "@/i18n/fr";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6" aria-label={fr.app.name}>
        <Logo />
      </Link>
      <main className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">{children}</main>
    </div>
  );
}

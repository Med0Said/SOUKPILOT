import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getMemberships } from "@/lib/auth/organization";
import { fr } from "@/i18n/fr";
import { CreateOrganizationForm } from "./create-organization-form";

export const metadata: Metadata = { title: fr.onboarding.title };

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const memberships = await getMemberships(user.id);

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <p className="mb-6 text-xl font-semibold text-primary">{fr.app.name}</p>
      <h1 className="text-2xl font-semibold">{fr.onboarding.title}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{fr.onboarding.subtitle}</p>

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <CreateOrganizationForm />
      </div>

      <div className="mt-6 space-y-2 text-sm">
        <p className="text-muted">
          {fr.onboarding.pendingInvitations}{" "}
          <Link href="/invitations" className="text-primary underline-offset-4 hover:underline">
            {fr.onboarding.seeInvitations}
          </Link>
        </p>
        {memberships.length > 0 ? (
          <Link href="/app" className="text-primary underline-offset-4 hover:underline">
            ← {fr.nav.dashboard}
          </Link>
        ) : null}
      </div>
    </main>
  );
}

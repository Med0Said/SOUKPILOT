import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/lib/auth/organization";
import { PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";

export const metadata: Metadata = { title: fr.nav.settings };

export default async function SettingsPage() {
  await requireOrgContext();
  const t = fr.settingsHub;
  const sections = [
    { href: "/app/settings/organization", title: fr.nav.organization, body: t.organization },
    { href: "/app/settings/locations", title: fr.nav.locations, body: t.locations },
    { href: "/app/settings/members", title: fr.nav.members, body: t.members },
    { href: "/app/profile", title: fr.nav.profile, body: t.profile },
    { href: "/invitations", title: fr.nav.invitations, body: t.invitations },
  ];
  return (
    <>
      <PageHeader title={fr.nav.settings} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {sections.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block min-h-11 rounded-xl border border-border bg-surface p-4 hover:border-primary"
            >
              <span className="font-medium">{s.title}</span>
              <span className="mt-1 block text-sm text-muted">{s.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

import type { ReactNode } from "react";
import Link from "next/link";
import { requireOrgContext } from "@/lib/auth/organization";
import { can } from "@/lib/auth/permissions";
import { switchOrganizationAction } from "@/app/_actions/organizations";
import { signOutAction } from "@/app/(auth)/actions";
import { fr } from "@/i18n/fr";
import { NavLinks, type NavItem } from "./nav-links";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { membership, memberships } = await requireOrgContext();
  // The phone's bottom bar shows the five daily workflows; the rest is
  // reachable from the desktop sidebar and from Paramètres.
  const navItems: NavItem[] = [
    { href: "/app", label: fr.nav.dashboard, exact: true },
    { href: "/app/sales", label: fr.nav.sales },
    { href: "/app/customers", label: fr.nav.customers, desktopOnly: true },
    { href: "/app/catalog", label: fr.nav.catalog },
    { href: "/app/stock", label: fr.nav.stock },
    ...(can(membership.role, "purchasing.manage")
      ? [{ href: "/app/purchases", label: fr.nav.purchases, desktopOnly: true }]
      : []),
    ...(can(membership.role, "suppliers.manage")
      ? [{ href: "/app/suppliers", label: fr.nav.suppliers, desktopOnly: true }]
      : []),
    { href: "/app/settings", label: fr.nav.settings, also: ["/app/profile"] },
  ];

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden border-e border-border bg-surface md:flex md:min-h-dvh md:flex-col md:gap-6 md:p-4">
        <Link href="/app" className="text-lg font-semibold text-primary">
          {fr.app.name}
        </Link>
        <OrganizationBadge
          currentId={membership.organizationId}
          currentName={membership.organizationName}
          role={fr.roles[membership.role]}
          options={memberships.map((m) => ({ id: m.organizationId, name: m.organizationName }))}
        />
        <nav aria-label={fr.nav.mainNavigation} className="flex-1">
          <NavLinks items={navItems} orientation="vertical" />
        </nav>
        <form action={signOutAction}>
          <button type="submit" className="min-h-11 w-full rounded-lg px-3 text-start text-sm text-muted hover:bg-background">
            {fr.nav.signOut}
          </button>
        </form>
      </aside>

      <div className="flex min-h-dvh flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2 md:hidden">
          <Link href="/app" className="font-semibold text-primary">
            {fr.app.name}
          </Link>
          <span className="truncate text-sm text-muted">{membership.organizationName}</span>
          <form action={signOutAction}>
            <button type="submit" className="min-h-11 rounded-lg px-2 text-sm text-muted">
              {fr.nav.signOut}
            </button>
          </form>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 md:pb-10">{children}</main>

        {/* Mobile bottom navigation */}
        <nav
          aria-label={fr.nav.mainNavigation}
          className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <NavLinks items={navItems.filter((i) => !i.desktopOnly)} orientation="horizontal" />
        </nav>
      </div>
    </div>
  );
}

function OrganizationBadge({
  currentId,
  currentName,
  role,
  options,
}: {
  currentId: string;
  currentName: string;
  role: string;
  options: { id: string; name: string }[];
}) {
  if (options.length <= 1) {
    return (
      <div className="rounded-lg bg-background px-3 py-2">
        <p className="truncate text-sm font-medium">{currentName}</p>
        <p className="text-xs text-muted">{role}</p>
      </div>
    );
  }
  return (
    <form action={switchOrganizationAction} className="space-y-2 rounded-lg bg-background p-3">
      <label htmlFor="organizationId" className="block text-xs text-muted">
        {fr.nav.switchOrganization}
      </label>
      <select
        id="organizationId"
        name="organizationId"
        defaultValue={currentId}
        className="min-h-11 w-full rounded-lg border border-border bg-surface px-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <button type="submit" className="min-h-11 w-full rounded-lg border border-border bg-surface text-sm">
        OK
      </button>
      <p className="text-xs text-muted">{role}</p>
    </form>
  );
}

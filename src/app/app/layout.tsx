import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { requireOrgContext } from "@/lib/auth/organization";
import { can } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SIDEBAR_COOKIE, THEME_COOKIE, parseSidebarCollapsed, parseTheme } from "@/lib/ui/preferences";
import { switchOrganizationAction } from "@/app/_actions/organizations";
import { signOutAction } from "@/app/(auth)/actions";
import { fr } from "@/i18n/fr";
import { AppShell, type NavGroup, type NavItem } from "./app-shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { membership, memberships, user } = await requireOrgContext();
  const role = membership.role;
  const cookieStore = await cookies();

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  // The phone's bottom bar shows the five daily workflows; the rest is
  // reachable from the desktop sidebar and from Paramètres.
  const sell: NavItem[] = [
    { key: "sales", href: "/app/sales", label: fr.nav.sales },
    { key: "customers", href: "/app/customers", label: fr.nav.customers, desktopOnly: true },
  ];
  const goods: NavItem[] = [
    { key: "catalog", href: "/app/catalog", label: fr.nav.catalog },
    { key: "stock", href: "/app/stock", label: fr.nav.stock },
    ...(can(role, "purchasing.manage")
      ? [{ key: "purchases", href: "/app/purchases", label: fr.nav.purchases, desktopOnly: true } satisfies NavItem]
      : []),
    ...(can(role, "suppliers.manage")
      ? [{ key: "suppliers", href: "/app/suppliers", label: fr.nav.suppliers, desktopOnly: true } satisfies NavItem]
      : []),
  ];
  const groups: NavGroup[] = [
    { items: [{ key: "dashboard", href: "/app", label: fr.nav.dashboard, exact: true }] },
    { title: fr.nav.groupSell, items: sell },
    { title: fr.nav.groupGoods, items: goods },
    ...(can(role, "reports.view")
      ? [{ title: fr.nav.groupPilot, items: [{ key: "reports", href: "/app/reports", label: fr.nav.reports, desktopOnly: true } satisfies NavItem] }]
      : []),
    { items: [{ key: "settings", href: "/app/settings", label: fr.nav.settings, also: ["/app/profile"] }] },
  ];

  return (
    <AppShell
      groups={groups}
      organization={{ id: membership.organizationId, name: membership.organizationName, role: fr.roles[role] }}
      organizations={memberships.map((m) => ({ id: m.organizationId, name: m.organizationName }))}
      user={{ name: profile?.full_name ?? "", email: user.email ?? "" }}
      initialCollapsed={parseSidebarCollapsed(cookieStore.get(SIDEBAR_COOKIE)?.value)}
      initialTheme={parseTheme(cookieStore.get(THEME_COOKIE)?.value)}
      signOutAction={signOutAction}
      switchOrganizationAction={switchOrganizationAction}
    >
      {children}
    </AppShell>
  );
}

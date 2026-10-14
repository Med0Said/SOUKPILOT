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
import type { PaletteCommand } from "@/components/ui/command-palette";

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

  // Command palette: every page the role can open, plus frequent actions.
  const goTo: PaletteCommand[] = [
    ...groups.flatMap((g) => g.items).map((i) => ({ id: `nav:${i.href}`, group: "goTo" as const, label: i.label, href: i.href })),
    { id: "nav:movements", group: "goTo", label: fr.stock.nav.movements, href: "/app/stock/movements" },
    { id: "nav:profile", group: "goTo", label: fr.nav.profile, href: "/app/profile" },
    ...(can(role, "locations.manage") ? [{ id: "nav:locations", group: "goTo" as const, label: fr.nav.locations, href: "/app/settings/locations" }] : []),
    { id: "nav:members", group: "goTo", label: fr.nav.members, href: "/app/settings/members" },
  ];
  const actions: PaletteCommand[] = [
    { id: "act:sale", group: "actions", label: fr.palette.newSale, href: "/app/sales/new", keywords: "vendre caisse ticket" },
    { id: "act:unpaid", group: "actions", label: fr.palette.unpaid, href: "/app/sales?due=1", keywords: "credit impaye reste" },
    { id: "act:customers-owing", group: "actions", label: fr.palette.customersOwing, href: "/app/customers?due=1", keywords: "credit dette" },
    { id: "act:low", group: "actions", label: fr.palette.lowStock, href: "/app/stock?low=1", keywords: "rupture alerte" },
    { id: "act:adjust", group: "actions", label: fr.palette.adjust, href: "/app/stock/adjustments/new", keywords: "correction perte casse" },
    ...(can(role, "catalog.manage")
      ? [{ id: "act:product", group: "actions" as const, label: fr.palette.newProduct, href: "/app/catalog/new", keywords: "produit creer" }]
      : []),
    ...(can(role, "stock.receive")
      ? [{ id: "act:receive", group: "actions" as const, label: fr.palette.receive, href: "/app/stock/receipts/new", keywords: "livraison arrivage" }]
      : []),
    ...(can(role, "purchasing.manage")
      ? [{ id: "act:po", group: "actions" as const, label: fr.palette.newPurchase, href: "/app/purchases/new", keywords: "bon de commande achat" }]
      : []),
  ];

  return (
    <AppShell
      groups={groups}
      commands={[...actions, ...goTo]}
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

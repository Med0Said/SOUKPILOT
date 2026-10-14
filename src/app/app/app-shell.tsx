"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  BarChart3,
  Building2,
  LayoutDashboard,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShoppingCart,
  Truck,
  UserRound,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SIDEBAR_COOKIE, type Theme } from "@/lib/ui/preferences";
import { savePreference } from "@/lib/ui/browser-preferences";
import { fr } from "@/i18n/fr";

export type NavKey = "dashboard" | "sales" | "customers" | "catalog" | "stock" | "purchases" | "suppliers" | "reports" | "settings";

export type NavItem = {
  key: NavKey;
  href: string;
  label: string;
  /** Extra path prefixes that mark this item active (e.g. /app/profile under Paramètres). */
  also?: string[];
  exact?: boolean;
  /** Hidden from the phone's bottom bar (still in the sidebar and Paramètres). */
  desktopOnly?: boolean;
};

export type NavGroup = { title?: string; items: NavItem[] };

const ICONS: Record<NavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  sales: ShoppingCart,
  customers: Users,
  catalog: Package,
  stock: Warehouse,
  purchases: Truck,
  suppliers: Building2,
  reports: BarChart3,
  settings: Settings,
};

// Static class names (no inline style: the CSP forbids style attributes).
const GRID_COLS: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5" };

function useIsActive() {
  const pathname = usePathname();
  return (item: NavItem) =>
    item.exact
      ? pathname === item.href
      : [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

type Props = {
  children: ReactNode;
  groups: NavGroup[];
  organization: { id: string; name: string; role: string };
  organizations: { id: string; name: string }[];
  user: { name: string; email: string };
  initialCollapsed: boolean;
  initialTheme: Theme;
  signOutAction: () => Promise<void>;
  switchOrganizationAction: (formData: FormData) => Promise<void>;
};

export function AppShell({
  children,
  groups,
  organization,
  organizations,
  user,
  initialCollapsed,
  initialTheme,
  signOutAction,
  switchOrganizationAction,
}: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const isActive = useIsActive();
  const mobileItems = groups.flatMap((g) => g.items).filter((i) => !i.desktopOnly);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    savePreference(SIDEBAR_COOKIE, next ? "collapsed" : "expanded");
  }

  return (
    <div className={`min-h-dvh md:grid ${collapsed ? "md:grid-cols-[4.5rem_1fr]" : "md:grid-cols-[16rem_1fr]"}`}>
      {/* Desktop sidebar */}
      <aside className="hidden border-e border-border bg-surface md:sticky md:top-0 md:flex md:h-dvh md:flex-col">
        <div className={`flex items-center gap-2 border-b border-border p-3 ${collapsed ? "justify-center" : "justify-between"}`}>
          <Link href="/app" className="rounded-lg p-1" aria-label={fr.nav.dashboard}>
            <Logo compact={collapsed} />
          </Link>
          {!collapsed ? (
            <button
              type="button"
              onClick={toggle}
              className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground"
              aria-label={fr.ui.collapseSidebar}
              title={fr.ui.collapseSidebar}
            >
              <PanelLeftClose aria-hidden="true" className="size-4 rtl:rotate-180" />
            </button>
          ) : null}
        </div>

        {!collapsed ? (
          <OrganizationSwitcher
            organization={organization}
            organizations={organizations}
            switchOrganizationAction={switchOrganizationAction}
          />
        ) : null}

        <nav aria-label={fr.nav.mainNavigation} className="flex-1 space-y-4 overflow-y-auto p-3">
          {groups.map((group, index) => (
            <div key={group.title ?? index}>
              {group.title && !collapsed ? (
                <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted">{group.title}</p>
              ) : null}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = ICONS[item.key];
                  const active = isActive(item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                          collapsed ? "justify-center" : ""
                        } ${active ? "bg-primary-soft font-medium text-primary" : "text-foreground hover:bg-background"}`}
                      >
                        <Icon aria-hidden="true" className="size-[1.125rem] shrink-0" />
                        <span className={collapsed ? "sr-only" : ""}>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="space-y-2 border-t border-border p-3">
          {collapsed ? (
            <button
              type="button"
              onClick={toggle}
              className="flex min-h-10 w-full items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground"
              aria-label={fr.ui.expandSidebar}
              title={fr.ui.expandSidebar}
            >
              <PanelLeftOpen aria-hidden="true" className="size-4 rtl:rotate-180" />
            </button>
          ) : (
            <>
              <Link href="/app/profile" className="flex items-center gap-3 rounded-lg p-2 hover:bg-background">
                <Avatar name={user.name || user.email} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{user.name || fr.members.noName}</span>
                  <span className="block truncate text-xs text-muted">{user.email}</span>
                </span>
              </Link>
              <div className="flex items-center justify-between gap-2 px-1">
                <ThemeToggle initial={initialTheme} />
              </div>
            </>
          )}
          <form action={signOutAction}>
            <button
              type="submit"
              title={collapsed ? fr.nav.signOut : undefined}
              className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-background hover:text-foreground ${
                collapsed ? "justify-center" : ""
              }`}
            >
              <LogOut aria-hidden="true" className="size-4 shrink-0 rtl:rotate-180" />
              <span className={collapsed ? "sr-only" : ""}>{fr.nav.signOut}</span>
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Phone top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur md:hidden">
          <Link href="/app" aria-label={fr.nav.dashboard}>
            <Logo />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-muted">{organization.name}</span>
            <Link
              href="/app/profile"
              aria-label={fr.nav.profile}
              className="inline-flex size-10 items-center justify-center rounded-full hover:bg-background"
            >
              <UserRound aria-hidden="true" className="size-5" />
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-background">
                <LogOut aria-hidden="true" className="size-5" />
                <span className="sr-only">{fr.nav.signOut}</span>
              </button>
            </form>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>

        {/* Phone bottom navigation */}
        <nav
          aria-label={fr.nav.mainNavigation}
          className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          <ul className={`grid ${GRID_COLS[mobileItems.length] ?? "grid-cols-5"}`}>
            {mobileItems.map((item) => {
              const Icon = ICONS[item.key];
              const active = isActive(item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-center text-[11px] leading-tight ${
                      active ? "font-semibold text-primary" : "text-muted"
                    }`}
                  >
                    <Icon aria-hidden="true" className="size-5" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
      {initials || "?"}
    </span>
  );
}

function OrganizationSwitcher({
  organization,
  organizations,
  switchOrganizationAction,
}: {
  organization: Props["organization"];
  organizations: Props["organizations"];
  switchOrganizationAction: Props["switchOrganizationAction"];
}) {
  if (organizations.length <= 1) {
    return (
      <div className="mx-3 mt-3 rounded-lg bg-background px-3 py-2">
        <p className="truncate text-sm font-medium">{organization.name}</p>
        <p className="text-xs text-muted">{organization.role}</p>
      </div>
    );
  }
  return (
    <form action={switchOrganizationAction} className="mx-3 mt-3 space-y-2 rounded-lg bg-background p-3">
      <label htmlFor="organizationId" className="block text-xs text-muted">
        {fr.nav.switchOrganization}
      </label>
      <div className="flex gap-2">
        <select
          id="organizationId"
          name="organizationId"
          defaultValue={organization.id}
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-sm"
        >
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button type="submit" className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm">
          OK
        </button>
      </div>
      <p className="text-xs text-muted">{organization.role}</p>
    </form>
  );
}

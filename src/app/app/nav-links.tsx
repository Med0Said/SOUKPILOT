"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = {
  href: string;
  label: string;
  /** Extra path prefixes that mark this item active (e.g. /app/profile under Paramètres). */
  also?: string[];
  exact?: boolean;
};

// Static class names (no inline style: the CSP forbids style attributes).
const GRID_COLS: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5" };

/**
 * Only implemented modules are listed (computed per role on the server);
 * future modules are not shown as if they worked.
 */
export function NavLinks({ items, orientation }: { items: NavItem[]; orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  const vertical = orientation === "vertical";
  const isActive = (item: NavItem) =>
    item.exact
      ? pathname === item.href
      : [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <ul className={vertical ? "space-y-1" : `grid ${GRID_COLS[items.length] ?? "grid-cols-5"}`}>
      {items.map((item) => {
        const active = isActive(item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                vertical
                  ? `flex min-h-11 items-center rounded-lg px-3 text-sm ${
                      active ? "bg-primary/10 font-medium text-primary" : "hover:bg-background"
                    }`
                  : `flex min-h-14 items-center justify-center px-1 text-center text-xs ${
                      active ? "font-semibold text-primary" : "text-muted"
                    }`
              }
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

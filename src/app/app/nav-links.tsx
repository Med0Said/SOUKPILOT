"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { fr } from "@/i18n/fr";

/** Only implemented modules are listed; future modules are not shown as working. */
const LINKS = [
  { href: "/app", label: fr.nav.dashboard, exact: true },
  { href: "/app/settings/organization", label: fr.nav.organization },
  { href: "/app/settings/members", label: fr.nav.members },
  { href: "/app/profile", label: fr.nav.profile },
] as const;

export function NavLinks({ orientation }: { orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  const vertical = orientation === "vertical";
  return (
    <ul className={vertical ? "space-y-1" : "grid grid-cols-4"}>
      {LINKS.map((link) => {
        const active = "exact" in link ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
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
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

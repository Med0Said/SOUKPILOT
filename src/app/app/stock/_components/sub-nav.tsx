"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SubNav({ items, label }: { items: { href: string; label: string; exact?: boolean }[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 mb-5 overflow-x-auto px-4">
      <ul className="flex gap-1 border-b border-border">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center border-b-2 px-3 text-sm ${
                  active ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

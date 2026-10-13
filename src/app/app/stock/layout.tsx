import type { ReactNode } from "react";
import { requireOrgContext } from "@/lib/auth/organization";
import { can } from "@/lib/auth/permissions";
import { fr } from "@/i18n/fr";
import { SubNav } from "./_components/sub-nav";

export default async function StockLayout({ children }: { children: ReactNode }) {
  const { membership } = await requireOrgContext();
  const role = membership.role;
  const t = fr.stock.nav;
  const items = [
    { href: "/app/stock", label: t.overview, exact: true },
    { href: "/app/stock/movements", label: t.movements },
    ...(can(role, "stock.receive") ? [{ href: "/app/stock/receipts", label: t.receipts }] : []),
    { href: "/app/stock/adjustments", label: t.adjustments },
    { href: "/app/stock/counts", label: t.counts },
    ...(can(role, "stock.transfer") ? [{ href: "/app/stock/transfers", label: t.transfers }] : []),
  ];
  return (
    <>
      <SubNav items={items} label={t.label} />
      {children}
    </>
  );
}

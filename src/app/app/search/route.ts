import { NextResponse, type NextRequest } from "next/server";
import { getActiveContext } from "@/lib/auth/organization";
import { getCurrentUser } from "@/lib/auth/session";
import { formatTnd } from "@/lib/domain/money";
import { poNumber } from "@/lib/domain/purchasing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseQuery } from "@/lib/ui/list-params";
import { logger } from "@/lib/logger";
import { fr } from "@/i18n/fr";

export type SearchResult = {
  kind: "product" | "customer" | "supplier" | "sale" | "purchase_order";
  id: string;
  label: string;
  detail: string | null;
  href: string;
};

const HREF = {
  product: (id: string) => `/app/catalog/${id}`,
  customer: (id: string) => `/app/customers/${id}`,
  supplier: (id: string) => `/app/suppliers/${id}`,
  sale: (id: string) => `/app/sales/${id}`,
  purchase_order: (id: string) => `/app/purchases/${id}`,
};

/**
 * Global search for the command palette (GET, JSON). Reads with the user's
 * session through global_search (RLS: a cashier gets no supplier or order).
 */
export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const context = await getActiveContext();
  if (!context) return NextResponse.json({ error: "no_organization" }, { status: 403 });

  const q = parseQuery(request.nextUrl.searchParams.get("q") ?? undefined, 60);
  if (q.length < 2) return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("global_search", {
    p_organization_id: context.membership.organizationId,
    p_query: q,
    p_limit_per_kind: 5,
  });
  if (error) {
    logger.error("search.failed", { organizationId: context.membership.organizationId, code: error.code });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }

  const results: SearchResult[] = (data ?? []).map((r) => {
    const amount = r.amount_millimes === null ? null : formatTnd(r.amount_millimes);
    switch (r.kind) {
      case "sale":
        return { kind: r.kind, id: r.id, label: fr.sales.number(r.number ?? 0), detail: [r.detail, amount].filter(Boolean).join(" · "), href: HREF.sale(r.id) };
      case "purchase_order":
        return { kind: r.kind, id: r.id, label: poNumber(r.number), detail: [r.detail, amount].filter(Boolean).join(" · "), href: HREF.purchase_order(r.id) };
      default:
        return { kind: r.kind, id: r.id, label: r.label ?? "", detail: r.detail, href: HREF[r.kind](r.id) };
    }
  });
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}

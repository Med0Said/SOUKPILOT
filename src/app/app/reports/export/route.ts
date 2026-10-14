import { NextResponse, type NextRequest } from "next/server";
import { resolvePeriod } from "@/lib/domain/reports";
import { reportDaysExportRows, reportGroupsExportRows, reportPaymentsExportRows } from "@/lib/domain/exports";
import { csvResponse, exportContext, exportFailed } from "@/lib/server/csv-export";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseChoice, todayIn } from "@/lib/ui/list-params";
import { fr } from "@/i18n/fr";

const KINDS = ["days", "products", "categories", "payments"] as const;
const FILE_NAMES = { days: "jours", products: "articles", categories: "categories", payments: "encaissements" } as const;

/** CSV of one report table for the same period as the Rapports page. */
export async function GET(request: NextRequest) {
  const context = await exportContext("reports.view");
  if (context instanceof NextResponse) return context;
  const sp = request.nextUrl.searchParams;
  const kind = parseChoice(sp.get("kind") ?? undefined, KINDS, "days");
  const period = resolvePeriod(
    { period: sp.get("period") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined },
    todayIn(context.membership.timezone),
  );
  const range = { p_organization_id: context.membership.organizationId, p_from: period.from, p_to: period.to };
  const supabase = await createSupabaseServerClient();
  const file = `rapport-${FILE_NAMES[kind]}-${period.from}_${period.to}`;

  if (kind === "days") {
    const { data, error } = await supabase.rpc("report_sales_by_day", range);
    if (error) return exportFailed(context, "report_days", error.code);
    return csvResponse(context, "report_days", file, reportDaysExportRows(data ?? []), false);
  }
  if (kind === "payments") {
    const { data, error } = await supabase.rpc("report_payments_by_method", range);
    if (error) return exportFailed(context, "report_payments", error.code);
    return csvResponse(context, "report_payments", file, reportPaymentsExportRows(data ?? []), false);
  }
  const group = kind === "products" ? "product" : "category";
  const sort = parseChoice(sp.get("sort") ?? undefined, ["revenue", "quantity", "margin"] as const, "revenue");
  const { data, error } = await supabase.rpc("report_sales_by_product", { ...range, p_group: group, p_sort: sort, p_limit: 500 });
  if (error) return exportFailed(context, `report_${kind}`, error.code);
  return csvResponse(context, `report_${kind}`, file, reportGroupsExportRows(data ?? [], group, fr.reports.noCategory), false);
}

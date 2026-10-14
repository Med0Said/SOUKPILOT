import { NextResponse, type NextRequest } from "next/server";
import { hasPermission } from "@/lib/auth/organization";
import { catalogExportRows, type ExportProduct } from "@/lib/domain/exports";
import { collectPages, csvResponse, exportContext, exportFailed } from "@/lib/server/csv-export";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { catalogFilters } from "@/lib/ui/list-filters";

const CHUNK = 100;

/**
 * Articles matching the catalog filters, one row per variant, in the import
 * template's columns. Purchase costs only for roles allowed to see them
 * (RLS on product_variant_costs enforces it anyway).
 */
export async function GET(request: NextRequest) {
  const context = await exportContext();
  if (context instanceof NextResponse) return context;
  const orgId = context.membership.organizationId;
  const filters = catalogFilters(Object.fromEntries(request.nextUrl.searchParams));
  const withCosts = hasPermission(context, "catalog.viewCosts");
  const supabase = await createSupabaseServerClient();

  const matches = await collectPages(
    (offset, limit) =>
      supabase.rpc("search_products", {
        p_organization_id: orgId,
        p_query: filters.q,
        p_category_id: filters.category,
        p_include_inactive: filters.inactive,
        p_sort: filters.sort,
        p_limit: limit,
        p_offset: offset,
      }),
    CHUNK,
  );
  if (matches.error) return exportFailed(context, "catalog", matches.error);

  const products: ExportProduct[] = [];
  const ids = matches.rows.map((r) => r.product_id);
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const [details, variants] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, description, option_names, track_stock, is_active, categories ( name ), suppliers ( name )")
        .eq("organization_id", orgId)
        .in("id", chunk),
      supabase
        .from("product_variants")
        .select("id, product_id, option_values, sku, barcode, price_millimes, low_stock_threshold, is_active, created_at")
        .eq("organization_id", orgId)
        .in("product_id", chunk)
        .order("created_at"),
    ]);
    if (details.error || variants.error) return exportFailed(context, "catalog", (details.error ?? variants.error)?.code ?? "unknown");

    const costs = new Map<string, number | null>();
    if (withCosts) {
      const variantIds = (variants.data ?? []).map((v) => v.id);
      for (let j = 0; j < variantIds.length; j += 150) {
        const { data, error } = await supabase
          .from("product_variant_costs")
          .select("variant_id, cost_millimes")
          .in("variant_id", variantIds.slice(j, j + 150));
        if (error) return exportFailed(context, "catalog", error.code);
        for (const c of data ?? []) costs.set(c.variant_id, c.cost_millimes);
      }
    }

    const byId = new Map((details.data ?? []).map((p) => [p.id, p]));
    for (const id of chunk) {
      const p = byId.get(id);
      if (!p) continue;
      products.push({
        name: p.name,
        category: p.categories?.name ?? null,
        supplier: p.suppliers?.name ?? null,
        description: p.description,
        optionNames: p.option_names,
        trackStock: p.track_stock,
        isActive: p.is_active,
        variants: (variants.data ?? [])
          .filter((v) => v.product_id === id)
          .map((v) => ({
            optionValues: v.option_values,
            sku: v.sku,
            barcode: v.barcode,
            priceMillimes: v.price_millimes,
            costMillimes: costs.get(v.id) ?? null,
            lowStockThreshold: v.low_stock_threshold,
            isActive: v.is_active,
          })),
      });
    }
  }
  return csvResponse(context, "catalog", "articles", catalogExportRows(products, { withCosts }));
}

import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { variantLabel } from "@/lib/domain/catalog";
import { logger } from "@/lib/logger";

export type VariantInfo = { productId: string; productName: string; label: string; sku: string | null };

/**
 * Loads display names for a set of variant ids (RLS applies: ids from another
 * tenant simply come back missing).
 */
export async function loadVariantInfo(
  supabase: SupabaseServerClient,
  organizationId: string,
  variantIds: readonly string[],
): Promise<Map<string, VariantInfo>> {
  const ids = [...new Set(variantIds)];
  const result = new Map<string, VariantInfo>();
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, sku, option_values, product_id, products ( name )")
      .eq("organization_id", organizationId)
      .in("id", chunk);
    if (error) {
      logger.error("variants.load_failed", { organizationId, code: error.code });
      continue;
    }
    for (const v of data ?? []) {
      const productName = v.products?.name ?? "?";
      result.set(v.id, {
        productId: v.product_id,
        productName,
        label: v.option_values.length ? `${productName} (${variantLabel(v.option_values)})` : productName,
        sku: v.sku,
      });
    }
  }
  return result;
}

export async function loadLocations(supabase: SupabaseServerClient, organizationId: string) {
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, is_active")
    .eq("organization_id", organizationId)
    .order("created_at");
  if (error) logger.error("locations.load_failed", { organizationId, code: error.code });
  return data ?? [];
}

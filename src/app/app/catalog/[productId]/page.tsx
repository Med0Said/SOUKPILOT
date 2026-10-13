import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatTnd, formatTndInput } from "@/lib/domain/money";
import { variantLabel } from "@/lib/domain/catalog";
import { logger } from "@/lib/logger";
import { Alert, Badge, Card, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { ProductEditForm, VariantEditor } from "./product-editors";

export const metadata: Metadata = { title: fr.nav.catalog };

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { productId } = await params;
  const { created } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(productId)) notFound();

  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const canManage = hasPermission(context, "catalog.manage");
  const canViewCosts = hasPermission(context, "catalog.viewCosts");
  const t = fr.productPage;

  const supabase = await createSupabaseServerClient();
  const { data: product, error } = await supabase
    .from("products")
    .select("id, name, description, category_id, supplier_id, option_names, track_stock, is_active, categories ( name )")
    .eq("id", productId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) logger.error("product.load_failed", { organizationId: orgId, productId, code: error.code });
  if (!product) notFound();

  const [variantsResult, categoriesResult, suppliersResult] = await Promise.all([
    supabase
      .from("product_variants")
      .select("id, sku, barcode, option_values, price_millimes, low_stock_threshold, is_active")
      .eq("product_id", productId)
      .eq("organization_id", orgId)
      .order("created_at"),
    canManage ? supabase.from("categories").select("id, name").eq("organization_id", orgId).order("name") : null,
    canManage ? supabase.from("suppliers").select("id, name").eq("organization_id", orgId).order("name") : null,
  ]);
  const variants = variantsResult.data ?? [];
  // Costs are RLS-restricted to owner/manager; cashiers never request them.
  const costsResult =
    canViewCosts && variants.length > 0
      ? await supabase
          .from("product_variant_costs")
          .select("variant_id, cost_millimes")
          .in(
            "variant_id",
            variants.map((v) => v.id),
          )
      : { data: [] as { variant_id: string; cost_millimes: number | null }[] };
  const costs = new Map((costsResult.data ?? []).map((c) => [c.variant_id, c.cost_millimes]));

  return (
    <>
      <Link href="/app/catalog" className="mb-3 inline-block text-sm text-primary underline-offset-4 hover:underline">
        ← {fr.nav.catalog}
      </Link>
      <PageHeader
        title={product.name}
        subtitle={product.categories?.name ?? fr.catalog.noCategory}
        actions={
          <div className="flex gap-2">
            {!product.is_active ? <Badge>{fr.settings.inactive}</Badge> : null}
            {!product.track_stock ? <Badge>{fr.catalog.notTracked}</Badge> : null}
          </div>
        }
      />
      <div className="space-y-4">
        {created ? <Alert tone="success">{t.created}</Alert> : null}

        {canManage ? (
          <Card>
            <h2 className="mb-4 font-semibold">{t.details}</h2>
            <ProductEditForm
              organizationId={orgId}
              product={{
                id: product.id,
                name: product.name,
                description: product.description ?? "",
                categoryId: product.category_id ?? "",
                supplierId: product.supplier_id ?? "",
                trackStock: product.track_stock,
                isActive: product.is_active,
              }}
              categories={categoriesResult?.data ?? []}
              suppliers={suppliersResult?.data ?? []}
            />
          </Card>
        ) : product.description ? (
          <Card>
            <p className="whitespace-pre-line text-sm">{product.description}</p>
          </Card>
        ) : null}

        <section className="space-y-3">
          <h2 className="font-semibold">
            {fr.productForm.variants(variants.length)}
            {product.option_names.length > 0 ? (
              <span className="ms-2 text-sm font-normal text-muted">({product.option_names.join(" / ")})</span>
            ) : null}
          </h2>
          {variants.map((v) =>
            canManage ? (
              <Card key={v.id}>
                <VariantEditor
                  organizationId={orgId}
                  productId={product.id}
                  optionNames={product.option_names}
                  variant={{
                    id: v.id,
                    optionValues: v.option_values,
                    sku: v.sku ?? "",
                    barcode: v.barcode ?? "",
                    price: formatTndInput(v.price_millimes),
                    cost: formatTndInput(costs.get(v.id) ?? null),
                    threshold: v.low_stock_threshold === null ? "" : String(v.low_stock_threshold),
                    isActive: v.is_active,
                  }}
                />
              </Card>
            ) : (
              <Card key={v.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{variantLabel(v.option_values)}</p>
                    <p className="text-sm text-muted">
                      {[v.sku && `${fr.productForm.sku} ${v.sku}`, v.barcode && `${fr.productForm.barcode} ${v.barcode}`]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!v.is_active ? <Badge>{fr.settings.inactive}</Badge> : null}
                    <span className="font-medium tabular-nums">{formatTnd(v.price_millimes)}</span>
                  </div>
                </div>
              </Card>
            ),
          )}
          {canManage && product.option_names.length > 0 ? (
            <Card>
              <h3 className="mb-3 font-medium">{t.addVariant}</h3>
              <VariantEditor organizationId={orgId} productId={product.id} optionNames={product.option_names} />
            </Card>
          ) : null}
          <p className="text-xs text-muted">{t.stockLater}</p>
        </section>
      </div>
    </>
  );
}

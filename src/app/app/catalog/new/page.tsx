import type { Metadata } from "next";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert, Breadcrumbs, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { ProductForm } from "./product-form";

export const metadata: Metadata = { title: fr.catalog.newProduct };

export default async function NewProductPage() {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  if (!hasPermission(context, "catalog.manage")) {
    return <Alert tone="error">{fr.catalog.forbidden}</Alert>;
  }

  const supabase = await createSupabaseServerClient();
  const [categories, suppliers] = await Promise.all([
    supabase.from("categories").select("id, name").eq("organization_id", orgId).order("name"),
    supabase.from("suppliers").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("name"),
  ]);

  return (
    <>
      <Breadcrumbs items={[{ label: fr.nav.catalog, href: "/app/catalog" }, { label: fr.catalog.newProduct }]} />
      <PageHeader title={fr.catalog.newProduct} />
      <ProductForm organizationId={orgId} categories={categories.data ?? []} suppliers={suppliers.data ?? []} />
    </>
  );
}

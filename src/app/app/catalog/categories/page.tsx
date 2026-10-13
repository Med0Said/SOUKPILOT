import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { CategoryForm } from "./category-forms";

export const metadata: Metadata = { title: fr.catalog.categories };

export default async function CategoriesPage() {
  const context = await requireOrgContext();
  const orgId = context.membership.organizationId;
  const canManage = hasPermission(context, "catalog.manage");
  const t = fr.categoriesPage;

  const supabase = await createSupabaseServerClient();
  const { data: categories, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("organization_id", orgId)
    .order("name");
  if (error) logger.error("categories.load_failed", { organizationId: orgId, code: error.code });

  return (
    <>
      <Link href="/app/catalog" className="mb-3 inline-block text-sm text-primary underline-offset-4 hover:underline">
        ← {fr.nav.catalog}
      </Link>
      <PageHeader title={fr.catalog.categories} subtitle={t.subtitle} />
      <div className="space-y-4">
        {error ? <Alert tone="error">{fr.common.unexpectedError}</Alert> : null}
        {canManage ? (
          <Card>
            <h2 className="mb-3 font-semibold">{t.add}</h2>
            <CategoryForm organizationId={orgId} />
          </Card>
        ) : null}
        {(categories ?? []).length === 0 && !error ? <EmptyState title={t.empty} /> : null}
        {(categories ?? []).length > 0 ? (
          <Card>
            <ul className="divide-y divide-border">
              {(categories ?? []).map((c) => (
                <li key={c.id} className="py-3">
                  {canManage ? (
                    <CategoryForm organizationId={orgId} category={c} />
                  ) : (
                    <Link href={`/app/catalog?category=${c.id}`} className="text-sm hover:underline">
                      {c.name}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}

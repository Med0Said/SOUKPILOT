"use client";

import Link from "next/link";
import { useActionState } from "react";
import { TextField } from "@/components/ui/field";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { deleteCategoryAction, saveCategoryAction } from "@/app/_actions/catalog";
import { fr } from "@/i18n/fr";

const t = fr.categoriesPage;

export function CategoryForm({ organizationId, category }: { organizationId: string; category?: { id: string; name: string } }) {
  const [state, action] = useActionState(saveCategoryAction, initialActionState);
  const [deleteState, deleteAction] = useActionState(deleteCategoryAction, initialActionState);
  const prefix = category ? `cat-${category.id}` : "cat-new";
  return (
    <div className="space-y-2">
      <ActionMessage state={deleteState.status !== "idle" ? deleteState : state} />
      <div className="flex flex-wrap items-end gap-2">
        <form action={action} className="flex flex-1 flex-wrap items-end gap-2" noValidate>
          <input type="hidden" name="organizationId" value={organizationId} />
          {category ? <input type="hidden" name="categoryId" value={category.id} /> : null}
          <div className="min-w-48 flex-1">
            <TextField
              id={`${prefix}-name`}
              name="name"
              label={category ? t.name : t.newName}
              defaultValue={state.values?.name ?? category?.name}
              required
              error={state.fieldErrors?.name}
            />
          </div>
          <SubmitButton variant={category ? "secondary" : "primary"}>{category ? t.rename : t.create}</SubmitButton>
        </form>
        {category ? (
          <>
            <Link href={`/app/catalog?category=${category.id}`} className="min-h-11 content-center px-2 text-sm text-primary hover:underline">
              {t.viewProducts}
            </Link>
            <form action={deleteAction}>
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="categoryId" value={category.id} />
              <SubmitButton variant="danger" confirmMessage={t.confirmDelete}>
                {t.delete}
              </SubmitButton>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}

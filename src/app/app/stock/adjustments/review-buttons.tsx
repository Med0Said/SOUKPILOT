"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { reviewAdjustmentAction } from "@/app/_actions/stock";
import { fr } from "@/i18n/fr";

const t = fr.stock.adjustments;

export function ReviewButtons({ adjustmentId }: { adjustmentId: string }) {
  const [state, action] = useActionState(reviewAdjustmentAction, initialActionState);
  return (
    <form action={action} className="mt-3 space-y-2">
      <ActionMessage state={state} />
      <input type="hidden" name="adjustmentId" value={adjustmentId} />
      <label htmlFor={`note-${adjustmentId}`} className="sr-only">
        {t.reviewNote}
      </label>
      <input
        id={`note-${adjustmentId}`}
        name="note"
        placeholder={t.reviewNote}
        maxLength={500}
        className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
      />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="approve" confirmMessage={t.confirmApprove}>
          {t.approve}
        </SubmitButton>
        <SubmitButton name="decision" value="reject" variant="secondary">
          {t.reject}
        </SubmitButton>
      </div>
    </form>
  );
}

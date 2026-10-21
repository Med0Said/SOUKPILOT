"use client";

import { AlertTriangle } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { fr } from "@/i18n/fr";
import { Button } from "./button";

/**
 * Submit button that disables itself while the form's action is pending,
 * preventing double submission from repeated taps. (Server-side idempotency
 * is still required for financial operations; this is UX only.)
 *
 * With `confirmMessage`, a native modal <dialog> asks for confirmation first
 * (focus trapped, Esc cancels, background inert). Confirming re-clicks this
 * very button, so its name/value/formAction are submitted unchanged.
 */
export function SubmitButton({
  children,
  pendingLabel = fr.ui.pending,
  variant = "primary",
  className = "",
  confirmMessage,
  name,
  value,
  formAction,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  /** Asks for confirmation before submitting (destructive or irreversible actions). */
  confirmMessage?: string;
  name?: string;
  value?: string;
  /** Alternative action for this button (one form, several submit actions). */
  formAction?: (formData: FormData) => void;
}) {
  const { pending } = useFormStatus();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmed = useRef(false);
  const titleId = useId();

  return (
    <>
      <Button
        ref={buttonRef}
        type="submit"
        variant={variant}
        className={className}
        disabled={pending}
        aria-disabled={pending}
        name={name}
        value={value}
        formAction={formAction}
        onClick={(event) => {
          if (!confirmMessage || confirmed.current) {
            confirmed.current = false;
            return;
          }
          event.preventDefault();
          dialogRef.current?.showModal();
        }}
      >
        {pending ? pendingLabel : children}
      </Button>
      {confirmMessage ? (
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface-raised p-0 text-foreground shadow-xl"
        >
          <div className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full ${
                  variant === "danger" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary"
                }`}
              >
                <AlertTriangle aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 id={titleId} className="font-semibold">
                  {fr.ui.confirm.title}
                </h2>
                <p className="mt-1 text-sm text-muted">{confirmMessage}</p>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
                {fr.ui.confirm.cancel}
              </Button>
              <Button
                variant={variant === "danger" ? "danger" : "primary"}
                autoFocus
                onClick={() => {
                  dialogRef.current?.close();
                  confirmed.current = true;
                  buttonRef.current?.click();
                }}
              >
                {/* Names the action ("Annuler la commande", "Valider la vente"). */}
                {typeof children === "string" ? children : fr.ui.confirm.confirm}
              </Button>
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}

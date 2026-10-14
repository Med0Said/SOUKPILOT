"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

/**
 * Submit button that disables itself while the form's action is pending,
 * preventing double submission from repeated taps. (Server-side idempotency
 * is still required for financial operations; this is UX only.)
 */
export function SubmitButton({
  children,
  pendingLabel = "Patientez…",
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
  /** Asks for confirmation before submitting (destructive actions). */
  confirmMessage?: string;
  name?: string;
  value?: string;
  /** Alternative action for this button (one form, several submit actions). */
  formAction?: (formData: FormData) => void;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      disabled={pending}
      aria-disabled={pending}
      name={name}
      value={value}
      formAction={formAction}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}

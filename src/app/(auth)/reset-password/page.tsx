import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { fr } from "@/i18n/fr";
import { ResetPasswordForm } from "../forms";

export const metadata: Metadata = { title: fr.auth.resetTitle };

/** Reached from the recovery email via /auth/confirm, which opens a session. */
export default async function ResetPasswordPage() {
  await requireUser("/reset-password");
  return (
    <>
      <h1 className="text-xl font-semibold">{fr.auth.resetTitle}</h1>
      <p className="mb-5 mt-1 text-sm text-muted">{fr.auth.resetSubtitle}</p>
      <ResetPasswordForm />
    </>
  );
}

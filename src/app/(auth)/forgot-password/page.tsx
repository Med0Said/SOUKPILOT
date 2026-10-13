import type { Metadata } from "next";
import { fr } from "@/i18n/fr";
import { ForgotPasswordForm } from "../forms";

export const metadata: Metadata = { title: fr.auth.forgotTitle };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">{fr.auth.forgotTitle}</h1>
      <p className="mb-5 mt-1 text-sm text-muted">{fr.auth.forgotSubtitle}</p>
      <ForgotPasswordForm />
    </>
  );
}

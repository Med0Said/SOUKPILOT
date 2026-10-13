import type { Metadata } from "next";
import { fr } from "@/i18n/fr";
import { SignUpForm } from "../forms";

export const metadata: Metadata = { title: fr.auth.signupTitle };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">{fr.auth.signupTitle}</h1>
      <p className="mb-5 mt-1 text-sm text-muted">{fr.auth.signupSubtitle}</p>
      <SignUpForm />
    </>
  );
}

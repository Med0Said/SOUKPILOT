import type { Metadata } from "next";
import { Alert } from "@/components/ui/layout";
import { safeNextPath } from "@/lib/auth/routes";
import { fr } from "@/i18n/fr";
import { LoginForm } from "../forms";

export const metadata: Metadata = { title: fr.auth.loginTitle };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold">{fr.auth.loginTitle}</h1>
      <p className="mb-5 mt-1 text-sm text-muted">{fr.auth.loginSubtitle}</p>
      {error === "link" ? (
        <div className="mb-4">
          <Alert tone="error">{fr.auth.confirmFailed}</Alert>
        </div>
      ) : null}
      <LoginForm next={next ? safeNextPath(next) : undefined} />
    </>
  );
}

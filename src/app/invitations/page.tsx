import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { messageForDbError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { formatDate } from "@/lib/format";
import { Alert } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { InvitationResponse } from "./invitation-response";

export const metadata: Metadata = { title: fr.invitations.title };

export default async function InvitationsPage() {
  await requireUser("/invitations");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_my_invitations");
  if (error && error.message !== "email_not_confirmed") {
    logger.error("invitations.list_failed", { code: error.code });
  }
  const invitations = data ?? [];

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <p className="mb-6 text-xl font-semibold text-primary">{fr.app.name}</p>
      <h1 className="text-2xl font-semibold">{fr.invitations.title}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{fr.invitations.subtitle}</p>

      {error ? <Alert tone="error">{messageForDbError(error)}</Alert> : null}

      {!error && invitations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {fr.invitations.empty}
        </p>
      ) : null}

      <ul className="space-y-3">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="rounded-xl border border-border bg-surface p-4">
            <p className="font-medium">{invitation.organization_name}</p>
            <p className="text-sm text-muted">
              {fr.invitations.invitedAs} : {fr.roles[invitation.role]} · {fr.invitations.expires}{" "}
              {formatDate(invitation.expires_at, "Africa/Tunis")}
            </p>
            <InvitationResponse invitationId={invitation.id} />
          </li>
        ))}
      </ul>

      <Link href="/onboarding" className="mt-6 inline-block text-sm text-primary underline-offset-4 hover:underline">
        {fr.invitations.createOwn}
      </Link>
    </main>
  );
}

import type { Metadata } from "next";
import { hasPermission, requireOrgContext } from "@/lib/auth/organization";
import { invitableRoles } from "@/lib/auth/permissions";
import { createSupabaseServerClient, type SupabaseServerClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { getPublicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { Alert, Card, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { InviteForm, MemberActions, RevokeInvitationButton } from "./member-forms";

export const metadata: Metadata = { title: fr.members.title };

/** Pending, non-expired invitations (RLS: owner/manager of the org only). */
function loadPendingInvitations(supabase: SupabaseServerClient, organizationId: string) {
  return supabase
    .from("organization_invitations")
    .select("id, email, role, expires_at, created_at")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
}

export default async function MembersPage() {
  const context = await requireOrgContext();
  const { membership, user } = context;
  const orgId = membership.organizationId;
  const canManage = hasPermission(context, "members.manage");
  const canSeeInvitations = hasPermission(context, "invitations.view");

  const supabase = await createSupabaseServerClient();
  const [membersResult, invitationsResult] = await Promise.all([
    supabase.rpc("list_organization_members", { p_organization_id: orgId }),
    canSeeInvitations ? loadPendingInvitations(supabase, orgId) : Promise.resolve({ data: [], error: null }),
  ]);
  if (membersResult.error) logger.error("members.load_failed", { organizationId: orgId, code: membersResult.error.code });
  if (invitationsResult.error) {
    logger.error("invitations.load_failed", { organizationId: orgId, code: invitationsResult.error.code });
  }

  const members = membersResult.data ?? [];
  const invitations = invitationsResult.data ?? [];
  const roles = invitableRoles(membership.role);

  return (
    <>
      <PageHeader title={fr.members.title} subtitle={fr.members.subtitle} />
      <div className="space-y-4">
        <Card>
          {membersResult.error ? <Alert tone="error">{fr.common.unexpectedError}</Alert> : null}
          <ul className="divide-y divide-border">
            {members.map((member) => {
              const isSelf = member.user_id === user.id;
              return (
                <li key={member.user_id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {member.full_name || fr.members.noName}
                      {isSelf ? <span className="ms-2 text-xs text-muted">({fr.members.you})</span> : null}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {member.email ? `${member.email} · ` : ""}
                      {fr.roles[member.role]} · {fr.members.joined} {formatDate(member.joined_at, membership.timezone)}
                    </p>
                  </div>
                  <MemberActions
                    organizationId={orgId}
                    userId={member.user_id}
                    role={member.role}
                    isSelf={isSelf}
                    canManage={canManage}
                  />
                </li>
              );
            })}
          </ul>
        </Card>

        {roles.length > 0 ? (
          <Card>
            <h2 className="mb-1 font-semibold">{fr.members.inviteTitle}</h2>
            <p className="mb-4 text-sm text-muted">{fr.members.inviteHelp}</p>
            <InviteForm
              organizationId={orgId}
              organizationName={membership.organizationName}
              siteUrl={getPublicEnv().NEXT_PUBLIC_SITE_URL}
              roles={roles}
            />
          </Card>
        ) : null}

        {canSeeInvitations ? (
          <Card>
            <h2 className="mb-3 font-semibold">{fr.members.pendingTitle}</h2>
            {invitations.length === 0 ? <p className="text-sm text-muted">{fr.members.noPending}</p> : null}
            <ul className="divide-y divide-border">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-medium">{invitation.email}</p>
                    <p className="text-muted">
                      {fr.roles[invitation.role]} · {fr.invitations.expires}{" "}
                      {formatDate(invitation.expires_at, membership.timezone)}
                    </p>
                  </div>
                  {roles.includes(invitation.role) ? <RevokeInvitationButton invitationId={invitation.id} /> : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}

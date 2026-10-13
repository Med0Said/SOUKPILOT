"use client";

import { useActionState } from "react";
import { SelectField, TextField } from "@/components/ui/field";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import type { OrgRole } from "@/lib/supabase/database.types";
import {
  createInvitationAction,
  removeMemberAction,
  revokeInvitationAction,
  updateMemberRoleAction,
} from "@/app/_actions/organizations";
import { fr } from "@/i18n/fr";

const ALL_ROLES: OrgRole[] = ["owner", "manager", "cashier"];

export function MemberActions({
  organizationId,
  userId,
  role,
  isSelf,
  canManage,
}: {
  organizationId: string;
  userId: string;
  role: OrgRole;
  isSelf: boolean;
  canManage: boolean;
}) {
  const [roleState, roleAction] = useActionState(updateMemberRoleAction, initialActionState);
  const [removeState, removeAction] = useActionState(removeMemberAction, initialActionState);

  if (!canManage && !isSelf) return null;

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <ActionMessage state={roleState.status !== "idle" ? roleState : removeState} />
      <div className="flex flex-wrap items-end gap-2">
        {canManage && !isSelf ? (
          <form action={roleAction} className="flex items-end gap-2">
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="userId" value={userId} />
            <div className="w-40">
              <SelectField
                id={`role-${userId}`}
                name="role"
                label={fr.members.changeRole}
                defaultValue={role}
                options={ALL_ROLES.map((r) => ({ value: r, label: fr.roles[r] }))}
              />
            </div>
            <SubmitButton variant="secondary">{fr.members.applyRole}</SubmitButton>
          </form>
        ) : null}
        <form action={removeAction}>
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="userId" value={userId} />
          <SubmitButton
            variant="danger"
            confirmMessage={isSelf ? fr.members.confirmLeave : fr.members.confirmRemove}
          >
            {isSelf ? fr.members.leave : fr.members.remove}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

export function InviteForm({ organizationId, roles }: { organizationId: string; roles: OrgRole[] }) {
  const [state, action] = useActionState(createInvitationAction, initialActionState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <ActionMessage state={state} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <TextField
          id="invite-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          label={fr.auth.email}
          required
          defaultValue={state.status === "error" ? state.values?.email : undefined}
          error={state.fieldErrors?.email}
        />
        <SelectField
          id="invite-role"
          name="role"
          label={fr.members.role}
          defaultValue={roles[roles.length - 1]}
          error={state.fieldErrors?.role}
          options={roles.map((r) => ({ value: r, label: fr.roles[r] }))}
        />
      </div>
      <SubmitButton>{fr.members.inviteButton}</SubmitButton>
    </form>
  );
}

export function RevokeInvitationButton({ invitationId }: { invitationId: string }) {
  const [state, action] = useActionState(revokeInvitationAction, initialActionState);
  return (
    <form action={action} className="flex flex-col gap-2 sm:items-end">
      <ActionMessage state={state} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <SubmitButton variant="secondary">{fr.members.revoke}</SubmitButton>
    </form>
  );
}

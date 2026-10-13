"use server";

/**
 * Server actions for organizations, members, invitations and profile.
 *
 * Every action: (1) re-reads the session, (2) validates input with Zod,
 * (3) calls Supabase with the USER's JWT so RLS / SECURITY DEFINER functions
 * make the final authorization decision, (4) maps errors to French messages.
 * No service-role key is used.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { membershipFor, setActiveOrganizationCookie } from "@/lib/auth/organization";
import { can } from "@/lib/auth/permissions";
import { isKnownDbError, messageForDbError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ActionState } from "@/lib/actions";
import {
  createOrganizationSchema,
  fieldErrorsFrom,
  formDataToObject,
  invitationRefSchema,
  invitationSchema,
  memberRefSchema,
  memberRoleSchema,
  profileSchema,
  updateOrganizationSchema,
} from "@/lib/validation/schemas";
import { fr } from "@/i18n/fr";

const FORBIDDEN: ActionState = { status: "error", message: messageForDbError({ message: "forbidden" }) };

function dbFailure(event: string, error: { message?: string; code?: string }, fields: Record<string, unknown> = {}): ActionState {
  if (!isKnownDbError(error)) {
    logger.error(event, { ...fields, code: error.code, message: error.message });
  }
  return { status: "error", message: messageForDbError(error) };
}

export async function createOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/onboarding");
  const raw = formDataToObject(formData);
  const parsed = createOrganizationSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values: raw };
  }

  const supabase = await createSupabaseServerClient();
  const { data: organizationId, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_timezone: parsed.data.timezone,
    p_location_name: parsed.data.locationName,
  });
  if (error || !organizationId) {
    return { ...dbFailure("organization.create_failed", error ?? {}, { userId: user.id }), values: raw };
  }

  logger.info("organization.created", { userId: user.id, organizationId });
  await setActiveOrganizationCookie(organizationId);
  redirect("/app");
}

export async function switchOrganizationAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const context = await membershipFor(organizationId);
  // Silently ignore ids the user is not a member of (no information leak).
  if (context) await setActiveOrganizationCookie(organizationId);
  redirect("/app");
}

export async function updateOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = updateOrganizationSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values: raw };
  }
  const context = await membershipFor(parsed.data.organizationId);
  if (!context || !can(context.membership.role, "organization.update")) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name, timezone: parsed.data.timezone })
    .eq("id", parsed.data.organizationId)
    .select("id");
  if (error) return dbFailure("organization.update_failed", error, { organizationId: parsed.data.organizationId });
  // RLS filtered the row out: the caller is not (or no longer) an owner.
  if (!data || data.length === 0) return FORBIDDEN;

  revalidatePath("/app", "layout");
  return { status: "success", message: fr.settings.saved };
}

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/app/profile");
  const raw = formDataToObject(formData);
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values: raw };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone })
    .eq("id", user.id);
  if (error) return dbFailure("profile.update_failed", error, { userId: user.id });

  revalidatePath("/app", "layout");
  return { status: "success", message: fr.profile.saved };
}

export async function createInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = invitationSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values: raw };
  }
  const context = await membershipFor(parsed.data.organizationId);
  if (!context || !can(context.membership.role, "invitations.create")) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_invitation", {
    p_organization_id: parsed.data.organizationId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error) {
    return { ...dbFailure("invitation.create_failed", error, { organizationId: parsed.data.organizationId }), values: raw };
  }

  revalidatePath("/app/settings/members");
  return { status: "success", message: fr.members.invited, values: { email: parsed.data.email } };
}

export async function revokeInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = invitationRefSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: parsed.data.invitationId });
  if (error) return dbFailure("invitation.revoke_failed", error);

  revalidatePath("/app/settings/members");
  return { status: "success", message: fr.members.revoked };
}

export async function respondToInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser("/invitations");
  const parsed = invitationRefSchema.safeParse(formDataToObject(formData));
  const decision = formData.get("decision");
  if (!parsed.success || (decision !== "accept" && decision !== "decline")) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { data: organizationId, error } = await supabase.rpc("respond_to_invitation", {
    p_invitation_id: parsed.data.invitationId,
    p_accept: decision === "accept",
  });
  if (error) return dbFailure("invitation.respond_failed", error);

  if (decision === "accept" && organizationId) {
    await setActiveOrganizationCookie(organizationId);
    redirect("/app");
  }
  revalidatePath("/invitations");
  return { status: "success", message: fr.invitations.declined };
}

export async function updateMemberRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = memberRoleSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: messageForDbError({ message: "invalid_role" }) };
  const context = await membershipFor(parsed.data.organizationId);
  if (!context || !can(context.membership.role, "members.manage")) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_member_role", {
    p_organization_id: parsed.data.organizationId,
    p_user_id: parsed.data.userId,
    p_role: parsed.data.role,
  });
  if (error) return dbFailure("member.role_update_failed", error, { organizationId: parsed.data.organizationId });

  revalidatePath("/app/settings/members");
  return { status: "success", message: fr.members.roleUpdated };
}

export async function removeMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = memberRefSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return FORBIDDEN;
  const context = await membershipFor(parsed.data.organizationId);
  if (!context) return FORBIDDEN;
  const leaving = parsed.data.userId === context.user.id;
  if (!leaving && !can(context.membership.role, "members.manage")) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_member", {
    p_organization_id: parsed.data.organizationId,
    p_user_id: parsed.data.userId,
  });
  if (error) return dbFailure("member.remove_failed", error, { organizationId: parsed.data.organizationId });

  if (leaving) redirect("/app");
  revalidatePath("/app/settings/members");
  return { status: "success", message: fr.members.removed };
}

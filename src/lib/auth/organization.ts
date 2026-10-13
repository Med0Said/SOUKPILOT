import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LocaleCode, OrgRole } from "@/lib/supabase/database.types";
import { logger } from "@/lib/logger";
import { can, type Permission } from "./permissions";
import { requireUser, type CurrentUser } from "./session";

/**
 * Cookie remembering which organization the user is working in. It is only a
 * PREFERENCE: every read re-validates it against the user's memberships (via
 * RLS), so tampering with it can at most select another org the user already
 * belongs to.
 */
export const ACTIVE_ORG_COOKIE = "sp_active_org";

export type Membership = {
  organizationId: string;
  organizationName: string;
  role: OrgRole;
  timezone: string;
  currencyCode: string;
  defaultLocale: LocaleCode;
};

export const getMemberships = cache(async (userId: string): Promise<Membership[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organization_id, organizations ( id, name, timezone, currency_code, default_locale )")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    logger.error("memberships.load_failed", { userId, code: error.code });
    throw new Error("Unable to load memberships");
  }

  return (data ?? []).flatMap((row) => {
    const org = row.organizations;
    if (!org) return [];
    return [
      {
        organizationId: org.id,
        organizationName: org.name,
        role: row.role,
        timezone: org.timezone,
        currencyCode: org.currency_code,
        defaultLocale: org.default_locale,
      },
    ];
  });
});

export type OrgContext = {
  user: CurrentUser;
  membership: Membership;
  memberships: Membership[];
};

/** The active membership for the signed-in user, or null if they have none. */
export const getActiveContext = cache(async (): Promise<OrgContext | null> => {
  const user = await requireUser();
  const memberships = await getMemberships(user.id);
  if (memberships.length === 0) return null;
  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const membership = memberships.find((m) => m.organizationId === preferred) ?? memberships[0];
  return { user, membership, memberships };
});

/**
 * Page guard: signed in AND member of an organization. Redirects to
 * onboarding otherwise. Pass a permission to also require a role; callers
 * decide how to render a refusal (we do not leak whether data exists).
 */
export async function requireOrgContext(): Promise<OrgContext> {
  const context = await getActiveContext();
  if (!context) redirect("/onboarding");
  return context;
}

export function hasPermission(context: OrgContext, permission: Permission): boolean {
  return can(context.membership.role, permission);
}

/**
 * Server-action guard: resolves the membership for a client-supplied
 * organization id. The id is never trusted on its own — it must match one of
 * the caller's memberships. Returns null when it does not.
 */
export async function membershipFor(organizationId: string): Promise<OrgContext | null> {
  const user = await requireUser();
  const memberships = await getMemberships(user.id);
  const membership = memberships.find((m) => m.organizationId === organizationId);
  return membership ? { user, membership, memberships } : null;
}

export async function setActiveOrganizationCookie(organizationId: string): Promise<void> {
  (await cookies()).set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearActiveOrganizationCookie(): Promise<void> {
  (await cookies()).delete(ACTIVE_ORG_COOKIE);
}

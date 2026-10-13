import type { OrgRole } from "@/lib/supabase/database.types";

/**
 * UI-level permission matrix. It only decides what to SHOW; the database
 * (RLS policies + SECURITY DEFINER functions) is the authority and enforces
 * the same rules. Keep both in sync — tests/db/tenant-isolation.test.ts
 * covers the database side.
 */
export const PERMISSIONS = {
  "organization.update": ["owner"],
  "members.manage": ["owner"],
  "invitations.view": ["owner", "manager"],
  "invitations.create": ["owner", "manager"],
  "audit.view": ["owner", "manager"],
  "locations.manage": ["owner", "manager"],
} as const satisfies Record<string, readonly OrgRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: OrgRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly OrgRole[]).includes(role);
}

/** Roles a member with `role` may invite (mirrors public.create_invitation). */
export function invitableRoles(role: OrgRole): OrgRole[] {
  switch (role) {
    case "owner":
      return ["manager", "cashier"];
    case "manager":
      return ["cashier"];
    case "cashier":
      return [];
  }
}

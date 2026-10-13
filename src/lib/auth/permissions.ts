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
  "catalog.manage": ["owner", "manager"],
  /** Purchase costs and margins: hidden from cashiers (RLS on product_variant_costs). */
  "catalog.viewCosts": ["owner", "manager"],
  "catalog.import": ["owner", "manager"],
  "suppliers.manage": ["owner", "manager"],
  /** Stock quantities and movement history. */
  "stock.view": ["owner", "manager", "cashier"],
  /** Receipts and opening stock carry purchase costs. */
  "stock.receive": ["owner", "manager"],
  "stock.transfer": ["owner", "manager"],
  /** Anyone may propose an adjustment or count items; only owner/manager approve. */
  "stock.adjust.propose": ["owner", "manager", "cashier"],
  "stock.adjust.review": ["owner", "manager"],
  "stock.count.manage": ["owner", "manager"],
  "stock.count.record": ["owner", "manager", "cashier"],
  "stock.valuation": ["owner", "manager"],
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

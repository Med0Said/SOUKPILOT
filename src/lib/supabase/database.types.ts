/**
 * Database types for the Supabase client.
 *
 * Hand-written for Milestone 1 to mirror supabase/migrations (no local Supabase
 * stack was available to generate them). Once `npx supabase start` works,
 * regenerate with `npm run db:types` and diff against this file.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type OrgRole = "owner" | "manager" | "cashier";
export type InvitationStatus = "pending" | "accepted" | "declined" | "revoked";
export type LocaleCode = "fr" | "ar";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13";
  };
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          currency_code: string;
          timezone: string;
          default_locale: LocaleCode;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          name?: string;
          timezone?: string;
          default_locale?: LocaleCode;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          organization_id: string;
          user_id: string;
          role: OrgRole;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone: string | null;
          locale: LocaleCode;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          full_name?: string;
          phone?: string | null;
          locale?: LocaleCode;
        };
        Relationships: [];
      };
      locations: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          code: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          name: string;
          code?: string | null;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          code?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      organization_invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: OrgRole;
          status: InvitationStatus;
          invited_by: string | null;
          expires_at: string;
          responded_by: string | null;
          responded_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          organization_id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          details: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_organization: {
        Args: { p_name: string; p_timezone?: string; p_location_name?: string };
        Returns: string;
      };
      list_organization_members: {
        Args: { p_organization_id: string };
        Returns: {
          user_id: string;
          full_name: string;
          email: string | null;
          role: OrgRole;
          joined_at: string;
        }[];
      };
      update_member_role: {
        Args: { p_organization_id: string; p_user_id: string; p_role: OrgRole };
        Returns: undefined;
      };
      remove_member: {
        Args: { p_organization_id: string; p_user_id: string };
        Returns: undefined;
      };
      create_invitation: {
        Args: { p_organization_id: string; p_email: string; p_role: OrgRole };
        Returns: string;
      };
      revoke_invitation: {
        Args: { p_invitation_id: string };
        Returns: undefined;
      };
      list_my_invitations: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          organization_id: string;
          organization_name: string;
          role: OrgRole;
          expires_at: string;
          created_at: string;
        }[];
      };
      respond_to_invitation: {
        Args: { p_invitation_id: string; p_accept: boolean };
        Returns: string;
      };
    };
    Enums: {
      org_role: OrgRole;
      invitation_status: InvitationStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

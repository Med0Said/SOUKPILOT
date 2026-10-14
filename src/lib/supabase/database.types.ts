/**
 * Database types for the Supabase client.
 *
 * Hand-written to mirror supabase/migrations (no local Supabase
 * stack was available to generate them). Once `npx supabase start` works,
 * regenerate with `npm run db:types` and diff against this file.
 */
export type IntegrationKey = "barcode_lookup" | "exchange_rates";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type OrgRole = "owner" | "manager" | "cashier";
export type InvitationStatus = "pending" | "accepted" | "declined" | "revoked";
export type LocaleCode = "fr" | "ar";
export type PaymentMethodKind = "cash" | "card" | "transfer" | "check" | "mobile" | "other";
export type SaleStatus = "draft" | "finalized" | "cancelled";
export type PurchaseOrderStatus = "draft" | "ordered" | "partially_received" | "received" | "closed" | "cancelled";
export type StockMovementType =
  | "opening"
  | "purchase_receipt"
  | "sale"
  | "customer_return"
  | "supplier_return"
  | "adjustment"
  | "transfer_out"
  | "transfer_in";

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
          cashier_max_discount_bps: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          name?: string;
          timezone?: string;
          default_locale?: LocaleCode;
          cashier_max_discount_bps?: number;
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
      categories: {
        Row: { id: string; organization_id: string; name: string; created_at: string; updated_at: string };
        Insert: { organization_id: string; name: string };
        Update: { name?: string };
        Relationships: [];
      };
      organization_integrations: {
        Row: {
          id: string;
          organization_id: string;
          integration: IntegrationKey;
          enabled: boolean;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      suppliers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          phone: string | null;
          email: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          notes?: string | null;
          is_active?: boolean;
        };
        Update: { name?: string; phone?: string | null; email?: string | null; notes?: string | null; is_active?: boolean };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          category_id: string | null;
          supplier_id: string | null;
          option_names: string[];
          track_stock: boolean;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          name?: string;
          description?: string | null;
          category_id?: string | null;
          supplier_id?: string | null;
          track_stock?: boolean;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "products_organization_id_category_id_fkey";
            columns: ["organization_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "products_organization_id_supplier_id_fkey";
            columns: ["organization_id", "supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      product_variants: {
        Row: {
          id: string;
          organization_id: string;
          product_id: string;
          sku: string | null;
          barcode: string | null;
          option_values: string[];
          price_millimes: number;
          low_stock_threshold: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          product_id: string;
          sku?: string | null;
          barcode?: string | null;
          option_values: string[];
          price_millimes: number;
          low_stock_threshold?: number | null;
          is_active?: boolean;
        };
        Update: {
          sku?: string | null;
          barcode?: string | null;
          option_values?: string[];
          price_millimes?: number;
          low_stock_threshold?: number | null;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_organization_id_product_id_fkey";
            columns: ["organization_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      product_variant_costs: {
        Row: { variant_id: string; organization_id: string; cost_millimes: number | null; updated_at: string };
        Insert: never;
        Update: { cost_millimes?: number | null };
        Relationships: [];
      };
      catalog_import_batches: {
        Row: {
          id: string;
          organization_id: string;
          status: "pending" | "committed";
          file_name: string;
          products: NonNullable<Json>;
          summary: NonNullable<Json>;
          created_by: string | null;
          created_at: string;
          committed_by: string | null;
          committed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      document_sequences: {
        Row: { organization_id: string; doc_type: string; next_value: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stock_opening_costs: {
        Row: { adjustment_id: string; organization_id: string; variant_id: string; unit_cost_millimes: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stock_levels: {
        Row: { organization_id: string; location_id: string; variant_id: string; quantity: number; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stock_movements: {
        Row: {
          id: string;
          seq: number;
          organization_id: string;
          location_id: string;
          variant_id: string;
          quantity_delta: number;
          quantity_after: number;
          movement_type: StockMovementType;
          source_type: string;
          source_id: string;
          reason: string | null;
          actor_id: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stock_receipts: {
        Row: {
          id: string;
          organization_id: string;
          number: number;
          location_id: string;
          supplier_id: string | null;
          reference: string | null;
          note: string | null;
          idempotency_key: string;
          created_by: string | null;
          created_at: string;
          total_cost_millimes: number;
          lines_without_cost: number;
          purchase_order_id: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stock_receipt_lines: {
        Row: {
          receipt_id: string;
          organization_id: string;
          variant_id: string;
          quantity: number;
          unit_cost_millimes: number | null;
          purchase_order_item_id: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stock_adjustments: {
        Row: {
          id: string;
          organization_id: string;
          number: number;
          kind: "opening" | "adjustment";
          status: "pending" | "approved" | "rejected";
          location_id: string;
          reason: string;
          idempotency_key: string;
          created_by: string | null;
          created_at: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          review_note: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stock_adjustment_lines: {
        Row: { adjustment_id: string; organization_id: string; variant_id: string; quantity_delta: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stock_counts: {
        Row: {
          id: string;
          organization_id: string;
          number: number;
          location_id: string;
          status: "in_progress" | "submitted" | "approved" | "cancelled";
          note: string | null;
          idempotency_key: string;
          created_by: string | null;
          created_at: string;
          submitted_by: string | null;
          submitted_at: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stock_count_items: {
        Row: {
          count_id: string;
          organization_id: string;
          variant_id: string;
          expected_quantity: number | null;
          counted_quantity: number | null;
          counted_by: string | null;
          counted_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stock_transfers: {
        Row: {
          id: string;
          organization_id: string;
          number: number;
          from_location_id: string;
          to_location_id: string;
          note: string | null;
          idempotency_key: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stock_transfer_lines: {
        Row: { transfer_id: string; organization_id: string; variant_id: string; quantity: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      payment_methods: {
        Row: {
          id: string;
          organization_id: string;
          label: string;
          kind: PaymentMethodKind;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: { organization_id: string; label: string; kind: PaymentMethodKind; sort_order?: number; is_active?: boolean };
        Update: { label?: string; kind?: PaymentMethodKind; sort_order?: number; is_active?: boolean };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          phone: string | null;
          address: string | null;
          notes: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { organization_id: string; name: string; phone?: string | null; address?: string | null; notes?: string | null };
        Update: { name?: string; phone?: string | null; address?: string | null; notes?: string | null; is_active?: boolean };
        Relationships: [];
      };
      sales: {
        Row: {
          id: string;
          organization_id: string;
          location_id: string;
          number: number | null;
          status: SaleStatus;
          customer_id: string | null;
          note: string | null;
          subtotal_millimes: number;
          line_discount_millimes: number;
          order_discount_millimes: number;
          total_millimes: number;
          returned_millimes: number;
          paid_millimes: number;
          finalize_idempotency_key: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          finalized_by: string | null;
          finalized_at: string | null;
          cancelled_by: string | null;
          cancelled_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "sales_organization_id_customer_id_fkey";
            columns: ["organization_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      sale_items: {
        Row: {
          id: string;
          organization_id: string;
          sale_id: string;
          line_no: number;
          variant_id: string;
          product_name: string;
          variant_label: string;
          track_stock: boolean;
          quantity: number;
          unit_price_millimes: number;
          discount_bps: number;
          gross_millimes: number;
          line_discount_millimes: number;
          line_total_millimes: number;
          order_discount_share_millimes: number;
          net_total_millimes: number;
          returned_quantity: number;
          returned_millimes: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sale_item_costs: {
        Row: { sale_item_id: string; organization_id: string; unit_cost_millimes: number | null };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sale_payments: {
        Row: {
          id: string;
          organization_id: string;
          sale_id: string;
          method_id: string;
          kind: "payment" | "refund";
          amount_millimes: number;
          idempotency_key: string | null;
          return_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sale_returns: {
        Row: {
          id: string;
          organization_id: string;
          sale_id: string;
          number: number;
          reason: string;
          amount_millimes: number;
          idempotency_key: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sale_return_items: {
        Row: {
          return_id: string;
          organization_id: string;
          sale_item_id: string;
          quantity: number;
          restock: boolean;
          amount_millimes: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          id: string;
          organization_id: string;
          number: number | null;
          status: PurchaseOrderStatus;
          supplier_id: string;
          location_id: string;
          expected_date: string | null;
          reference: string | null;
          note: string | null;
          ordered_total_millimes: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          ordered_by: string | null;
          ordered_at: string | null;
          closed_by: string | null;
          closed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "purchase_orders_organization_id_supplier_id_fkey";
            columns: ["organization_id", "supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      purchase_order_items: {
        Row: {
          id: string;
          organization_id: string;
          purchase_order_id: string;
          line_no: number;
          variant_id: string;
          quantity: number;
          unit_cost_millimes: number;
          received_quantity: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      supplier_payments: {
        Row: {
          id: string;
          organization_id: string;
          supplier_id: string;
          method_id: string;
          kind: "payment" | "refund";
          amount_millimes: number;
          paid_on: string;
          reference: string | null;
          note: string | null;
          purchase_order_id: string | null;
          idempotency_key: string;
          created_by: string | null;
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
          details: NonNullable<Json>;
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
      create_product: {
        Args: { p_organization_id: string; p_product: Json };
        Returns: string;
      };
      save_variant: {
        Args: { p_organization_id: string; p_product_id: string; p_variant_id: string | null; p_variant: Json };
        Returns: string;
      };
      search_products: {
        Args: {
          p_organization_id: string;
          p_query?: string;
          p_category_id?: string | null;
          p_include_inactive?: boolean;
          p_limit?: number;
          p_offset?: number;
          p_sort?: string;
        };
        Returns: {
          product_id: string;
          name: string;
          category_name: string | null;
          is_active: boolean;
          track_stock: boolean;
          variant_count: number;
          min_price_millimes: number | null;
          max_price_millimes: number | null;
          total_count: number;
        }[];
      };
      find_variant_by_code: {
        Args: { p_organization_id: string; p_code: string };
        Returns: {
          variant_id: string;
          product_id: string;
          product_name: string;
          option_values: string[];
          sku: string | null;
          barcode: string | null;
          price_millimes: number;
          is_active: boolean;
        }[];
      };
      find_catalog_conflicts: {
        Args: { p_organization_id: string; p_names: string[]; p_skus: string[]; p_barcodes: string[] };
        Returns: { kind: "name" | "sku" | "barcode"; value: string }[];
      };
      stage_catalog_import: {
        Args: { p_organization_id: string; p_file_name: string; p_products: Json; p_summary?: Json };
        Returns: string;
      };
      commit_catalog_import: {
        Args: { p_batch_id: string };
        Returns: Json;
      };
      post_stock_receipt: {
        Args: {
          p_organization_id: string;
          p_location_id: string;
          p_supplier_id: string | null;
          p_reference: string | null;
          p_note: string | null;
          p_lines: Json;
          p_update_costs: boolean;
          p_idempotency_key: string;
        };
        Returns: string;
      };
      record_opening_stock: {
        Args: { p_organization_id: string; p_location_id: string; p_lines: Json; p_idempotency_key: string };
        Returns: string;
      };
      create_stock_adjustment: {
        Args: { p_organization_id: string; p_location_id: string; p_reason: string; p_lines: Json; p_idempotency_key: string };
        Returns: string;
      };
      review_stock_adjustment: {
        Args: { p_adjustment_id: string; p_approve: boolean; p_note?: string | null };
        Returns: undefined;
      };
      create_stock_count: {
        Args: {
          p_organization_id: string;
          p_location_id: string;
          p_note: string | null;
          p_variant_ids: string[] | null;
          p_idempotency_key: string;
        };
        Returns: string;
      };
      record_stock_count: {
        Args: { p_count_id: string; p_items: Json };
        Returns: number;
      };
      submit_stock_count: { Args: { p_count_id: string }; Returns: undefined };
      review_stock_count: { Args: { p_count_id: string; p_approve: boolean }; Returns: number };
      cancel_stock_count: { Args: { p_count_id: string }; Returns: undefined };
      post_stock_transfer: {
        Args: {
          p_organization_id: string;
          p_from_location_id: string;
          p_to_location_id: string;
          p_note: string | null;
          p_lines: Json;
          p_idempotency_key: string;
        };
        Returns: string;
      };
      search_variants: {
        Args: { p_organization_id: string; p_query: string; p_location_id?: string | null; p_limit?: number };
        Returns: {
          variant_id: string;
          product_id: string;
          product_name: string;
          option_values: string[];
          sku: string | null;
          barcode: string | null;
          price_millimes: number;
          track_stock: boolean;
          quantity: number;
        }[];
      };
      stock_overview: {
        Args: {
          p_organization_id: string;
          p_location_id?: string | null;
          p_query?: string;
          p_low_only?: boolean;
          p_limit?: number;
          p_offset?: number;
          p_sort?: string;
        };
        Returns: {
          variant_id: string;
          product_id: string;
          product_name: string;
          option_values: string[];
          sku: string | null;
          barcode: string | null;
          quantity: number;
          low_stock_threshold: number | null;
          is_low: boolean;
          total_count: number;
        }[];
      };
      stock_valuation: {
        Args: { p_organization_id: string; p_location_id?: string | null };
        Returns: {
          total_quantity: number;
          valued_quantity: number;
          total_value_millimes: number;
          variants_in_stock: number;
          variants_without_cost: number;
        }[];
      };
      check_stock_reconciliation: {
        Args: { p_organization_id: string };
        Returns: {
          location_id: string;
          variant_id: string;
          level_quantity: number | null;
          ledger_quantity: number | null;
          last_quantity_after: number | null;
        }[];
      };
      save_sale_draft: {
        Args: {
          p_organization_id: string;
          p_sale_id: string | null;
          p_location_id: string;
          p_customer_id: string | null;
          p_lines: Json;
          p_order_discount_millimes: number;
          p_note: string | null;
        };
        Returns: string;
      };
      cancel_sale_draft: { Args: { p_sale_id: string }; Returns: undefined };
      finalize_sale: {
        Args: {
          p_organization_id: string;
          p_sale_id: string | null;
          p_location_id: string;
          p_customer_id: string | null;
          p_lines: Json;
          p_order_discount_millimes: number;
          p_note: string | null;
          p_payments: Json;
          p_idempotency_key: string;
        };
        Returns: string;
      };
      record_sale_payment: {
        Args: { p_sale_id: string; p_method_id: string; p_amount_millimes: number; p_idempotency_key: string };
        Returns: string;
      };
      create_sale_return: {
        Args: {
          p_sale_id: string;
          p_lines: Json;
          p_reason: string;
          p_refund_method_id: string | null;
          p_refund_amount_millimes: number | null;
          p_idempotency_key: string;
        };
        Returns: string;
      };
      record_sale_refund: {
        Args: { p_sale_id: string; p_method_id: string; p_amount_millimes: number; p_idempotency_key: string };
        Returns: string;
      };
      sales_daily_summary: {
        Args: { p_organization_id: string; p_day: string; p_location_id?: string | null };
        Returns: Json;
      };
      customer_balances: {
        Args: { p_organization_id: string };
        Returns: { customer_id: string; customer_name: string; sales_count: number; balance_millimes: number }[];
      };
      search_customers: {
        Args: {
          p_organization_id: string;
          p_query?: string;
          p_due_only?: boolean;
          p_sort?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          customer_id: string;
          name: string;
          phone: string | null;
          is_active: boolean;
          created_at: string;
          sales_count: number;
          balance_millimes: number;
          total_count: number;
        }[];
      };
      search_sales: {
        Args: {
          p_organization_id: string;
          p_status?: string;
          p_from?: string | null;
          p_to?: string | null;
          p_customer_id?: string | null;
          p_due_only?: boolean;
          p_query?: string;
          p_sort?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          sale_id: string;
          number: number | null;
          status: "draft" | "finalized";
          customer_id: string | null;
          customer_name: string | null;
          total_millimes: number;
          returned_millimes: number;
          paid_millimes: number;
          due_millimes: number;
          created_at: string;
          finalized_at: string | null;
          total_count: number;
        }[];
      };
      report_sales_by_day: {
        Args: { p_organization_id: string; p_from: string; p_to: string; p_location_id?: string | null };
        Returns: {
          day: string;
          sales_count: number;
          gross_millimes: number;
          discount_millimes: number;
          sales_total_millimes: number;
          returns_count: number;
          returns_millimes: number;
          net_sales_millimes: number;
          credit_given_millimes: number;
          cost_millimes: number;
          margin_millimes: number;
          revenue_without_cost_millimes: number;
        }[];
      };
      report_sales_by_product: {
        Args: {
          p_organization_id: string;
          p_from: string;
          p_to: string;
          p_group?: "product" | "category";
          p_sort?: "revenue" | "quantity" | "margin";
          p_limit?: number;
        };
        Returns: {
          group_id: string | null;
          label: string | null;
          category_name: string | null;
          quantity: number;
          revenue_millimes: number;
          cost_millimes: number;
          margin_millimes: number;
          revenue_without_cost_millimes: number;
          total_count: number;
        }[];
      };
      report_payments_by_method: {
        Args: { p_organization_id: string; p_from: string; p_to: string };
        Returns: {
          method_id: string;
          label: string;
          kind: string;
          received_millimes: number;
          refunded_millimes: number;
          net_millimes: number;
        }[];
      };
      set_integration_enabled: {
        Args: { p_organization_id: string; p_integration: IntegrationKey; p_enabled: boolean };
        Returns: undefined;
      };
      consume_integration_call: {
        Args: { p_organization_id: string; p_integration: IntegrationKey };
        Returns: undefined;
      };
      dashboard_attention: {
        Args: { p_organization_id: string };
        Returns: Json;
      };
      global_search: {
        Args: { p_organization_id: string; p_query: string; p_limit_per_kind?: number };
        Returns: {
          kind: "product" | "customer" | "supplier" | "sale" | "purchase_order";
          id: string;
          label: string | null;
          detail: string | null;
          number: number | null;
          amount_millimes: number | null;
          occurred_at: string | null;
        }[];
      };
      check_sales_consistency: {
        Args: { p_organization_id: string };
        Returns: { sale_id: string; problem: string }[];
      };
      save_purchase_order: {
        Args: {
          p_organization_id: string;
          p_purchase_order_id: string | null;
          p_supplier_id: string;
          p_location_id: string;
          p_expected_date: string | null;
          p_reference: string | null;
          p_note: string | null;
          p_lines: Json;
        };
        Returns: string;
      };
      place_purchase_order: { Args: { p_purchase_order_id: string }; Returns: number };
      cancel_purchase_order: { Args: { p_purchase_order_id: string }; Returns: undefined };
      close_purchase_order: { Args: { p_purchase_order_id: string }; Returns: undefined };
      receive_purchase_order: {
        Args: {
          p_purchase_order_id: string;
          p_lines: Json;
          p_reference: string | null;
          p_note: string | null;
          p_update_costs: boolean;
          p_idempotency_key: string;
        };
        Returns: string;
      };
      record_supplier_payment: {
        Args: {
          p_organization_id: string;
          p_supplier_id: string;
          p_method_id: string;
          p_kind: "payment" | "refund";
          p_amount_millimes: number;
          p_paid_on: string;
          p_reference: string | null;
          p_note: string | null;
          p_purchase_order_id: string | null;
          p_idempotency_key: string;
        };
        Returns: string;
      };
      supplier_balances: {
        Args: { p_organization_id: string };
        Returns: {
          supplier_id: string;
          supplier_name: string;
          purchases_millimes: number;
          paid_millimes: number;
          balance_millimes: number;
          receipts_without_cost: number;
          last_receipt_at: string | null;
        }[];
      };
      check_purchasing_consistency: {
        Args: { p_organization_id: string };
        Returns: { reference_id: string; problem: string }[];
      };
    };
    Enums: {
      org_role: OrgRole;
      invitation_status: InvitationStatus;
      stock_movement_type: StockMovementType;
      payment_method_kind: PaymentMethodKind;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

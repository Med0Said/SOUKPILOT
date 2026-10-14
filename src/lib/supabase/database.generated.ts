
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"details": NonNullable<Json>,"entity_id": string | null,"entity_type": string,"id": string,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type": string,"id"?: string,"organization_id": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_import_batches": {
                  Row: {
                    "committed_at": string | null,"committed_by": string | null,"created_at": string,"created_by": string | null,"file_name": string,"id": string,"organization_id": string,"products": NonNullable<Json>,"status": string,"summary": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "committed_at"?: string | null,"committed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"file_name": string,"id"?: string,"organization_id": string,"products": NonNullable<Json>,"status"?: string,"summary"?: NonNullable<Json>
                  }
                  Update: {
                    "committed_at"?: string | null,"committed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"file_name"?: string,"id"?: string,"organization_id"?: string,"products"?: NonNullable<Json>,"status"?: string,"summary"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_import_batches_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"organization_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"organization_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"organization_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "address": string | null,"created_at": string,"created_by": string | null,"id": string,"is_active": boolean,"name": string,"notes": string | null,"organization_id": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"notes"?: string | null,"organization_id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"notes"?: string | null,"organization_id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"document_sequences": {
                  Row: {
                    "doc_type": string,"next_value": number,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "doc_type": string,"next_value": number,"organization_id": string
                  }
                  Update: {
                    "doc_type"?: string,"next_value"?: number,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_sequences_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"locations": {
                  Row: {
                    "code": string | null,"created_at": string,"id": string,"is_active": boolean,"name": string,"organization_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"organization_id": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"organization_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "locations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_invitations": {
                  Row: {
                    "created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"organization_id": string,"responded_at": string | null,"responded_by": string | null,"role": Database["public"]['Enums']["org_role"],"status": Database["public"]['Enums']["invitation_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"organization_id": string,"responded_at"?: string | null,"responded_by"?: string | null,"role": Database["public"]['Enums']["org_role"],"status"?: Database["public"]['Enums']["invitation_status"]
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"organization_id"?: string,"responded_at"?: string | null,"responded_by"?: string | null,"role"?: Database["public"]['Enums']["org_role"],"status"?: Database["public"]['Enums']["invitation_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "created_at": string,"organization_id": string,"role": Database["public"]['Enums']["org_role"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"organization_id": string,"role": Database["public"]['Enums']["org_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"role"?: Database["public"]['Enums']["org_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "cashier_max_discount_bps": number,"created_at": string,"created_by": string | null,"currency_code": string,"default_locale": string,"id": string,"name": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cashier_max_discount_bps"?: number,"created_at"?: string,"created_by"?: string | null,"currency_code"?: string,"default_locale"?: string,"id"?: string,"name": string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "cashier_max_discount_bps"?: number,"created_at"?: string,"created_by"?: string | null,"currency_code"?: string,"default_locale"?: string,"id"?: string,"name"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payment_methods": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"kind": Database["public"]['Enums']["payment_method_kind"],"label": string,"organization_id": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"kind": Database["public"]['Enums']["payment_method_kind"],"label": string,"organization_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["payment_method_kind"],"label"?: string,"organization_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_methods_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"product_variant_costs": {
                  Row: {
                    "cost_millimes": number | null,"organization_id": string,"updated_at": string,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_millimes"?: number | null,"organization_id": string,"updated_at"?: string,"variant_id": string
                  }
                  Update: {
                    "cost_millimes"?: number | null,"organization_id"?: string,"updated_at"?: string,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variant_costs_organization_id_variant_id_fkey"
      columns: ["organization_id","variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"product_variants": {
                  Row: {
                    "barcode": string | null,"created_at": string,"id": string,"is_active": boolean,"low_stock_threshold": number | null,"option_values": (string)[],"organization_id": string,"price_millimes": number,"product_id": string,"sku": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "barcode"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"low_stock_threshold"?: number | null,"option_values"?: (string)[],"organization_id": string,"price_millimes": number,"product_id": string,"sku"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "barcode"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"low_stock_threshold"?: number | null,"option_values"?: (string)[],"organization_id"?: string,"price_millimes"?: number,"product_id"?: string,"sku"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variants_organization_id_product_id_fkey"
      columns: ["organization_id","product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"products": {
                  Row: {
                    "category_id": string | null,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"is_active": boolean,"name": string,"option_names": (string)[],"organization_id": string,"supplier_id": string | null,"track_stock": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"option_names"?: (string)[],"organization_id": string,"supplier_id"?: string | null,"track_stock"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"option_names"?: (string)[],"organization_id"?: string,"supplier_id"?: string | null,"track_stock"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_organization_id_category_id_fkey"
      columns: ["organization_id","category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "products_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_organization_id_supplier_id_fkey"
      columns: ["organization_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"full_name": string,"id": string,"locale": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name"?: string,"id": string,"locale"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string,"id"?: string,"locale"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"purchase_order_items": {
                  Row: {
                    "id": string,"line_no": number,"organization_id": string,"purchase_order_id": string,"quantity": number,"received_quantity": number,"unit_cost_millimes": number,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"line_no": number,"organization_id": string,"purchase_order_id": string,"quantity": number,"received_quantity"?: number,"unit_cost_millimes": number,"variant_id": string
                  }
                  Update: {
                    "id"?: string,"line_no"?: number,"organization_id"?: string,"purchase_order_id"?: string,"quantity"?: number,"received_quantity"?: number,"unit_cost_millimes"?: number,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_order_items_organization_id_purchase_order_id_fkey"
      columns: ["organization_id","purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "purchase_order_items_organization_id_variant_id_fkey"
      columns: ["organization_id","variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"purchase_orders": {
                  Row: {
                    "closed_at": string | null,"closed_by": string | null,"created_at": string,"created_by": string | null,"expected_date": string | null,"id": string,"location_id": string,"note": string | null,"number": number | null,"ordered_at": string | null,"ordered_by": string | null,"ordered_total_millimes": number,"organization_id": string,"reference": string | null,"status": string,"supplier_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"expected_date"?: string | null,"id"?: string,"location_id": string,"note"?: string | null,"number"?: number | null,"ordered_at"?: string | null,"ordered_by"?: string | null,"ordered_total_millimes"?: number,"organization_id": string,"reference"?: string | null,"status"?: string,"supplier_id": string,"updated_at"?: string
                  }
                  Update: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"expected_date"?: string | null,"id"?: string,"location_id"?: string,"note"?: string | null,"number"?: number | null,"ordered_at"?: string | null,"ordered_by"?: string | null,"ordered_total_millimes"?: number,"organization_id"?: string,"reference"?: string | null,"status"?: string,"supplier_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_orders_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_orders_organization_id_location_id_fkey"
      columns: ["organization_id","location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "purchase_orders_organization_id_supplier_id_fkey"
      columns: ["organization_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"sale_item_costs": {
                  Row: {
                    "organization_id": string,"sale_item_id": string,"unit_cost_millimes": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "organization_id": string,"sale_item_id": string,"unit_cost_millimes"?: number | null
                  }
                  Update: {
                    "organization_id"?: string,"sale_item_id"?: string,"unit_cost_millimes"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_item_costs_sale_item_id_fkey"
      columns: ["sale_item_id"]
isOneToOne: true
      referencedRelation: "sale_items"
      referencedColumns: ["id"]
    }
                  ]
                },"sale_items": {
                  Row: {
                    "discount_bps": number,"gross_millimes": number,"id": string,"line_discount_millimes": number,"line_no": number,"line_total_millimes": number,"net_total_millimes": number,"order_discount_share_millimes": number,"organization_id": string,"product_name": string,"quantity": number,"returned_millimes": number,"returned_quantity": number,"sale_id": string,"track_stock": boolean,"unit_price_millimes": number,"variant_id": string,"variant_label": string
                  }
                  ComputedFields: never
                  Insert: {
                    "discount_bps"?: number,"gross_millimes": number,"id"?: string,"line_discount_millimes": number,"line_no": number,"line_total_millimes": number,"net_total_millimes": number,"order_discount_share_millimes"?: number,"organization_id": string,"product_name": string,"quantity": number,"returned_millimes"?: number,"returned_quantity"?: number,"sale_id": string,"track_stock": boolean,"unit_price_millimes": number,"variant_id": string,"variant_label"?: string
                  }
                  Update: {
                    "discount_bps"?: number,"gross_millimes"?: number,"id"?: string,"line_discount_millimes"?: number,"line_no"?: number,"line_total_millimes"?: number,"net_total_millimes"?: number,"order_discount_share_millimes"?: number,"organization_id"?: string,"product_name"?: string,"quantity"?: number,"returned_millimes"?: number,"returned_quantity"?: number,"sale_id"?: string,"track_stock"?: boolean,"unit_price_millimes"?: number,"variant_id"?: string,"variant_label"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_items_organization_id_sale_id_fkey"
      columns: ["organization_id","sale_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "sale_items_organization_id_variant_id_fkey"
      columns: ["organization_id","variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"sale_payments": {
                  Row: {
                    "amount_millimes": number,"created_at": string,"created_by": string | null,"id": string,"idempotency_key": string | null,"kind": string,"method_id": string,"organization_id": string,"return_id": string | null,"sale_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_millimes": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string | null,"kind": string,"method_id": string,"organization_id": string,"return_id"?: string | null,"sale_id": string
                  }
                  Update: {
                    "amount_millimes"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string | null,"kind"?: string,"method_id"?: string,"organization_id"?: string,"return_id"?: string | null,"sale_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_payments_organization_id_method_id_fkey"
      columns: ["organization_id","method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "sale_payments_organization_id_sale_id_fkey"
      columns: ["organization_id","sale_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"sale_return_items": {
                  Row: {
                    "amount_millimes": number,"organization_id": string,"quantity": number,"restock": boolean,"return_id": string,"sale_item_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_millimes": number,"organization_id": string,"quantity": number,"restock": boolean,"return_id": string,"sale_item_id": string
                  }
                  Update: {
                    "amount_millimes"?: number,"organization_id"?: string,"quantity"?: number,"restock"?: boolean,"return_id"?: string,"sale_item_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_return_items_return_id_fkey"
      columns: ["return_id"]
isOneToOne: false
      referencedRelation: "sale_returns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_return_items_sale_item_id_fkey"
      columns: ["sale_item_id"]
isOneToOne: false
      referencedRelation: "sale_items"
      referencedColumns: ["id"]
    }
                  ]
                },"sale_returns": {
                  Row: {
                    "amount_millimes": number,"created_at": string,"created_by": string | null,"id": string,"idempotency_key": string,"number": number,"organization_id": string,"reason": string,"sale_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_millimes": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key": string,"number": number,"organization_id": string,"reason": string,"sale_id": string
                  }
                  Update: {
                    "amount_millimes"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string,"number"?: number,"organization_id"?: string,"reason"?: string,"sale_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_returns_organization_id_sale_id_fkey"
      columns: ["organization_id","sale_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"sales": {
                  Row: {
                    "cancelled_at": string | null,"cancelled_by": string | null,"created_at": string,"created_by": string | null,"customer_id": string | null,"finalize_idempotency_key": string | null,"finalized_at": string | null,"finalized_by": string | null,"id": string,"line_discount_millimes": number,"location_id": string,"note": string | null,"number": number | null,"order_discount_millimes": number,"organization_id": string,"paid_millimes": number,"returned_millimes": number,"status": string,"subtotal_millimes": number,"total_millimes": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"finalize_idempotency_key"?: string | null,"finalized_at"?: string | null,"finalized_by"?: string | null,"id"?: string,"line_discount_millimes"?: number,"location_id": string,"note"?: string | null,"number"?: number | null,"order_discount_millimes"?: number,"organization_id": string,"paid_millimes"?: number,"returned_millimes"?: number,"status"?: string,"subtotal_millimes"?: number,"total_millimes"?: number,"updated_at"?: string
                  }
                  Update: {
                    "cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"finalize_idempotency_key"?: string | null,"finalized_at"?: string | null,"finalized_by"?: string | null,"id"?: string,"line_discount_millimes"?: number,"location_id"?: string,"note"?: string | null,"number"?: number | null,"order_discount_millimes"?: number,"organization_id"?: string,"paid_millimes"?: number,"returned_millimes"?: number,"status"?: string,"subtotal_millimes"?: number,"total_millimes"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "sales_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_organization_id_location_id_fkey"
      columns: ["organization_id","location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"stock_adjustment_lines": {
                  Row: {
                    "adjustment_id": string,"organization_id": string,"quantity_delta": number,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adjustment_id": string,"organization_id": string,"quantity_delta": number,"variant_id": string
                  }
                  Update: {
                    "adjustment_id"?: string,"organization_id"?: string,"quantity_delta"?: number,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_adjustment_lines_adjustment_id_fkey"
      columns: ["adjustment_id"]
isOneToOne: false
      referencedRelation: "stock_adjustments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_adjustment_lines_organization_id_variant_id_fkey"
      columns: ["organization_id","variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"stock_adjustments": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"idempotency_key": string,"kind": string,"location_id": string,"number": number,"organization_id": string,"reason": string,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key": string,"kind": string,"location_id": string,"number": number,"organization_id": string,"reason": string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string,"kind"?: string,"location_id"?: string,"number"?: number,"organization_id"?: string,"reason"?: string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_adjustments_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_adjustments_organization_id_location_id_fkey"
      columns: ["organization_id","location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"stock_count_items": {
                  Row: {
                    "count_id": string,"counted_at": string | null,"counted_by": string | null,"counted_quantity": number | null,"expected_quantity": number | null,"organization_id": string,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count_id": string,"counted_at"?: string | null,"counted_by"?: string | null,"counted_quantity"?: number | null,"expected_quantity"?: number | null,"organization_id": string,"variant_id": string
                  }
                  Update: {
                    "count_id"?: string,"counted_at"?: string | null,"counted_by"?: string | null,"counted_quantity"?: number | null,"expected_quantity"?: number | null,"organization_id"?: string,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_count_items_count_id_fkey"
      columns: ["count_id"]
isOneToOne: false
      referencedRelation: "stock_counts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_count_items_organization_id_variant_id_fkey"
      columns: ["organization_id","variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"stock_counts": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"idempotency_key": string,"location_id": string,"note": string | null,"number": number,"organization_id": string,"reviewed_at": string | null,"reviewed_by": string | null,"status": string,"submitted_at": string | null,"submitted_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key": string,"location_id": string,"note"?: string | null,"number": number,"organization_id": string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"submitted_at"?: string | null,"submitted_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string,"location_id"?: string,"note"?: string | null,"number"?: number,"organization_id"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"submitted_at"?: string | null,"submitted_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_counts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_counts_organization_id_location_id_fkey"
      columns: ["organization_id","location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"stock_levels": {
                  Row: {
                    "location_id": string,"organization_id": string,"quantity": number,"updated_at": string,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "location_id": string,"organization_id": string,"quantity"?: number,"updated_at"?: string,"variant_id": string
                  }
                  Update: {
                    "location_id"?: string,"organization_id"?: string,"quantity"?: number,"updated_at"?: string,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_levels_organization_id_location_id_fkey"
      columns: ["organization_id","location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "stock_levels_organization_id_variant_id_fkey"
      columns: ["organization_id","variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"stock_movements": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"id": string,"location_id": string,"movement_type": Database["public"]['Enums']["stock_movement_type"],"organization_id": string,"quantity_after": number,"quantity_delta": number,"reason": string | null,"seq": number,"source_id": string,"source_type": string,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"id"?: string,"location_id": string,"movement_type": Database["public"]['Enums']["stock_movement_type"],"organization_id": string,"quantity_after": number,"quantity_delta": number,"reason"?: string | null,"seq"?: never,"source_id": string,"source_type": string,"variant_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"id"?: string,"location_id"?: string,"movement_type"?: Database["public"]['Enums']["stock_movement_type"],"organization_id"?: string,"quantity_after"?: number,"quantity_delta"?: number,"reason"?: string | null,"seq"?: never,"source_id"?: string,"source_type"?: string,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_organization_id_location_id_fkey"
      columns: ["organization_id","location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "stock_movements_organization_id_variant_id_fkey"
      columns: ["organization_id","variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"stock_opening_costs": {
                  Row: {
                    "adjustment_id": string,"organization_id": string,"unit_cost_millimes": number,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adjustment_id": string,"organization_id": string,"unit_cost_millimes": number,"variant_id": string
                  }
                  Update: {
                    "adjustment_id"?: string,"organization_id"?: string,"unit_cost_millimes"?: number,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_opening_costs_adjustment_id_fkey"
      columns: ["adjustment_id"]
isOneToOne: false
      referencedRelation: "stock_adjustments"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_receipt_lines": {
                  Row: {
                    "organization_id": string,"purchase_order_item_id": string | null,"quantity": number,"receipt_id": string,"unit_cost_millimes": number | null,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "organization_id": string,"purchase_order_item_id"?: string | null,"quantity": number,"receipt_id": string,"unit_cost_millimes"?: number | null,"variant_id": string
                  }
                  Update: {
                    "organization_id"?: string,"purchase_order_item_id"?: string | null,"quantity"?: number,"receipt_id"?: string,"unit_cost_millimes"?: number | null,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_receipt_lines_organization_id_variant_id_fkey"
      columns: ["organization_id","variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "stock_receipt_lines_po_item_fkey"
      columns: ["purchase_order_item_id"]
isOneToOne: false
      referencedRelation: "purchase_order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_receipt_lines_receipt_id_fkey"
      columns: ["receipt_id"]
isOneToOne: false
      referencedRelation: "stock_receipts"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_receipts": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"idempotency_key": string,"lines_without_cost": number,"location_id": string,"note": string | null,"number": number,"organization_id": string,"purchase_order_id": string | null,"reference": string | null,"supplier_id": string | null,"total_cost_millimes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key": string,"lines_without_cost"?: number,"location_id": string,"note"?: string | null,"number": number,"organization_id": string,"purchase_order_id"?: string | null,"reference"?: string | null,"supplier_id"?: string | null,"total_cost_millimes"?: number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string,"lines_without_cost"?: number,"location_id"?: string,"note"?: string | null,"number"?: number,"organization_id"?: string,"purchase_order_id"?: string | null,"reference"?: string | null,"supplier_id"?: string | null,"total_cost_millimes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_receipts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_receipts_organization_id_location_id_fkey"
      columns: ["organization_id","location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "stock_receipts_organization_id_supplier_id_fkey"
      columns: ["organization_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "stock_receipts_purchase_order_fkey"
      columns: ["organization_id","purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"stock_transfer_lines": {
                  Row: {
                    "organization_id": string,"quantity": number,"transfer_id": string,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "organization_id": string,"quantity": number,"transfer_id": string,"variant_id": string
                  }
                  Update: {
                    "organization_id"?: string,"quantity"?: number,"transfer_id"?: string,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_transfer_lines_organization_id_variant_id_fkey"
      columns: ["organization_id","variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "stock_transfer_lines_transfer_id_fkey"
      columns: ["transfer_id"]
isOneToOne: false
      referencedRelation: "stock_transfers"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_transfers": {
                  Row: {
                    "created_at": string,"created_by": string | null,"from_location_id": string,"id": string,"idempotency_key": string,"note": string | null,"number": number,"organization_id": string,"to_location_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"from_location_id": string,"id"?: string,"idempotency_key": string,"note"?: string | null,"number": number,"organization_id": string,"to_location_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"from_location_id"?: string,"id"?: string,"idempotency_key"?: string,"note"?: string | null,"number"?: number,"organization_id"?: string,"to_location_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_transfers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_transfers_organization_id_from_location_id_fkey"
      columns: ["organization_id","from_location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "stock_transfers_organization_id_to_location_id_fkey"
      columns: ["organization_id","to_location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"supplier_payments": {
                  Row: {
                    "amount_millimes": number,"created_at": string,"created_by": string | null,"id": string,"idempotency_key": string,"kind": string,"method_id": string,"note": string | null,"organization_id": string,"paid_on": string,"purchase_order_id": string | null,"reference": string | null,"supplier_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_millimes": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key": string,"kind": string,"method_id": string,"note"?: string | null,"organization_id": string,"paid_on": string,"purchase_order_id"?: string | null,"reference"?: string | null,"supplier_id": string
                  }
                  Update: {
                    "amount_millimes"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string,"kind"?: string,"method_id"?: string,"note"?: string | null,"organization_id"?: string,"paid_on"?: string,"purchase_order_id"?: string | null,"reference"?: string | null,"supplier_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_payments_organization_id_method_id_fkey"
      columns: ["organization_id","method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "supplier_payments_organization_id_purchase_order_id_fkey"
      columns: ["organization_id","purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "supplier_payments_organization_id_supplier_id_fkey"
      columns: ["organization_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "created_at": string,"email": string | null,"id": string,"is_active": boolean,"name": string,"notes": string | null,"organization_id": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"notes"?: string | null,"organization_id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"notes"?: string | null,"organization_id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppliers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "cancel_purchase_order":
{ Args: { "p_purchase_order_id": string }; Returns: undefined
                           },
"cancel_sale_draft":
{ Args: { "p_sale_id": string }; Returns: undefined
                           },
"cancel_stock_count":
{ Args: { "p_count_id": string }; Returns: undefined
                           },
"check_purchasing_consistency":
{ Args: { "p_organization_id": string }; Returns: {
              "problem": string,"reference_id": string
            }[]
                           },
"check_sales_consistency":
{ Args: { "p_organization_id": string }; Returns: {
              "problem": string,"sale_id": string
            }[]
                           },
"check_stock_reconciliation":
{ Args: { "p_organization_id": string }; Returns: {
              "last_quantity_after": number,"ledger_quantity": number,"level_quantity": number,"location_id": string,"variant_id": string
            }[]
                           },
"close_purchase_order":
{ Args: { "p_purchase_order_id": string }; Returns: undefined
                           },
"commit_catalog_import":
{ Args: { "p_batch_id": string }; Returns: Json
                           },
"create_invitation":
{ Args: { "p_email": string,"p_organization_id": string,"p_role": Database["public"]['Enums']["org_role"] }; Returns: string
                           },
"create_organization":
{ Args: { "p_location_name"?: string,"p_name": string,"p_timezone"?: string }; Returns: string
                           },
"create_product":
{ Args: { "p_organization_id": string,"p_product": Json }; Returns: string
                           },
"create_sale_return":
{ Args: { "p_idempotency_key": string,"p_lines": Json,"p_reason": string,"p_refund_amount_millimes": number,"p_refund_method_id": string,"p_sale_id": string }; Returns: string
                           },
"create_stock_adjustment":
{ Args: { "p_idempotency_key": string,"p_lines": Json,"p_location_id": string,"p_organization_id": string,"p_reason": string }; Returns: string
                           },
"create_stock_count":
{ Args: { "p_idempotency_key": string,"p_location_id": string,"p_note": string,"p_organization_id": string,"p_variant_ids": (string)[] }; Returns: string
                           },
"customer_balances":
{ Args: { "p_organization_id": string }; Returns: {
              "balance_millimes": number,"customer_id": string,"customer_name": string,"sales_count": number
            }[]
                           },
"dashboard_attention":
{ Args: { "p_organization_id": string }; Returns: Json
                           },
"finalize_sale":
{ Args: { "p_customer_id": string,"p_idempotency_key": string,"p_lines": Json,"p_location_id": string,"p_note": string,"p_order_discount_millimes": number,"p_organization_id": string,"p_payments": Json,"p_sale_id": string }; Returns: string
                           },
"find_catalog_conflicts":
{ Args: { "p_barcodes": (string)[],"p_names": (string)[],"p_organization_id": string,"p_skus": (string)[] }; Returns: {
              "kind": string,"value": string
            }[]
                           },
"find_variant_by_code":
{ Args: { "p_code": string,"p_organization_id": string }; Returns: {
              "barcode": string,"is_active": boolean,"option_values": (string)[],"price_millimes": number,"product_id": string,"product_name": string,"sku": string,"variant_id": string
            }[]
                           },
"global_search":
{ Args: { "p_limit_per_kind"?: number,"p_organization_id": string,"p_query": string }; Returns: {
              "amount_millimes": number,"detail": string,"id": string,"kind": string,"label": string,"number": number,"occurred_at": string
            }[]
                           },
"list_my_invitations":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"expires_at": string,"id": string,"organization_id": string,"organization_name": string,"role": Database["public"]['Enums']["org_role"]
            }[]
                           },
"list_organization_members":
{ Args: { "p_organization_id": string }; Returns: {
              "email": string,"full_name": string,"joined_at": string,"role": Database["public"]['Enums']["org_role"],"user_id": string
            }[]
                           },
"place_purchase_order":
{ Args: { "p_purchase_order_id": string }; Returns: number
                           },
"post_stock_receipt":
{ Args: { "p_idempotency_key": string,"p_lines": Json,"p_location_id": string,"p_note": string,"p_organization_id": string,"p_reference": string,"p_supplier_id": string,"p_update_costs": boolean }; Returns: string
                           },
"post_stock_transfer":
{ Args: { "p_from_location_id": string,"p_idempotency_key": string,"p_lines": Json,"p_note": string,"p_organization_id": string,"p_to_location_id": string }; Returns: string
                           },
"receive_purchase_order":
{ Args: { "p_idempotency_key": string,"p_lines": Json,"p_note": string,"p_purchase_order_id": string,"p_reference": string,"p_update_costs": boolean }; Returns: string
                           },
"record_opening_stock":
{ Args: { "p_idempotency_key": string,"p_lines": Json,"p_location_id": string,"p_organization_id": string }; Returns: string
                           },
"record_sale_payment":
{ Args: { "p_amount_millimes": number,"p_idempotency_key": string,"p_method_id": string,"p_sale_id": string }; Returns: string
                           },
"record_sale_refund":
{ Args: { "p_amount_millimes": number,"p_idempotency_key": string,"p_method_id": string,"p_sale_id": string }; Returns: string
                           },
"record_stock_count":
{ Args: { "p_count_id": string,"p_items": Json }; Returns: number
                           },
"record_supplier_payment":
{ Args: { "p_amount_millimes": number,"p_idempotency_key": string,"p_kind": string,"p_method_id": string,"p_note": string,"p_organization_id": string,"p_paid_on": string,"p_purchase_order_id": string,"p_reference": string,"p_supplier_id": string }; Returns: string
                           },
"remove_member":
{ Args: { "p_organization_id": string,"p_user_id": string }; Returns: undefined
                           },
"report_payments_by_method":
{ Args: { "p_from": string,"p_organization_id": string,"p_to": string }; Returns: {
              "kind": string,"label": string,"method_id": string,"net_millimes": number,"received_millimes": number,"refunded_millimes": number
            }[]
                           },
"report_sales_by_day":
{ Args: { "p_from": string,"p_location_id"?: string,"p_organization_id": string,"p_to": string }; Returns: {
              "cost_millimes": number,"credit_given_millimes": number,"day": string,"discount_millimes": number,"gross_millimes": number,"margin_millimes": number,"net_sales_millimes": number,"returns_count": number,"returns_millimes": number,"revenue_without_cost_millimes": number,"sales_count": number,"sales_total_millimes": number
            }[]
                           },
"report_sales_by_product":
{ Args: { "p_from": string,"p_group"?: string,"p_limit"?: number,"p_organization_id": string,"p_sort"?: string,"p_to": string }; Returns: {
              "category_name": string,"cost_millimes": number,"group_id": string,"label": string,"margin_millimes": number,"quantity": number,"revenue_millimes": number,"revenue_without_cost_millimes": number,"total_count": number
            }[]
                           },
"respond_to_invitation":
{ Args: { "p_accept": boolean,"p_invitation_id": string }; Returns: string
                           },
"review_stock_adjustment":
{ Args: { "p_adjustment_id": string,"p_approve": boolean,"p_note"?: string }; Returns: undefined
                           },
"review_stock_count":
{ Args: { "p_approve": boolean,"p_count_id": string }; Returns: number
                           },
"revoke_invitation":
{ Args: { "p_invitation_id": string }; Returns: undefined
                           },
"sales_daily_summary":
{ Args: { "p_day": string,"p_location_id"?: string,"p_organization_id": string }; Returns: Json
                           },
"save_purchase_order":
{ Args: { "p_expected_date": string,"p_lines": Json,"p_location_id": string,"p_note": string,"p_organization_id": string,"p_purchase_order_id": string,"p_reference": string,"p_supplier_id": string }; Returns: string
                           },
"save_sale_draft":
{ Args: { "p_customer_id": string,"p_lines": Json,"p_location_id": string,"p_note": string,"p_order_discount_millimes": number,"p_organization_id": string,"p_sale_id": string }; Returns: string
                           },
"save_variant":
{ Args: { "p_organization_id": string,"p_product_id": string,"p_variant": Json,"p_variant_id": string }; Returns: string
                           },
"search_customers":
{ Args: { "p_due_only"?: boolean,"p_limit"?: number,"p_offset"?: number,"p_organization_id": string,"p_query"?: string,"p_sort"?: string }; Returns: {
              "balance_millimes": number,"created_at": string,"customer_id": string,"is_active": boolean,"name": string,"phone": string,"sales_count": number,"total_count": number
            }[]
                           },
"search_products":
{ Args: { "p_category_id"?: string,"p_include_inactive"?: boolean,"p_limit"?: number,"p_offset"?: number,"p_organization_id": string,"p_query"?: string,"p_sort"?: string }; Returns: {
              "category_name": string,"is_active": boolean,"max_price_millimes": number,"min_price_millimes": number,"name": string,"product_id": string,"total_count": number,"track_stock": boolean,"variant_count": number
            }[]
                           },
"search_sales":
{ Args: { "p_customer_id"?: string,"p_due_only"?: boolean,"p_from"?: string,"p_limit"?: number,"p_offset"?: number,"p_organization_id": string,"p_query"?: string,"p_sort"?: string,"p_status"?: string,"p_to"?: string }; Returns: {
              "created_at": string,"customer_id": string,"customer_name": string,"due_millimes": number,"finalized_at": string,"number": number,"paid_millimes": number,"returned_millimes": number,"sale_id": string,"status": string,"total_count": number,"total_millimes": number
            }[]
                           },
"search_variants":
{ Args: { "p_limit"?: number,"p_location_id"?: string,"p_organization_id": string,"p_query": string }; Returns: {
              "barcode": string,"option_values": (string)[],"price_millimes": number,"product_id": string,"product_name": string,"quantity": number,"sku": string,"track_stock": boolean,"variant_id": string
            }[]
                           },
"stage_catalog_import":
{ Args: { "p_file_name": string,"p_organization_id": string,"p_products": Json,"p_summary"?: Json }; Returns: string
                           },
"stock_overview":
{ Args: { "p_limit"?: number,"p_location_id"?: string,"p_low_only"?: boolean,"p_offset"?: number,"p_organization_id": string,"p_query"?: string,"p_sort"?: string }; Returns: {
              "barcode": string,"is_low": boolean,"low_stock_threshold": number,"option_values": (string)[],"product_id": string,"product_name": string,"quantity": number,"sku": string,"total_count": number,"variant_id": string
            }[]
                           },
"stock_valuation":
{ Args: { "p_location_id"?: string,"p_organization_id": string }; Returns: {
              "total_quantity": number,"total_value_millimes": number,"valued_quantity": number,"variants_in_stock": number,"variants_without_cost": number
            }[]
                           },
"submit_stock_count":
{ Args: { "p_count_id": string }; Returns: undefined
                           },
"supplier_balances":
{ Args: { "p_organization_id": string }; Returns: {
              "balance_millimes": number,"last_receipt_at": string,"paid_millimes": number,"purchases_millimes": number,"receipts_without_cost": number,"supplier_id": string,"supplier_name": string
            }[]
                           },
"update_member_role":
{ Args: { "p_organization_id": string,"p_role": Database["public"]['Enums']["org_role"],"p_user_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "invitation_status": "pending"|"accepted"|"declined"|"revoked","org_role": "owner"|"manager"|"cashier","payment_method_kind": "cash"|"card"|"transfer"|"check"|"mobile"|"other","stock_movement_type": "opening"|"purchase_receipt"|"sale"|"customer_return"|"supplier_return"|"adjustment"|"transfer_out"|"transfer_in"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "invitation_status": ["pending", "accepted", "declined", "revoked"],"org_role": ["owner", "manager", "cashier"],"payment_method_kind": ["cash", "card", "transfer", "check", "mobile", "other"],"stock_movement_type": ["opening", "purchase_receipt", "sale", "customer_return", "supplier_return", "adjustment", "transfer_out", "transfer_in"]
          }
        }
} as const

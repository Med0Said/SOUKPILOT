# SoukPilot — Database Schema

Last updated 2026-10-13. §2–3 are **implemented** (Milestone 1). §4 is the
**proposed** design for later milestones and will be revised as each one starts.

## 1. Conventions

- PostgreSQL 17 (Supabase). Migrations in `supabase/migrations/`, applied in
  filename order; never edit a migration that has run in a shared environment —
  add a new one.
- Primary keys: `uuid default gen_random_uuid()`. (Composite PK only for pure
  join tables such as `organization_members`.)
- Every tenant-owned table: `organization_id uuid not null` + RLS enabled.
- Every tenant-owned parent table also has `unique (organization_id, id)` so
  children can use **composite foreign keys** `(organization_id, x_id)` that
  make cross-tenant references impossible at the constraint level.
- Timestamps `timestamptz`, stored in UTC, displayed in the organization's
  `timezone`.
- Money: `bigint` millimes (1 TND = 1000). Quantities: `integer` units.
- Error keys raised by functions are stable snake_case strings
  (`forbidden`, `last_owner`, …) mapped to French in `src/lib/errors.ts`.

## 2. Implemented tables (Milestone 1)

```
auth.users (Supabase)
   │1
   ├──1 profiles (id = auth.users.id)
   │
   └──* organization_members *──1 organizations 1──* locations
                                     │1
                                     ├──* organization_invitations
                                     └──* audit_logs
```

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `organizations` | Tenant (one business) | name 2–120 chars trimmed; `currency_code = 'TND'`; timezone validated against `pg_timezone_names` (trigger) |
| `organization_members` | user ↔ org with `org_role` (`owner`/`manager`/`cashier`) | PK `(organization_id, user_id)`; `user_id` FK **RESTRICT**; trigger keeps ≥ 1 owner |
| `profiles` | display name, optional phone, locale | created by trigger on `auth.users` insert |
| `locations` | shops / stock locations | unique `(organization_id, name)`, `(organization_id, code)`, `(organization_id, id)`; no delete (deactivate) |
| `organization_invitations` | pending access grants by email | email normalized lower-case; role ≠ owner; one pending per (org, email); `status='pending' ⇔ responded_at is null` |
| `audit_logs` | append-only trail | `action` like `entity.verb`; `details` JSON object; UPDATE blocked by trigger |

### Functions (Data API, `authenticated` only)

| Function | Transaction does | Authorization |
| --- | --- | --- |
| `create_organization(name, timezone, location_name)` | org + owner membership + default location + audit | signed in; ≤ 5 orgs created per user (advisory lock) |
| `list_organization_members(org)` | members with names; emails for owner/manager | member of org |
| `update_member_role(org, user, role)` | role update + audit | owner; not self; last-owner trigger |
| `remove_member(org, user)` | delete membership + audit | owner, or self (leave) |
| `create_invitation(org, email, role)` | expire stale + insert + audit | owner (manager/cashier) or manager (cashier) |
| `revoke_invitation(id)` | status → revoked + audit | owner, or manager for cashier invites |
| `list_my_invitations()` | pending, unexpired invites for caller's email | confirmed email |
| `respond_to_invitation(id, accept)` | membership insert (if accept) + status + audit | caller's confirmed email = invited email |

Private helpers (`private` schema, not exposed): `is_org_member`,
`has_org_role`, `shares_org_with`, `write_audit`, `require_user`,
`require_confirmed_email`, trigger functions.

## 3. Tenant isolation strategy

1. RLS on every table; policies reference only `auth.uid()` through
   membership helpers — a client-supplied `organization_id` is never sufficient.
2. Table and column `GRANT`s restrict verbs even where a policy would allow a row.
3. Membership is only changed through audited definer functions.
4. (From M2) composite FKs `(organization_id, parent_id)` so a row can never
   point at another tenant's product/location/customer even via a definer function bug.
5. Automated tests (tests/db) for every table and role; catalog tests fail if
   a new table forgets RLS or grants something to `anon`.

## 4. Proposed schema for Milestones 2–7

### Catalog (M2)
- `categories (id, organization_id, name, parent_id?)`
- `products (id, organization_id, name, category_id?, description, is_active, track_stock bool, default_supplier_id?, image_path?)`
- `product_attributes (id, organization_id, name)` — e.g. Taille, Couleur, Teinte
- `product_variants (id, organization_id, product_id, sku, barcode, attribute_values jsonb, cost_millimes bigint ≥ 0, price_millimes bigint ≥ 0, is_active)`
  - unique `(organization_id, sku)`, unique `(organization_id, barcode) where barcode is not null`
  - a product without options still has exactly one variant (stable stock identity)
- Indexes: trigram on product name (`pg_trgm`), btree on sku/barcode.
- CSV import: stage rows in a `import_batches`/`import_rows` pair (preview,
  per-row errors), commit in one function; conflicting identifiers are reported,
  never merged silently.

### Inventory (M3)
- `stock_movements` — **append-only ledger** (no UPDATE/DELETE grants):
  `(id, organization_id, location_id, variant_id, quantity_delta int ≠ 0, movement_type, source_type, source_id, unit_cost_millimes, reason, actor_id, created_at)`
  - `movement_type ∈ opening, purchase_receipt, sale, customer_return, supplier_return, adjustment, transfer_out, transfer_in`
  - unique `(organization_id, source_type, source_id, variant_id, location_id, movement_type)` where source is set → a document can never be applied twice
  - `reason` required when `movement_type = 'adjustment'`
- `stock_levels (organization_id, location_id, variant_id, quantity int CHECK (quantity >= 0), updated_at)` PK `(location_id, variant_id)`
  - only written by the same function that inserts the movement, in the same
    transaction, after `SELECT … FOR UPDATE` on the row (locks in a fixed order
    by variant_id to avoid deadlocks) → two concurrent sales cannot both take
    the last unit; the CHECK is the last line of defence.
  - reconciliation query (and a test): `stock_levels.quantity = SUM(quantity_delta)` per (location, variant).
- `stock_counts (id, organization_id, location_id, status draft→submitted→approved|cancelled, counted_by, approved_by)` and
  `stock_count_items (count_id, variant_id, expected_qty snapshot, counted_qty)`.
  Approval creates one `adjustment` movement per non-zero difference.
- Valuation (M3/M6): quantity × current variant cost (documented as an
  estimate; weighted-average costing considered later).

### Sales (M4)
- `sales (id, organization_id, location_id, number, status draft|finalized|cancelled, customer_id?, subtotal, discount_total, total, paid_total, idempotency_key uuid, finalized_at, finalized_by)`
  - unique `(organization_id, idempotency_key)`, unique `(organization_id, location_id, number)`
- `sale_items (sale_id, variant_id, quantity > 0, unit_price_millimes, discount_millimes, line_total, unit_cost_snapshot_millimes)`
- `sale_payments (sale_id, method, amount_millimes > 0, received_at, idempotency_key)`
- `payment_methods (organization_id, code, label, is_active)` — cash, card, transfer, …
- `sale_returns`, `sale_return_items` — explicit reversal documents; return
  movement restores stock only when marked *resellable*.
- `document_sequences (organization_id, location_id, doc_type, next_value)` —
  numbers allocated under row lock in the finalize transaction.
- `finalize_sale(sale_id, idempotency_key, payment?)`: lock sale → recompute
  prices/totals in SQL → lock stock levels → insert movements → payment →
  audit; any failure rolls everything back; replay with same key returns the
  original result.

### Purchasing (M5)
- `suppliers`, `purchase_orders`, `purchase_order_items (ordered_qty, received_qty ≤ ordered_qty, unit_cost)`,
  `goods_receipts`, `goods_receipt_items` (one receipt = one idempotent document),
  `supplier_payments`. Ordering never moves stock; receipts do.

### Customers, cash, subscriptions (M4–M7)
- `customers (organization_id, name, phone?, address?, notes)` — minimal data.
- `cash_sessions`, `expenses`, `expense_categories` — operational cash, not accounting.
- `subscriptions (organization_id, plan solo|business|multi_shop, status trial|active|past_due|cancelled, started_at, current_period_end)` +
  `subscription_events`; plan limits enforced in SQL functions.

## 5. Transaction boundaries (summary)

| Operation | Boundary |
| --- | --- |
| Create organization | `create_organization()` |
| Membership / invitation changes | the respective function |
| Stock adjustment, count approval, transfer | one function each (M3) |
| Finalize sale, record payment, return | one function each (M4) |
| Goods receipt | one function (M5) |

Nothing that changes stock or money is composed from several client calls.

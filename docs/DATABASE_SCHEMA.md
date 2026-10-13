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

## 2a. Rate limiting (implemented, migration `20261014090000_rate_limits.sql`)

`private.rate_limit_counters (bucket, window_start, hits)` + `private.enforce_rate_limit(bucket, limit, window)`:
fixed windows; an over-limit call raises `rate_limited` and, because the
exception rolls back, does not consume the window. Applied to invitations
(trigger, 30/h/org) and import staging (30/h/org).

## 2b. Catalog (implemented, Milestone 2)

```
categories ──┐                     suppliers ──┐
             │0..1                             │0..1
             └──────────── products ───────────┘
                              │1
                              │1..200
                        product_variants ──1:1── product_variant_costs (owner/manager only)
catalog_import_batches (staged CSV payloads, committed once)
```

| Table | Key constraints |
| --- | --- |
| `categories` | name 1–80; unique `(organization_id, lower(name))`; deletable (products get `category_id = NULL` via `ON DELETE SET NULL (category_id)`) |
| `suppliers` | name 1–120, unique per org (case-insensitive); optional phone/email/notes; no delete (deactivate) |
| `products` | name 1–200; `option_names text[]` ≤ 3 distinct labels, **immutable** (not in the UPDATE grant); composite FKs `(organization_id, category_id)` / `(organization_id, supplier_id)`; no INSERT/DELETE grant (creation via `create_product`) |
| `product_variants` | `option_values` must have one value per product option (trigger); unique `(product_id, options_key(option_values))` (case-insensitive); SKU unique `(organization_id, upper(sku))`; barcode unique `(organization_id, barcode)`; `price_millimes` 0–10¹²; `low_stock_threshold ≥ 0`; composite FK to products; no DELETE |
| `product_variant_costs` | 1:1 with variants (row created by trigger, `cost_millimes NULL` = unknown); readable/updatable by owner/manager only |
| `catalog_import_batches` | `status pending → committed` (once); payload ≤ 2000 products / 5000 variants / 5 MB; readable by owner/manager |

Audit: generic trigger `private.audit_row_change(entity, id_column)` logs
`<entity>.created|updated|deleted`; updates store only changed columns as
`[old, new]` (e.g. price history `{"price_millimes": [18500, 19900]}`).

| Function | Kind | Transaction / authorization |
| --- | --- | --- |
| `create_product(org, payload)` | definer | product + variants + costs, all-or-nothing; owner/manager |
| `save_variant(org, product, variant_id?, payload)` | definer | insert or update a variant **and** its cost atomically; owner/manager |
| `search_products(org, q, category, include_inactive, limit, offset)` | invoker (RLS) | name ILIKE (trigram index), SKU ILIKE, exact barcode; `%`/`_` escaped |
| `find_variant_by_code(org, code)` | invoker (RLS) | exact barcode or SKU (scanner) |
| `find_catalog_conflicts(org, names, skus, barcodes)` | invoker (RLS) | import preview |
| `stage_catalog_import(org, file, products, summary)` | definer | rate-limited, size-checked; owner/manager |
| `commit_catalog_import(batch)` | definer | `SELECT … FOR UPDATE` on the batch → find-or-create categories/suppliers → refuse existing product names → insert products; any error rolls back everything; second commit → `import_already_committed` |

Errors from constraints are translated to stable keys (`duplicate_sku`,
`duplicate_barcode`, `duplicate_variant_options`, `variant_options_mismatch`,
`invalid_reference`, `invalid_product`, `import_*`); for import commits the
offending product name is returned in `details`.

## 2c. Inventory (implemented, Milestone 3)

```
stock_receipts ─┐  stock_adjustments (opening | adjustment) ─┐  stock_counts ─┐  stock_transfers ─┐
  lines (+cost) │    lines (signed delta)                    │   items        │   lines           │
                └──────────────┬─────────────────────────────┴────────────────┴───────────────────┘
                               ▼  private.apply_stock_lines()  (the ONLY write path)
              stock_movements (append-only ledger)  +  stock_levels (balance, CHECK quantity >= 0)
```

**Invariants (all tested, several on a real PostgreSQL server under concurrency):**

1. `stock_levels.quantity = SUM(stock_movements.quantity_delta)` per (location, variant), and the
   last movement's `quantity_after` equals the balance — `check_stock_reconciliation(org)` returns
   the rows where this does not hold (must be empty).
2. Stock is never negative: checked before writing (`insufficient_stock`, with the product name
   and available quantity in `details`) **and** by `CHECK (quantity >= 0)`.
3. Concurrency: each line locks its `stock_levels` row (`SELECT … FOR UPDATE`) in a global order
   `(variant_id, location_id)`; the preceding `INSERT … ON CONFLICT DO NOTHING` also waits on a row
   being changed by another transaction. Two withdrawals of the last units → exactly one succeeds.
   Opposite transfers of several variants run in parallel without deadlocks.
4. The ledger is immutable: no INSERT/UPDATE/DELETE grant for API roles, and a trigger rejects
   UPDATE/DELETE for everyone (`stock_ledger_immutable`). Corrections are new movements.
5. A document line is applied at most once: `unique (source_type, source_id, variant_id, location_id, movement_type)`.
6. Idempotency: every posting function takes an idempotency key, unique per organization and
   document type. A replay — even concurrent — returns the existing document.
7. Document numbers are per organization and type, gap-free (`document_sequences`, row-locked,
   rolled back with the transaction). Displayed as REC-/AJU-/INV-/TRF-000001.
8. `stock_movements.seq` (identity) gives the true application order; `created_at` is the
   transaction start time and is only for display.

| Function | Who | Effect |
| --- | --- | --- |
| `post_stock_receipt(org, location, supplier?, reference, note, lines, update_costs, key)` | owner/manager | `purchase_receipt` movements; optional update of variant purchase costs |
| `record_opening_stock(org, location, lines, key)` | owner/manager | `opening` movements; refused if the variant already has a movement at that location |
| `create_stock_adjustment(org, location, reason, lines, key)` | any member | creates a **pending** adjustment (no stock change) |
| `review_stock_adjustment(id, approve, note)` | owner/manager | approve → `adjustment` movements with the reason; reject → nothing |
| `create_stock_count(org, location, note, variant_ids?, key)` | owner/manager | count sheet (all tracked active variants by default); one open count per location |
| `record_stock_count(count, items)` | any member | stores counted quantity **and the book quantity at that moment** |
| `submit_stock_count` / `review_stock_count(approve)` / `cancel_stock_count` | member / owner-manager | approve applies `counted − expected` for counted items only; reject returns to counting |
| `post_stock_transfer(org, from, to, note, lines, key)` | owner/manager | `transfer_out` + `transfer_in` in one transaction |
| `search_variants`, `stock_overview` | any member (RLS) | variant picker; stock on hand with low-stock flag |
| `stock_valuation(org, location?)` | owner/manager | Σ quantity × current purchase cost (estimate); counts variants without cost |
| `check_stock_reconciliation(org)` | owner/manager | integrity check (see invariant 1) |

**Definitions.** *Stock on hand* = sum of balances at active locations (or one location).
*Low stock* = stock on hand ≤ the variant's `low_stock_threshold` (no threshold = never low).
*Valuation* = Σ quantity × **current** purchase cost — an estimate, not FIFO/weighted-average
accounting. Sale (`sale`, `customer_return`) and `supplier_return` movement types exist but are
only produced from Milestones 4–5.

**Visibility.** Quantities, movements, adjustments, counts and transfers: every member.
Receipts and opening costs (they contain purchase costs): owner/manager only.

## 3. Tenant isolation strategy

1. RLS on every table; policies reference only `auth.uid()` through
   membership helpers — a client-supplied `organization_id` is never sufficient.
2. Table and column `GRANT`s restrict verbs even where a policy would allow a row.
3. Membership is only changed through audited definer functions.
4. Composite FKs `(organization_id, parent_id)` (in use since M2) so a row can never
   point at another tenant's product/location/customer even via a definer function bug.
5. Automated tests (tests/db) for every table and role; catalog tests fail if
   a new table forgets RLS or grants something to `anon`.

## 4. Proposed schema for Milestones 2–7

Catalog (M2) is implemented — see §2b.

Inventory (M3) is implemented — see §2c.

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
| Receipt, opening stock, adjustment approval, count approval, transfer | one function each (M3) |
| Finalize sale, record payment, return | one function each (M4) |
| Goods receipt | one function (M5) |

Nothing that changes stock or money is composed from several client calls.

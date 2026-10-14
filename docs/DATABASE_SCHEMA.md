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

## 2d. Sales, payments, returns, customers (implemented, Milestone 4)

```
customers ─┐         payment_methods (defaults: Espèces, Carte bancaire, Virement, Chèque)
           ▼                     │
sales (draft → finalized | cancelled) ──┬── sale_items ── sale_item_costs (owner/manager)
           │                            ├── sale_payments (payment | refund)
           │                            └── sale_returns ── sale_return_items
           └── stock_movements (sale / customer_return) via private.apply_stock_lines
```

**Money rules** (SQL `private.compute_sale`, mirrored in `src/lib/domain/pricing.ts`, parity-tested):

| Quantity | Definition |
| --- | --- |
| line gross | quantity × **current price from the database** (the browser never sends prices) |
| line discount | round_half_up(gross × discount_bps / 10 000) |
| line total | gross − line discount |
| subtotal | Σ line totals |
| total | subtotal − order discount (fixed amount, ≤ subtotal) |
| order discount share | proportional to line totals; floor, leftover millimes to largest remainders (ties: first line) — Σ shares = order discount |
| line net total | line total − share — Σ net totals = total |
| return amount | round_half_up(net × returned_after / qty) − round_half_up(net × returned_before / qty) — a fully returned line refunds exactly its net total |
| paid | Σ payments − Σ refunds (never negative) |
| balance due | total − returned − paid (negative = owed to the customer) |

**Invariants.**
1. `finalize_sale` is one transaction: recompute prices → sale + lines + cost snapshots → number
   (gap-free) → stock movements (insufficient stock aborts everything) → payments → audit.
2. Idempotent on `finalize_idempotency_key` (also concurrent); payments, refunds and returns
   each carry their own idempotency key.
3. Cashiers: discount ≤ `organizations.cashier_max_discount_bps` per line and on the total
   (`discount_not_allowed`); owner/manager unlimited.
4. Partial payment (credit) requires a customer; payments never exceed the balance; refunds
   never exceed what was overpaid. The sale row is locked for every money change.
5. Finalized sales, their lines, payments and returns are immutable (triggers + no grants);
   corrections are returns/refunds. Drafts can be edited or cancelled.
6. Purchase cost is snapshotted per line at finalization in `sale_item_costs` (owner/manager only).
7. `check_sales_consistency(org)` returns sales whose stored aggregates (paid, total, returned,
   returned quantities, stock movements) disagree with their detail rows — must be empty.

| Function | Who |
| --- | --- |
| `save_sale_draft`, `cancel_sale_draft`, `finalize_sale`, `record_sale_payment` | any member |
| `create_sale_return` (restock optional per line, optional immediate refund), `record_sale_refund` | owner/manager |
| `sales_daily_summary(org, day, location?)` — in the organization timezone | any member |
| `customer_balances(org)` | any member |
| `check_sales_consistency(org)` | owner/manager |

**Daily summary definitions**: *sales total* = Σ totals of sales finalized that day;
*returns* = Σ return amounts recorded that day (whatever the sale date); *net sales* =
sales total − returns; *payments by method* = money received minus refunds that day;
*credit given* = balance still due on that day's sales. Not an accounting ledger; no taxes.

## 2e. Purchasing (implemented, Milestone 5)

```
suppliers ──┬── purchase_orders (draft → ordered → partially_received → received | closed; cancelled)
            │        └── purchase_order_items (quantity, unit_cost, received_quantity)
            │                    ▲
            ├── stock_receipts (+ purchase_order_id, total_cost_millimes, lines_without_cost)
            │        └── stock_receipt_lines (+ purchase_order_item_id)  ── stock_movements
            └── supplier_payments (payment | refund received)
```

**Rules.**
1. Placing an order never moves stock. Receiving does, through `private.apply_stock_lines`.
2. A receipt against an order locks the order row, checks `quantity ≤ ordered − received` per line
   (`receipt_exceeds_ordered`), and `CHECK (received_quantity ≤ quantity)` is the backstop.
   Concurrent receipts: verified on PostgreSQL; with the order lock removed the CHECK still blocks
   the over-receipt (mutation-tested).
3. Only drafts are editable; placed orders are frozen except `received_quantity` (trigger
   `purchase_order_locked`). Cancel = nothing received yet; close = stop waiting for the rest.
4. Receipt totals are maintained from their lines by trigger (also for M3 direct receipts,
   backfilled); receipt lines and supplier payments are immutable.
5. **Supplier balance** = Σ receipt values from that supplier (lines with a known cost) −
   Σ payments + Σ refunds received. Negative = advance paid. Receipts with costless lines are
   flagged, not guessed.
6. Everything here is owner/manager only (it carries purchase costs).

| Function | Effect |
| --- | --- |
| `save_purchase_order(org, po?, supplier, location, expected_date, reference, note, lines)` | create/replace a draft (cost required per line) |
| `place_purchase_order(po)` | draft → ordered, number BC-000001… |
| `cancel_purchase_order(po)` / `close_purchase_order(po)` | see rule 3 |
| `receive_purchase_order(po, lines, reference, note, update_costs, key)` | idempotent receipt; optional cost override per line and cost update |
| `record_supplier_payment(org, supplier, method, kind, amount, paid_on, reference, note, po?, key)` | idempotent payment or refund received |
| `supplier_balances(org)` | purchases, paid, balance per supplier |
| `check_purchasing_consistency(org)` | received quantities, receipt totals, order totals and statuses vs. details — must be empty |

## 2f. Search and lists (implemented, phase 2 — `20261018090000_search.sql`)

Extension `unaccent`; `private.search_key(text)` = lower case without accents
(IMMUTABLE, indexed with trigram GIN on products, customers and suppliers
names). All functions below are SECURITY INVOKER (RLS applies).

| Function | Purpose |
| --- | --- |
| `search_products(org, q, category, include_inactive, limit, offset, sort)` | + accent-insensitive names; sort `name`, `name_desc`, `price_asc`, `price_desc`, `recent` |
| `search_variants(org, q, location, limit)` | accent-insensitive (cart, stock forms) |
| `stock_overview(org, location, q, low_only, limit, offset, sort)` | + sort `name`, `quantity_asc`, `quantity_desc` |
| `search_customers(org, q, due_only, sort, limit, offset)` | name (no accents) or phone; balance = Σ (total − returned − paid) of finalized sales |
| `search_sales(org, status, from, to, customer, due_only, q, sort, limit, offset)` | local-day range in the organization's time zone; q = number or customer name |
| `global_search(org, q, limit_per_kind)` | command palette: products, customers, suppliers, sales and purchase orders by number |

## 2g. Reports (implemented, phase 3 / Milestone 6 — `20261019090000_reports.sql`)

Read-only, SECURITY DEFINER with an owner/manager check (they read costs).
Definitions: docs/REPORTS.md.

| Function | Purpose |
| --- | --- |
| `report_sales_by_day(org, from, to, location?)` | one row per local day: sales, returns, net, credit, cost, estimated margin, revenue without cost |
| `report_sales_by_product(org, from, to, group, sort, limit)` | by product or category (`group`), sorted by revenue, quantity or margin |
| `report_payments_by_method(org, from, to)` | received, refunded, net per method |
| `dashboard_attention(org)` | pending adjustments, submitted counts, late purchase orders, customers owing |

Periods are validated by `private.require_report_period` (from ≤ to, ≤ 367 days).

## 2h. Integrations (implemented, phase 4 — `20261020090000_integrations.sql`)

`organization_integrations (organization_id, integration, enabled, updated_by)`:
`integration` ∈ `barcode_lookup`, `exchange_rates`; RLS select for members;
no direct writes; audited (`integration.created/updated`).

| Function | Purpose |
| --- | --- |
| `set_integration_enabled(org, integration, enabled)` | owner only |
| `consume_integration_call(org, integration)` | gate before each external call: member, switched on, quotas (`integration_disabled`, `rate_limited`) |

Details and providers: docs/INTEGRATIONS.md.

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

Sales (M4) is implemented — see §2d.

Purchasing (M5) is implemented — see §2e.

### Customers, cash, subscriptions (M4–M7)
- Customers are implemented (M4, §2d).
- `cash_sessions`, `expenses`, `expense_categories` — operational cash, not accounting.
- `subscriptions (organization_id, plan solo|business|multi_shop, status trial|active|past_due|cancelled, started_at, current_period_end)` +
  `subscription_events`; plan limits enforced in SQL functions.

## 5. Transaction boundaries (summary)

| Operation | Boundary |
| --- | --- |
| Create organization | `create_organization()` |
| Membership / invitation changes | the respective function |
| Receipt, opening stock, adjustment approval, count approval, transfer | one function each (M3) |
| Finalize sale, record payment, return (+ refund), refund | one function each (M4) |
| Purchase order placement, receipt against an order, supplier payment | one function each (M5) |

Nothing that changes stock or money is composed from several client calls.

# SoukPilot — Development Roadmap & Status

Planning estimate, not a guarantee. Security and financial-integrity defects
take priority over the schedule. Last updated 2026-10-14.

Legend: ✅ done & tested · 🟡 partial · ⬜ not started · ⛔ blocked (needs something outside the repo)

## Milestone 1 — Foundation, auth, tenancy

| Item | Status | Notes |
| --- | --- | --- |
| Scaffold, architecture, ADRs | ✅ | Next.js 16.4, TS strict, Tailwind 4 |
| Organizations, roles, membership, invitations, audit log | ✅ | RLS + functions, DB-tested on PGlite **and** real PostgreSQL 17 |
| Registration, login, email confirmation, password reset | 🟡 | Implemented; ⛔ not exercised against a running Supabase Auth (needs Docker or a Supabase project) |
| Security tests (2 orgs, 3 roles, anon, direct DB access) | ✅ | Also run on a real PostgreSQL server (`npm run test:db:pg`) |
| Rate limiting | ✅ | DB-enforced: invitations 30/h/org, import staging 30/h/org, org creation ≤ 5/account; Supabase Auth limits for auth endpoints |
| Nonce-based CSP | ✅ | Per-request nonce in `src/proxy.ts`; verified in a browser on a production build (hydration OK, no violations) |
| Invitation delivery | ✅ | Still no email sending (by design); the inviter gets a ready-to-send message with a copy button |
| Hosting terms verified | ✅ | See docs/DEPLOYMENT.md (checked 2026-10-13) |
| Generated DB types vs hand-written | ⛔ | Needs `supabase start` (Docker) |
| E2E tests (Playwright) | ⛔ | Need a running Supabase Auth to sign in; not started |

## Milestone 2 — Catalog (current)

| Item | Status | Notes |
| --- | --- | --- |
| Categories (CRUD, delete un-categorizes) | ✅ | DB-tested; UI built |
| Suppliers (minimal: name, phone, email, notes, active) | ✅ | Owner/manager only (RLS); purchasing comes in M5 |
| Products + variants (≤ 3 options, stable variant ids) | ✅ | Atomic `create_product`, `save_variant`; composite FKs; DB + unit tested |
| SKU / barcode uniqueness per organization | ✅ | SKU case-insensitive; both optional |
| Purchase cost hidden from cashiers | ✅ | Separate `product_variant_costs` table, RLS owner/manager; mutation-tested |
| Price/cost change audit | ✅ | Generic audit trigger with `[old, new]` per changed column |
| Search by name / SKU / barcode | ✅ | `search_products` (trigram index, wildcards escaped), `find_variant_by_code` |
| Locations management UI | ✅ | Create / rename / code / deactivate |
| CSV import (template, preview, validation, duplicates, row errors, summary) | ✅ | Pure analyzer (unit-tested) + staged batch + idempotent all-or-nothing commit (DB-tested, incl. concurrent double-commit on real PostgreSQL) |
| Money utilities (integer millimes) | ✅ | Parse/format, no floating point, round-trip tested |
| Product images | ⬜ | Deferred: needs Supabase Storage bucket + policies |
| Accent-insensitive search (é = e) | ⬜ | Needs `unaccent`; planned |
| Import updates of existing products | ⬜ | Import only creates; updating via CSV needs an explicit, reviewed "update mode" |
| UI exercised end-to-end with a signed-in user | ⛔ | Same blocker as M1 auth |

## Milestone 3 — Inventory
⬜ stock ledger, stock levels with row locking, opening stock (incl. from import), adjustments with reason + approval, stock counts (mobile), movement history, low-stock alerts (thresholds already stored), concurrency tests (the real-PostgreSQL runner now makes these possible), reconciliation check.

## Milestone 4 — Sales
⬜ draft sales, server-side totals/discounts, idempotent finalize, payments (partial), returns/cancellations as reversal documents, printable internal receipt, payment methods, document numbering, cost snapshot per sale item (costs table ready).

## Milestone 5 — Purchasing
⬜ purchase orders, idempotent goods receipts, supplier payments and balances (suppliers table exists).

## Milestone 6 — Reports, dashboard, mobile, PWA
⬜ documented metrics, timezone-correct date ranges, PWA manifest/installation, barcode scanning via camera (Permissions-Policy already allows `camera=(self)`).

## Milestone 7 — Subscriptions, security review, backups
⬜ subscription metadata + manual activation, server-side plan limits (incl. number of locations), payment-provider abstraction, security review, **restore drill**.

## Milestone 8 — Pilot
⬜ onboard 3–5 businesses, fix top issues, document limitations, prepare paid release.

## Highest-risk operations (design attention before coding)

1. **Finalize sale** — double submission, concurrent overselling, partial commits, price tampering.
2. **Goods receipt** — double receipt doubling stock; partial receipts exceeding ordered qty.
3. **Stock count approval** — counts taken while sales continue (expected qty snapshot vs. live movements).
4. **Returns/refunds** — refund > paid, restocking non-resellable goods, returning more than sold.
5. **Payments & balances** — rounding, partial payments, outstanding balance drift.
6. **Membership/role changes** — covered in M1.
7. **CSV import** — covered in M2 (no silent merge, idempotent commit, formula-injection-safe template).
8. **Plan enforcement** — client-side-only limits.

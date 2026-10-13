# SoukPilot — Development Roadmap & Status

Planning estimate, not a guarantee. Security and financial-integrity defects
take priority over the schedule. Last updated 2026-10-13.

Legend: ✅ done & tested · 🟡 partial · ⬜ not started

## Milestone 1 — Foundation, auth, tenancy (current)

| Item | Status | Notes |
| --- | --- | --- |
| Repository inspection / scaffold | ✅ | Repo was empty; Next.js 16.4, TS strict, Tailwind 4 |
| Architecture & ADRs | ✅ | docs/ARCHITECTURE.md |
| Registration, login, logout | 🟡 | Implemented; not yet exercised against a running Supabase Auth |
| Email confirmation, password reset | 🟡 | `/auth/confirm` token_hash + PKCE; French templates; not yet run end-to-end |
| Organizations, default location | ✅ | `create_organization()` + tests |
| Roles owner/manager/cashier | ✅ | RLS + functions + tests |
| Membership management (role change, remove, leave) | ✅ | DB tested; UI built, not E2E tested |
| Invitations (no email sending) | ✅ | DB tested; UI built, not E2E tested |
| Profile & organization settings | ✅ | Column-level grants tested |
| Audit log | ✅ | Append-only, tested |
| Protected routes | ✅ | Proxy redirect smoke-tested on a production build |
| Security tests (2 orgs, 3 roles, anon, direct DB access) | ✅ | 42 DB tests on PGlite |
| Run DB tests against a real Supabase stack | ⬜ | Needs Docker or a staging project |
| E2E tests (Playwright) | ⬜ | Needs a running Supabase; planned with M2 |
| App-level rate limiting on server actions | ⬜ | Supabase Auth limits apply to auth endpoints |
| Nonce-based CSP | ⬜ | Basic headers in place |

## Milestone 2 — Catalog
⬜ categories, products, variants (attributes), locations UI, search (name/SKU/barcode),
CSV import (template, preview, row errors, duplicate detection), Playwright setup,
money utilities (`src/lib/domain/money.ts`) with tests.

## Milestone 3 — Inventory
⬜ stock ledger, stock levels with locking, opening stock, adjustments with
reason + approval, stock counts (mobile), movement history, low-stock alerts,
concurrency tests (parallel connections), reconciliation check.

## Milestone 4 — Sales
⬜ draft sales, server-side totals/discounts, idempotent finalize, payments
(partial), returns/cancellations as reversal documents, printable internal
receipt, payment methods, document numbering.

## Milestone 5 — Purchasing
⬜ suppliers, purchase orders, idempotent goods receipts (partial if unambiguous),
supplier payments and balances.

## Milestone 6 — Reports, dashboard, mobile, PWA
⬜ documented metrics (sales by day/product/category, payments by method,
stock on hand/valuation, low stock, adjustments, estimated gross margin),
timezone-correct date ranges, PWA manifest/installation.

## Milestone 7 — Subscriptions, security review, backups
⬜ subscription metadata + manual activation/renewal, server-side plan limits,
payment-provider abstraction (no provider yet), security review, backup and
**restore drill**.

## Milestone 8 — Pilot
⬜ onboard 3–5 businesses, fix top issues, document limitations, prepare paid release.

## Feature status summary

- **Implemented**: auth flows (code), organizations, roles, invitations, profile, org settings, audit log, RLS + tests.
- **Partially implemented**: auth flows not yet verified end-to-end; locations exist (default + DB policies) but have no create/edit UI.
- **Not implemented**: everything from Milestone 2 onward; Arabic/RTL (only prepared); offline mode (not planned for MVP); fiscal invoicing (requires local legal/accounting review).

## Highest-risk operations (design attention before coding)

1. **Finalize sale** — double submission, concurrent overselling, partial commits, price tampering.
2. **Goods receipt** — double receipt doubling stock; partial receipts exceeding ordered qty.
3. **Stock count approval** — counts taken while sales continue (expected qty snapshot vs. live movements).
4. **Returns/refunds** — refund > paid, restocking non-resellable goods, returning more than sold.
5. **Payments & balances** — rounding, partial payments, outstanding balance drift.
6. **Membership/role changes** — privilege escalation, lockout (covered in M1).
7. **CSV import** — silent merges, injection into spreadsheets on export (CSV formula injection).
8. **Plan enforcement** — client-side-only limits.

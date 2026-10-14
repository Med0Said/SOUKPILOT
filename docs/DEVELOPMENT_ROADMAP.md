# SoukPilot — Development Roadmap & Status

Planning estimate, not a guarantee. Security and financial-integrity defects
take priority over the schedule. Last updated 2026-10-14.

Legend: ✅ done & tested · 🟡 partial · ⬜ not started · ⛔ blocked (needs something outside the repo)

## Modernization phase 4 — Integrations, free tier (2026-10-14)

| Item | Status | Notes |
| --- | --- | --- |
| Adapter layer: timeouts, retry, size cap, validation, caches, provider status | ✅ | Unit tests with a fake fetch; one live check against the real providers |
| Per-organization switches (owner, audited) and quotas enforced in the database | ✅ | DB tests |
| Paramètres → Intégrations page (provider, licence, data sent, limits, last call) | ✅ | E2E |
| Barcode pre-fill on new articles (Open Food Facts / Open Beauty Facts), applied only on click, ODbL attribution | ✅ | E2E with offline fixtures |
| Indicative currency → TND converter (purchases, Intégrations page) | ✅ | E2E; never stored |
| Transactional e-mail | ⛔ | Needs a domain (SPF/DKIM); documented in docs/INTEGRATIONS.md |
| Public holidays | ⬜ | Not added: Nager.Date lacks the Islamic holidays for Tunisia |

## Modernization phase 3 — Reports, dashboards, PWA (Milestone 6, 2026-10-14)

| Item | Status | Notes |
| --- | --- | --- |
| Report functions with documented formulas (sales by day, by article, by category, payments) | ✅ | docs/REPORTS.md; per-day figures = daily summary (DB test); mutation-checked |
| Estimated margin on known costs, unknown costs reported separately | ✅ | DB + E2E |
| Organization time zone respected (days, periods) | ✅ | DB tests run in UTC |
| Rapports page: periods, comparison with previous period, SVG chart, top articles, categories, payments, CSV exports | ✅ | E2E (incl. CSV content) |
| Dashboards per role (owner/manager: 7 days + "À traiter"; cashier: today, drafts, low stock) | ✅ | E2E for both roles |
| Reports refused to cashiers (page, export, SQL) | ✅ | DB + E2E |
| Installable PWA (manifest, icons, shortcuts) | ✅ | No service worker / offline mode, by design |
| Reports by location, by cashier; stock reports beyond valuation | ⬜ | Next |
| Barcode scanning via camera | ⬜ | Still planned (Milestone 6 remainder) |

## Modernization phase 2 — Productivity (2026-10-14)

| Item | Status | Notes |
| --- | --- | --- |
| Accent-insensitive search (`unaccent`), incl. cart and stock pickers | ✅ | Migration `20261018090000_search.sql`, DB tests |
| Sortable / filterable list functions (articles, stock, customers, sales) and global search function | ✅ | DB tests (RLS: cashier never sees suppliers or orders) |
| CSV export building blocks (formula guard, numeric cells, catalog export = import template) | ✅ | Unit tests (round-trip through the importer) |
| Ctrl/Cmd+K command palette: pages, actions (by role), live data search (articles, clients, suppliers, sales and orders by number) | ✅ | E2E: keyboard, accents, Esc; cashier gets no supplier (E2E + DB) |
| Lists with sort, pagination, filters in the URL: articles, stock, sales (dates, unpaid, number/client), clients (owing), purchases (supplier), movements | ✅ | E2E: 35 articles over 2 pages |
| Saved views (named filters, per device) | ✅ | E2E: save, reopen, delete |
| CSV export of every list (all filtered rows, up to 10 000) | ✅ | E2E checks file content; cashier export has no purchase cost; purchases export refused to cashiers |
| Favourites / recent pages | ⬜ | Not built (the palette covers fast navigation) |

## Modernization phase 1 — UI foundation (2026-10-14)

| Item | Status | Notes |
| --- | --- | --- |
| Brand proposal (« Sidi Bou Saïd »), logo, favicon, tokens | ✅ | docs/BRAND.md |
| Light / dark / system theme, remembered, no flash | ✅ | E2E |
| Grouped, collapsible sidebar; user menu; phone top and bottom bars with icons | ✅ | E2E (state remembered) |
| Accessible confirmation dialog replacing `window.confirm` (11 call sites) | ✅ | E2E: cancel, Esc, focus, confirm |
| Breadcrumbs on detail pages | ✅ | E2E |
| Icons in alerts and empty states, refreshed badges, buttons and cards | ✅ | |
| Loading skeletons (list pages) and a shared error screen | ✅ | 404 of detail pages preserved |
| Visual review in light/dark, desktop/phone | ✅ | `SP_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts` |
| Automated accessibility audit (axe) | ⬜ | Not added (would be a new dependency); keyboard and labels covered by E2E |
| Toasts | ⬜ | Deferred: inline, announced messages already cover every action |

## Modernization phase 0 — Verification on a real Supabase (2026-10-14)

| Item | Result |
| --- | --- |
| All 12 migrations on a real Supabase PostgreSQL (local stack) | ✅ Applied with `supabase migration up` (existing local data kept) |
| DB test suite on Supabase's PostgreSQL | ✅ 123/123 |
| Generated types vs hand-written types | ✅ Contract enforced by `npm run typecheck` |
| E2E: auth, full §12 business workflow, consistency checks, tenant isolation, invitation + cashier rights, phone navigation, purchasing | ✅ 9/9, two consecutive runs |
| Defect found: built-in 404 page blocked by the CSP (unstyled) | ✅ Fixed with a French `not-found` page |
| `site_url` (127.0.0.1) ≠ app URL (localhost) in local config | ✅ Aligned; takes effect after `supabase stop && supabase start` |

## Milestone 1 — Foundation, auth, tenancy

| Item | Status | Notes |
| --- | --- | --- |
| Scaffold, architecture, ADRs | ✅ | Next.js 16.4, TS strict, Tailwind 4 |
| Organizations, roles, membership, invitations, audit log | ✅ | RLS + functions, DB-tested on PGlite **and** real PostgreSQL 17 |
| Registration, login, email confirmation, password reset | 🟡 | Sign-up, email confirmation, login, wrong password, sign-out: ✅ E2E. Password reset: not yet E2E |
| Security tests (2 orgs, 3 roles, anon, direct DB access) | ✅ | Also run on a real PostgreSQL server (`npm run test:db:pg`) |
| Rate limiting | ✅ | DB-enforced: invitations 30/h/org, import staging 30/h/org, org creation ≤ 5/account; Supabase Auth limits for auth endpoints |
| Nonce-based CSP | ✅ | Per-request nonce in `src/proxy.ts`; verified in a browser on a production build (hydration OK, no violations) |
| Invitation delivery | ✅ | Still no email sending (by design); the inviter gets a ready-to-send message with a copy button |
| Hosting terms verified | ✅ | See docs/DEPLOYMENT.md (checked 2026-10-13) |
| Generated DB types vs hand-written | ✅ | Compile-time contract; found and fixed 2 missing tables and 3 JSON nullability differences |
| E2E tests (Playwright) | ✅ | 9 tests, see phase 0 below |

## Milestone 2 — Catalog

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
| UI exercised end-to-end with a signed-in user | 🟡 | Product with variants ✅ E2E; CSV import, categories UI not yet |

## Milestone 3 — Inventory

| Item | Status | Notes |
| --- | --- | --- |
| Append-only stock ledger + locked balances | ✅ | Single write path, `CHECK (quantity >= 0)`, immutable ledger; mutation-tested |
| Goods receipt (without purchase order) | ✅ | Idempotent, numbered, optional cost update; owner/manager |
| Opening stock | ✅ | Once per variant and location, race-safe |
| Adjustments with reason, review and approval | ✅ | Any member proposes; owner/manager approve/reject |
| Stock counts (mobile, blind) | ✅ | Per-item book snapshot; approval applies differences only for counted items |
| Transfers between locations | ✅ | Atomic out + in; deadlock-free ordering tested |
| Stock by variant / location, low-stock alerts | ✅ | Overview page + dashboard card (live data) |
| Movement history | ✅ | Filters by article, location, type |
| Stock valuation (estimate at current cost) | ✅ | Owner/manager only |
| Reconciliation check | ✅ | `check_stock_reconciliation`; asserted after concurrency tests |
| Concurrency tests on real PostgreSQL | ✅ | Forced overlap (first transaction held open) |
| Opening stock from CSV import | ⬜ | Import creates products only; opening stock is entered per location afterwards |
| Negative-stock override setting | ⬜ | Not offered (spec: no negative stock by default) |
| Stock UI exercised with a signed-in user | 🟡 | Opening stock, receipt, overview, movements ✅ E2E; counts, transfers, adjustment approval not yet |

## Milestone 4 — Sales

| Item | Status | Notes |
| --- | --- | --- |
| Cart with server-side pricing, line % discounts and total discount | ✅ | TS preview = SQL result (parity test) |
| Cashier discount limit (organization setting) | ✅ | Enforced in SQL |
| Idempotent one-transaction finalization (stock, payments, cost snapshot, audit) | ✅ | Concurrency + mutation tested |
| Drafts (save, resume, cancel) | ✅ | |
| Configurable payment methods (defaults + D17-style mobile) | ✅ | |
| Partial payments / credit to a customer, later payments | ✅ | Overpayment refused; concurrent double payment refused |
| Returns with optional restock and refund, later refunds | ✅ | Cumulative rounding; owner/manager |
| Printable internal receipt | ✅ | "Reçu interne — ne vaut pas facture" |
| Daily summary (sales, returns, payments by method, credit) | ✅ | Organization timezone |
| Customers with history and balances | ✅ | Minimal personal data |
| Estimated gross margin per sale (owner/manager) | ✅ | Reports across sales come in M6 |
| Cash session (opening float, expected vs counted cash) | ⬜ | Planned with Module G (cash & expenses) |
| Fiscal invoice / VAT | ⬜ | Not planned before verified Tunisian rules and local review |
| Sales UI exercised with a signed-in user | ✅ | Sale, new customer, partial payment, return + refund, receipt, daily summary, cashier discount cap — E2E |

## Milestone 5 — Purchasing (current)

| Item | Status | Notes |
| --- | --- | --- |
| Supplier management (M2) + supplier account page | ✅ | Purchases, payments, balance |
| Purchase orders: draft, place (numbered), cancel, close | ✅ | Ordering never moves stock |
| Receipts against orders (partial, capped, idempotent, concurrent-safe) | ✅ | Cost override + optional cost update |
| Supplier payments and refunds received | ✅ | Immutable, idempotent |
| Outstanding supplier balances | ✅ | Definition in DATABASE_SCHEMA §2e |
| Purchase history | ✅ | Orders list, receipts per order and per supplier |
| Supplier returns (`supplier_return` movements) | ⬜ | Not implemented; use an approved stock adjustment meanwhile |
| Supplier invoices / credit notes, payment allocation to orders | ⬜ | Out of MVP scope (ADR-015) |
| Purchasing UI exercised with a signed-in user | ✅ | Order, place, partial receipt, over-receipt refused, supplier payment and balance — E2E |

## Milestone 6 — Reports, dashboard, mobile, PWA
🟡 Documented metrics, timezone-correct ranges, role dashboards and PWA installation done (see phase 3 above). Remaining: barcode scanning via camera (Permissions-Policy already allows `camera=(self)`), reports by location/cashier.

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

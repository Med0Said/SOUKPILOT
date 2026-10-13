# SoukPilot — Architecture

Status: Milestone 1 (foundation, auth, tenancy). Last updated 2026-10-13.

## 1. Overview

SoukPilot is a **modular monolith**: one Next.js application and one PostgreSQL
database (Supabase). No microservices, queues or separate API servers.

```
Browser (mobile / desktop)
   │  HTTPS, cookies (Supabase session, httpOnly active-org preference)
   ▼
Next.js 16 (App Router, Server Components, Server Actions)  ← src/
   │  proxy.ts: refreshes session, optimistic redirect for protected routes
   │  Server Actions: re-check session → Zod validation → call Supabase
   │  with the USER's JWT (publishable key) — never the service-role key
   ▼
Supabase
   ├─ Auth (GoTrue): sign-up, login, email confirmation, password reset
   ├─ PostgREST (Data API): exposes the `public` schema only
   └─ PostgreSQL 17
        ├─ RLS on every tenant-owned table          (who may see/touch a row)
        ├─ SECURITY DEFINER functions (`public.*`)   (multi-row business operations,
        │                                             one transaction each, audited)
        ├─ `private` schema                          (helpers not exposed by the API)
        └─ constraints / triggers                    (invariants that hold no matter
                                                      which code path writes)
```

### Where business logic lives

| Kind of rule | Lives in | Why |
| --- | --- | --- |
| Tenant isolation, role checks on rows | RLS policies | Enforced even if app code is wrong or bypassed via the Data API |
| Multi-row operations (create org, accept invitation; later: finalize sale, receive goods) | PostgreSQL functions | Atomic: one transaction, row locks, all-or-nothing |
| Invariants (last owner, non-negative stock, unique document numbers, immutable audit) | Constraints / triggers | Cannot be bypassed by any client |
| Input shape and friendly messages | Zod schemas in `src/lib/validation` | Precise French messages before hitting the DB |
| Pure calculations (later: totals, discounts, margins) | `src/lib/domain/*` TypeScript **and** recomputed in SQL on finalize | UI previews in TS; the database recomputes and is the source of truth |
| What to show in the UI | `src/lib/auth/permissions.ts` | Display only — never a security boundary |

## 2. Source layout

```
src/
  proxy.ts                    Next 16 "proxy" (formerly middleware)
  app/
    (auth)/                   login, signup, forgot/reset password + actions
    auth/confirm/route.ts     email link landing (token_hash + PKCE code)
    onboarding/               create the first organization
    invitations/              invitee accepts/declines invitations
    app/                      authenticated shell (dashboard, settings, profile)
    _actions/                 server actions (organizations, members, invitations, profile)
  components/ui/              small accessible primitives (Button, fields, Card, Alert)
  i18n/                       French dictionary + locale/direction config
  lib/
    domain/                   pure business logic: money (millimes), CSV, catalog rules, import analyzer
    security/                 CSP builder
    auth/                     session (DAL), active organization, permissions, routes
    supabase/                 server / proxy clients, database types
    validation/               Zod schemas
    errors.ts, logger.ts, format.ts, env.ts
supabase/
  migrations/                 version-controlled SQL (applied in filename order)
  seed.sql                    development-only demo data
  templates/                  French auth email templates
tests/db/                     RLS / tenancy tests against the real migrations (PGlite)
docs/                         this documentation
```

## 3. Key decisions (ADRs)

### ADR-001 Supabase (Auth + Postgres + RLS) with a modular monolith
*Decision*: Next.js + Supabase, no separate backend service.
*Why*: smallest operational footprint for a 1–2 person team; Postgres gives
transactions, constraints and RLS, which are exactly the correctness tools an
inventory/payments product needs.
*Trade-off*: business operations are written in PL/pgSQL (harder to unit test
than TypeScript). Mitigated by running the real migrations in tests (ADR-004).

### ADR-002 Writes that span several rows go through SQL functions, not app code
*Decision*: e.g. `create_organization`, later `finalize_sale`, `receive_purchase`.
*Why*: Supabase's Data API cannot run a multi-statement transaction from the
client; doing it in Next.js would require the service-role key and lose RLS.
*Rules*: `SECURITY DEFINER`, `set search_path = ''`, fully qualified names,
authorize from `auth.uid()` + `organization_members` inside the function,
`EXECUTE` revoked from `PUBLIC`/`anon`, stable error keys (`forbidden`, …).

### ADR-003 Cache Components disabled
*Decision*: `cacheComponents: false` in `next.config.ts` (Next 16 scaffolds it on).
*Why*: almost every page is per-tenant, per-user data; static shells bring little
and server-side caching adds a risk of serving one tenant's data to another.
Request-time rendering is simpler to reason about.
*Revisit*: for public marketing pages, or if dashboard latency becomes a problem.

### ADR-004 Database tests on PGlite and on a real PostgreSQL server, with a Supabase shim
*Decision*: `tests/db/*` create the Supabase API roles + `auth.uid()`
(tests/db/supabase-shim.sql), apply every migration, and run queries as
`authenticated`/`anon` with JWT claims set — exactly what PostgREST does.
Two interchangeable backends (tests/db/harness.ts):
- `npm run test:db` — embedded PostgreSQL 17 (PGlite), ~3 s, no services;
- `npm run test:db:pg` — a real PostgreSQL server (throwaway local cluster or
  `TEST_DATABASE_URL`), one fresh database per test file; required for
  **concurrency tests** (several connections), which are skipped on PGlite.
*Why*: Docker (needed for `supabase start`) is not available on every developer machine.
*Limits*: does not exercise GoTrue, PostgREST HTTP or hosted-Supabase-specific
grants. Before the pilot, run the suite once against a real Supabase stack
(local `supabase start` or a staging project) — tracked in the roadmap.

### ADR-005 Money as integer millimes; quantities as integers (planned, M2–M4)
*Decision*: all amounts `bigint` in millimes (1 TND = 1000 millimes). No
floating point anywhere in the money path. Quantities are integer units in the
MVP (clothing, cosmetics, general goods are sold by the piece).
*Rounding*: line totals are computed in integers; percentage discounts round
half away from zero to the millime, applied per line; documented and tested in M4.

### ADR-006 Stock = append-only ledger + locked balance table (implemented, M3)
`stock_movements` is the source of truth; `stock_levels` is a per (location,
variant) balance updated by a single function (`private.apply_stock_lines`) in
the same transaction, under row locks taken in a fixed order, with
`CHECK (quantity >= 0)`. `check_stock_reconciliation` proves
`stock_levels = SUM(stock_movements)`. See docs/DATABASE_SCHEMA.md §2c.
*Why a balance table and not only SUM()*: it gives a row to lock (no
overselling under concurrency) and O(1) stock lookups on mobile.
*Testing note*: a naive "two requests at once" test did not catch a removed
lock; the tests now hold the first transaction open (`pg_sleep`) so the overlap
is guaranteed. Mutation-checked: removing serialization makes them fail.

### ADR-013 Adjustments need approval; counts are blind and snapshot per item
*Decision*: any member can propose an adjustment or count items; only
owner/manager apply them. Counters do not see the book quantity. Each counted
item stores the book quantity *at the moment it is counted*; approval applies
`counted − expected`, so sales/receipts after counting are preserved, and
uncounted items are never zeroed.
*Trade-off*: if goods move between the physical count and the entry of that
item, the difference is attributed to the count. Shops should enter counts as
they go (mobile sheet) — documented in the UI.

### ADR-007 Active organization is a cookie *preference*, re-validated on every request
The `sp_active_org` cookie (httpOnly, SameSite=Lax) only selects among the
user's memberships; it is never used as an authorization input.

### ADR-008 UI components: small in-house primitives for M1
Native `<input>`, `<select>`, `<button>` with labels, `aria-invalid`,
`aria-describedby`, 44 px touch targets. When dialogs/menus/comboboxes are
needed (M2+), adopt Radix-based primitives (shadcn/ui) rather than hand-rolling
focus management.

### ADR-010 Purchase cost in its own table
*Decision*: `product_variant_costs` (1:1 with variants) instead of a cost column.
*Why*: RLS is row-level; the only robust way to hide costs (and therefore
margins) from cashiers while letting them read prices is a separate table with
an owner/manager policy. Odoo makes the same distinction (cost visible to
internal users only). Sale finalization (M4, definer function) will snapshot
the cost per sale line.

### ADR-011 Nonce-based CSP with request-time rendering
*Decision*: the proxy generates a nonce per request and sets a strict CSP;
the root layout calls `connection()` so every page renders per request and
Next.js attaches the nonce. Inline `style` attributes are not allowed.
*Trade-off*: no static prerendering, even for public pages — acceptable for an
app whose pages are almost all per-tenant anyway (consistent with ADR-003).

### ADR-012 CSV import = pure analyzer + staged batch + idempotent SQL commit
*Decision*: `src/lib/domain/catalog-import.ts` parses/validates/groups rows
without I/O (unit-tested); the server asks the DB for existing identifiers,
stages the validated payload (`stage_catalog_import`), and the user confirms;
`commit_catalog_import` locks the batch, re-applies every constraint and
commits all-or-nothing, once.
*Why*: preview without side effects, clear row-level errors, protection
against double submission and races, and the database stays the authority
even if someone calls the staging API with a crafted payload.

### ADR-009 French-first, RTL-ready
Strings live in `src/i18n/fr.ts`; layout uses logical properties
(`ms-`, `pe-`, `border-e`, `text-start`) so Arabic can be enabled by switching
`dir`. Arabic is **not** supported until every screen is translated and tested.

## 4. Request lifecycle (authenticated page)

1. `src/proxy.ts` → `updateSession()` refreshes Supabase cookies, verifies the
   JWT with `getClaims()`, redirects anonymous users away from protected prefixes.
2. Page (Server Component) → `requireOrgContext()` → `getCurrentUser()`
   (verified claims) → memberships via RLS → active membership.
3. Data reads use the user-scoped Supabase client → RLS filters by membership.
4. Mutations are Server Actions: re-check session, Zod-validate, call
   RPC/table with the user's JWT, map error keys to French.

## 5. What is intentionally not here (yet)

- No service-role key usage, no admin panel.
- No background jobs or webhooks.
- No offline mode (see PRODUCT_SPEC: not claimed until sync + conflict handling exist).
- No payment-provider integration (abstraction planned for M7, provider TBD).

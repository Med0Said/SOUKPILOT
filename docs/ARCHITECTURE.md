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

### ADR-004 Database tests run on PGlite with a Supabase shim
*Decision*: `tests/db/*` boot an embedded PostgreSQL 17 (PGlite), create the
Supabase API roles + `auth.uid()` (tests/db/supabase-shim.sql), apply every
migration, and run queries as `authenticated`/`anon` with JWT claims set —
exactly what PostgREST does.
*Why*: Docker (needed for `supabase start`) is not available on every developer
machine; these tests run in ~2 s with no services.
*Limits*: does not exercise GoTrue, PostgREST HTTP or hosted-Supabase-specific
grants. Before the pilot, the same suite must also be run against a real
Supabase stack (local `supabase start` or a staging project) — tracked in the roadmap.

### ADR-005 Money as integer millimes; quantities as integers (planned, M2–M4)
*Decision*: all amounts `bigint` in millimes (1 TND = 1000 millimes). No
floating point anywhere in the money path. Quantities are integer units in the
MVP (clothing, cosmetics, general goods are sold by the piece).
*Rounding*: line totals are computed in integers; percentage discounts round
half away from zero to the millime, applied per line; documented and tested in M4.

### ADR-006 Stock = append-only ledger + locked balance table (planned, M3)
See docs/DATABASE_SCHEMA.md §4. `stock_movements` is the source of truth;
`stock_levels` is a per (location, variant) balance updated in the same
transaction under a row lock, with `CHECK (quantity >= 0)`. A reconciliation
query proves `stock_levels = SUM(stock_movements)`.

### ADR-007 Active organization is a cookie *preference*, re-validated on every request
The `sp_active_org` cookie (httpOnly, SameSite=Lax) only selects among the
user's memberships; it is never used as an authorization input.

### ADR-008 UI components: small in-house primitives for M1
Native `<input>`, `<select>`, `<button>` with labels, `aria-invalid`,
`aria-describedby`, 44 px touch targets. When dialogs/menus/comboboxes are
needed (M2+), adopt Radix-based primitives (shadcn/ui) rather than hand-rolling
focus management.

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

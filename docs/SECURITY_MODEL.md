# SoukPilot — Security Model

Last updated 2026-10-13 (Milestone 1).

## 1. Threat model (summary)

| Actor | Goal | Primary controls |
| --- | --- | --- |
| Anonymous internet user | Read/modify any tenant data | `anon` has **no** table grants and no function `EXECUTE`; RLS on all tables |
| Signed-in user of tenant A | Read/modify tenant B data | RLS via `organization_members` for `auth.uid()`; functions re-check membership; composite FKs (later) |
| Cashier | Escalate to manager/owner, read audit or other members' emails | Membership writes only via owner-only functions; column-level grants; role checks in policies |
| Owner | Corrupt history (later: delete sales, edit ledger) | Append-only tables, no `DELETE` grants, reversal documents, immutable audit trigger |
| Attacker with a stolen session | Long-lived access | Short JWT expiry (1 h), refresh rotation (Supabase), sign-out, password reset |
| Insider with service-role key | Everything | Key never used by the app in M1; kept out of client bundles; rotation procedure |

## 2. Authentication

- Supabase Auth, email + password. Email confirmation **required**
  (`enable_confirmations = true`).
- Passwords: min 10 chars, letters + digits (enforced by Supabase Auth config
  **and** Zod). Max 72 (bcrypt limit).
- `secure_password_change = true`: changing a password requires a recent login.
- Email links use the `token_hash` flow (`/auth/confirm`), so they work when
  opened on a different device than the one that signed up.
- No account enumeration in the UI: sign-up and "forgot password" always show
  the same success message.
- The server verifies identity with `supabase.auth.getClaims()` (JWT signature
  verification), never with `getSession()` alone.
- Session cookies are managed by `@supabase/ssr`; responses that set auth
  cookies carry `Cache-Control: private, no-store` (library behaviour).
- **Production must configure** in the Supabase dashboard: Site URL, redirect
  allow-list (`https://<domain>/auth/confirm`), custom SMTP (the built-in sender
  is heavily rate-limited and not meant for production), the French email
  templates from `supabase/templates/`, and CAPTCHA on sign-up if abuse appears.

## 3. Authorization layers

1. **Proxy** (`src/proxy.ts`): optimistic redirect only. Not a security boundary.
2. **Server Actions / pages**: re-read the session, resolve membership for the
   *client-supplied* organization id against the caller's own memberships
   (`membershipFor()`), check role for UX.
3. **PostgreSQL (authoritative)**:
   - RLS enabled on every table in `public` (a test fails if one is not).
   - Explicit `GRANT`s: `anon` nothing; `authenticated` only the verbs and
     **columns** it needs (e.g. owners can update `organizations(name, timezone,
     default_locale)` but not `currency_code`/`created_by`).
   - Membership changes, invitations and organization creation only through
     `SECURITY DEFINER` functions that authorize from `auth.uid()`.

### Role matrix (Milestone 1)

| Capability | Owner | Manager | Cashier |
| --- | :-: | :-: | :-: |
| Read organization, co-members, locations | ✓ | ✓ | ✓ |
| Edit organization settings | ✓ | – | – |
| Create / edit locations | ✓ | ✓ | – |
| Change member roles, remove members | ✓ | – | – |
| Invite managers | ✓ | – | – |
| Invite cashiers | ✓ | ✓ | – |
| See members' emails | ✓ | ✓ | own only |
| Read invitations & audit log | ✓ | ✓ | – |
| Leave organization | ✓ (if not last owner) | ✓ | ✓ |
| Browse catalog (products, variants, prices, categories) | ✓ | ✓ | ✓ |
| Create/edit products, variants, categories; import CSV | ✓ | ✓ | – |
| See purchase costs | ✓ | ✓ | – |
| Suppliers (read and write) | ✓ | ✓ | – |
| See stock quantities and movement history | ✓ | ✓ | ✓ |
| Receive stock, record opening stock (with costs), transfer | ✓ | ✓ | – |
| Propose adjustments, enter stock counts | ✓ | ✓ | ✓ |
| Approve adjustments and counts, start/cancel counts | ✓ | ✓ | – |
| Stock valuation, reconciliation check | ✓ | ✓ | – |

Invariants: nobody changes their own role; owners cannot be invited (only
promoted by an owner); an organization always keeps ≥ 1 owner (trigger).

### RLS helper functions

`private.is_org_member(org)`, `private.has_org_role(org, roles[])`,
`private.shares_org_with(user)` are `SECURITY DEFINER` (to avoid recursive RLS
on `organization_members`) and only answer questions about the **calling**
user. The `private` schema is not exposed by PostgREST.

### Invitations

No email is sent by the app. An owner/manager creates an invitation for an
email address; the invitee signs up / signs in **with that exact address**,
which must be **confirmed** (`auth.users.email_confirmed_at`, read from the
database — not from JWT claims), then accepts on `/invitations`.
Expired, revoked or already-answered invitations are rejected; a mismatched
email gets "not found" (ids cannot be probed).

## 4. Audit log

`public.audit_logs` is append-only: no `INSERT/UPDATE/DELETE` grants for API
roles, `UPDATE` blocked by trigger for everyone, writes only through
`private.write_audit()` from definer functions/triggers. Events in M1:
`organization.created|updated`, `location.created|updated`,
`member.role_changed|removed|left`, `invitation.created|revoked|accepted|declined`.
Never put secrets or card data in `details`.

## 5. Secrets

- Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `NEXT_PUBLIC_SITE_URL` are used. The publishable key is designed to be
  public; RLS protects data.
- The service/secret key is **not used** in M1. If ever needed, it must only be
  read in files that `import "server-only"`, never with a `NEXT_PUBLIC_` prefix.
- `.env*` files are git-ignored (except `.env.example`).

## 6. Web hardening

Static headers (next.config.ts): `X-Frame-Options: DENY`, `nosniff`,
`Referrer-Policy`, `Permissions-Policy`, HSTS in production, no `X-Powered-By`.

**Content-Security-Policy** (src/lib/security/csp.ts, set per request in
src/proxy.ts): `script-src 'self' 'nonce-…' 'strict-dynamic'` (no
`unsafe-inline`; `unsafe-eval` in development only), `style-src 'self'
'nonce-…'`, `connect-src 'self' <supabase url>`, `object-src 'none'`,
`base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`,
`upgrade-insecure-requests` on HTTPS sites. Every page renders per request
(`connection()` in the root layout) so Next.js can attach the nonce. Rule for
developers: **no inline `style` attributes** (blocked by the policy) — use
classes. Verified on a production build in a browser: hydration works, no
console violations.

Post-login redirects are sanitized (`safeNextPath`, unit-tested against
open-redirect payloads). Server Actions are POST-only with Next.js origin
checks; their body limit is 3 MB (CSV import).

CSV: the downloadable template is generated with formula-injection escaping
(`=`, `+`, `-`, `@` prefixed with `'`); imported text is stored as plain text.

## 7. Rate limiting

- Auth endpoints: Supabase Auth built-in limits (`[auth.rate_limit]` locally,
  dashboard settings in production).
- Organization creation: max 5 organizations created per account (DB-enforced,
  serialized with an advisory lock).
- Invitations: 30 per organization per hour; CSV import staging: 30 per
  organization per hour. Enforced **in the database** (`private.enforce_rate_limit`),
  so they hold for direct Data API calls and on serverless hosts.
- Not rate-limited yet: ordinary form saves (products, categories…) — they are
  authenticated, tenant-scoped and cheap; revisit if abuse appears.

## 8. Logging & privacy

`src/lib/logger.ts` writes JSON lines, identifies users by id, and redacts keys
that look like passwords, tokens, cookies, card data, emails or phone numbers.
Unknown database error messages are logged server-side but never shown to the
user (generic French message instead).

## 9. How to verify tenant isolation locally

```bash
npm run test:db      # embedded PostgreSQL (PGlite), no services
npm run test:db:pg   # same suite on a real PostgreSQL server (adds concurrency tests)
```

`test:db:pg` starts a throwaway local cluster with the PostgreSQL binaries on
`PATH` (or `PG_BIN`, e.g. `C:\Program Files\PostgreSQL\17\bin`), or uses
`TEST_DATABASE_URL` if set. `tests/db/catalog.test.ts` covers the catalog:
cashiers never read costs, other tenants see nothing, no cross-tenant
category/product references, audited price changes, search isolation, import
authorization and idempotency (two simultaneous commits → exactly one import).
`tests/db/inventory.test.ts` covers the stock ledger: role rules, cross-tenant
refusal (even with the attacker's own organization id), immutability, no
negative stock, idempotent documents, and — on a real server — forced
concurrent withdrawals, duplicate receipts, duplicate opening stock and
opposite transfers.

`tests/db/tenant-isolation.test.ts` builds two organizations (owner, manager,
cashier in A; owner in B; plus an outsider) and checks, through the
`authenticated`/`anon` roles with RLS active:
cross-tenant reads return nothing; cross-tenant updates/inserts are refused;
membership cannot be self-granted; no self-promotion; last-owner protection;
audit log immutability; invitation email/confirmation/expiry rules; anon has
no access at all. `tests/db/migrations.test.ts` fails if any `public` table
lacks RLS, if `anon` has any grant, or if a `SECURITY DEFINER` function lacks
`search_path = ''`.

Mutation check performed during M1: replacing the organizations SELECT policy
with `using (true)` and widening the UPDATE grant made 4 tests fail, as expected.

Manual check against a real stack (requires Docker):
`npx supabase start`, `npx supabase db reset`, sign in as two seed users in two
browsers, and try to open the other tenant's data through the API, e.g.
`curl "$SUPABASE_URL/rest/v1/organizations" -H "apikey: $KEY" -H "Authorization: Bearer <user A JWT>"`
— only tenant A must be returned.

## 10. Release-blocking rule

Any failure of a tenant-isolation test, any table without RLS, or any client
path that uses the service-role key blocks release.

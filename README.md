# SoukPilot

Retail management SaaS for independent Tunisian shops: products, stock,
purchases, sales and margins on phone or computer. French-first, TND.

**Status: Milestone 5 of 8** (M1: authentication, organizations, roles,
tenant isolation; M2: catalog — products, variants, categories, suppliers,
locations, search, CSV import; M3: inventory — stock ledger, receipts, opening
stock, adjustments with approval, stock counts, transfers, low stock,
valuation; M4: sales — cart, discounts, payments, credit, returns, receipts,
customers, daily summary; M5: purchasing — purchase orders, receipts against
orders, supplier payments and balances). Not production-ready. See
[docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md) for exactly what is
implemented, partial and not started.

## Stack

Next.js 16 (App Router, TypeScript strict) · Tailwind CSS 4 · Supabase (Auth,
PostgreSQL 17, Row Level Security) · Zod · Vitest + PGlite.

## Prerequisites

- Node.js ≥ 22.12 and npm
- For the full local backend: Docker (required by `supabase start`)
- The database test suite does **not** need Docker (embedded PostgreSQL)
- Optional: PostgreSQL 17 binaries for `npm run test:db:pg` (real-server tests, incl. concurrency)

## Local setup

```bash
npm install
cp .env.example .env.local
```

### Option A — local Supabase (Docker)

```bash
npm run db:start      # starts Postgres, Auth, Mailpit…; prints URL + publishable key
npm run db:migrate    # applies new migrations, keeps your local data
# or: npm run db:reset  # wipes the local database, re-applies migrations + supabase/seed.sql
```

Put the printed API URL and publishable key into `.env.local`, then `npm run dev`
and open http://localhost:3000. Confirmation/reset emails arrive in Mailpit at
http://127.0.0.1:54324. Seed accounts are listed at the top of
`supabase/seed.sql` (development only; the seed has not yet been run — see the note there).

### Option B — a Supabase cloud project (no Docker)

Create a project, apply migrations (`npx supabase link` then `npx supabase db push`),
configure Auth as in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), and put its URL and
publishable key in `.env.local`.

## Environment variables

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (or legacy anon) key — public by design; RLS protects data |
| `NEXT_PUBLIC_SITE_URL` | Base URL used in email links |

No secret/service-role key is used by the app.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:unit` | Unit tests (`src/**/*.test.ts`) |
| `npm run test:db` | RLS / tenancy / catalog tests on the real migrations (PGlite, no Docker) |
| `npm run test:db:pg` | Same suite on a real PostgreSQL server + concurrency tests (set `PG_BIN` or `TEST_DATABASE_URL`) |
| `npm test` | All tests |
| `npm run check` | lint + typecheck + all tests |
| `npm run db:start` / `db:stop` / `db:reset` | Local Supabase stack (Docker); `db:reset` wipes local data |
| `npm run db:migrate` | Apply pending migrations to the local stack without wiping data |
| `npm run db:types` | Regenerate `src/lib/supabase/database.generated.ts` from the local stack. `npm run typecheck` then verifies the hand-written `database.types.ts` against it (`database.types.check.ts`) |
| `npm run test:e2e` | Playwright end-to-end tests against the local Supabase stack (needs `db:start`; builds the app into `.next-e2e` and serves it on port 3100) |

End-to-end tests create fresh, uniquely named accounts and organizations on
every run and read confirmation emails from the local Mailpit; they never
delete data. To run the database suite against Supabase's own PostgreSQL:
`TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:db`
(each test file creates and drops its own temporary database).

## Migrations

SQL files in `supabase/migrations/`, applied in filename order. Create new ones
with `npx supabase migration new <name>`; never modify a migration already
applied to a shared environment. See [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md).

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and
[docs/BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md).

## Known limitations

- End-to-end tests cover authentication, the main sale/stock/return/purchasing
  workflow, invitations, cashier restrictions and tenant isolation; screens
  such as CSV import, stock counts, transfers and adjustments approval are
  covered by database tests but not yet by browser tests.
- `supabase/seed.sql` has still not been executed (the local database used for
  verification already contained data, so it was not reset).
- No cash sessions/expenses or cross-period reports yet (Milestone 6+); no
  supplier returns or supplier invoices.
- Invitations do not send emails; the inviter gets a ready-to-send message.
- No product images; search is not accent-insensitive; CSV import creates new
  products only (never updates existing ones).
- French only; Arabic/RTL prepared but not supported. No offline mode.
- No fiscal/legal compliance of any document is claimed.

## Documentation

[Product spec](docs/PRODUCT_SPEC.md) · [Architecture](docs/ARCHITECTURE.md) ·
[Database schema](docs/DATABASE_SCHEMA.md) · [Security model](docs/SECURITY_MODEL.md) ·
[Odoo research](docs/ODOO_WORKFLOW_RESEARCH.md) · [Roadmap](docs/DEVELOPMENT_ROADMAP.md) ·
[Deployment](docs/DEPLOYMENT.md) · [Backup & restore](docs/BACKUP_AND_RESTORE.md)

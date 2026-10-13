# SoukPilot

Retail management SaaS for independent Tunisian shops: products, stock,
purchases, sales and margins on phone or computer. French-first, TND.

**Status: Milestone 2 of 8** (Milestone 1: authentication, organizations,
roles, tenant isolation; Milestone 2: catalog — products, variants,
categories, suppliers, locations, search, CSV import). Not production-ready. See
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
npm run db:reset      # applies supabase/migrations + supabase/seed.sql
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
| `npm run db:start` / `db:stop` / `db:reset` | Local Supabase stack (Docker) |
| `npm run db:types` | Generate DB types from the local stack into `src/lib/supabase/database.generated.ts` (compare with the hand-written `database.types.ts`) |

End-to-end tests (Playwright) are not set up yet: they need a running Supabase Auth to sign in (Docker or a Supabase project).

## Migrations

SQL files in `supabase/migrations/`, applied in filename order. Create new ones
with `npx supabase migration new <name>`; never modify a migration already
applied to a shared environment. See [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md).

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and
[docs/BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md).

## Known limitations

- Auth flows and the signed-in UI have not yet been exercised end-to-end
  against a running Supabase Auth server (needs Docker or a Supabase project);
  database logic is tested on PGlite and on a real PostgreSQL 17 server with a
  Supabase shim (see ADR-004).
- No stock, sales, purchases or reports yet (Milestones 3–6).
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

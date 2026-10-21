# Constraints

The quality bar of SoukPilot, with numbers. Every agent and every person reads
this before writing code. It is never weakened to make a change pass: a change
that cannot meet it is fixed, or goes through a tracked exception below.

Last reviewed: 2026-10-18 by @said0 (set up in modernization phase B).

## Floor (always enforced)

- No new suppression comments: `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable`, `istanbul ignore`, `v8 ignore`, `c8 ignore`
- No unimplemented stubs: `throw new Error("Not implemented")`, empty `catch {}`, `TODO` standing in for code
- No skipped or deleted tests, and no assertion removed from a test that stays
- No secrets in source (keys live in `.env.local`, never committed)
- Money stays integer millimes; stock moves only through the ledger functions; RLS on every tenant table (see docs/ARCHITECTURE.md)
- No new runtime dependency without the owner's approval
- The Content-Security-Policy is never weakened (no `unsafe-inline`, no inline `style` attributes)
- This file does not get weakened to make a change pass

Checked by `node scripts/constraints/floor-guard.mjs` (diff against `origin/master`; exit 1 blocks).
Two moves can be accepted, only with the owner's approval recorded as a commit
trailer: a new exception (`Constraints-Exception-Approved: E<n>`) and an
assertion changed because the expected behaviour changed
(`Constraints-Test-Change-Approved: <file>`). Skipped or deleted tests and
suppression comments can never be waved through.
The architecture rules in that list are reviewed by people; the guard catches the mechanical moves.

## Enforced with numbers

| Dimension | Rule | Checked by | Runs at |
| --- | --- | --- | --- |
| Floor | No floor violation in the diff | `node scripts/constraints/floor-guard.mjs` | `check:fast`, CI |
| Types | Zero type errors (includes the generated-vs-hand-written DB type contract) | `npm run typecheck` | `check:fast`, CI |
| Lint | Zero errors and zero warnings | `npm run lint` | `check:fast`, CI |
| Unit + DB tests (PGlite) | All pass | `npm run test:coverage` | `check:task`, CI |
| DB tests on PostgreSQL | All pass on a real server (Supabase's Postgres locally, `postgres:17` in CI) | `npm run test:db:pg` | `check:full`, CI |
| Coverage `src/lib` | lines ≥ 89 %, statements ≥ 87 %, branches ≥ 82 %, functions ≥ 80 % | `vitest` thresholds (`vitest.config.mts`) | `check:task`, CI |
| Coverage `src/lib/domain` (money, pricing, stock, reports, exports) | lines ≥ 94 %, statements ≥ 92 %, branches ≥ 84 %, functions ≥ 87 % | `vitest` thresholds | `check:task`, CI |
| SQL function coverage | Every `public` SQL function is called by at least one DB test | `node scripts/constraints/sql-coverage.mjs` | `check:task`, CI |
| Unused UI strings | Every string in `src/i18n/fr.ts` and `src/i18n/fr-errors.ts` is read by the app (a map read by a dynamic key counts as a whole) | `node scripts/constraints/i18n-unused.mjs` | `check:task`, CI |
| E2E | All pass, against a production build and a real Supabase stack | `npm run test:e2e` | `check:full`, CI |
| CSP / console guard | Every E2E spec uses the guarded `test` from `e2e/fixtures.ts` (fails on any console error, page exception or CSP violation) | `node scripts/constraints/e2e-guard.mjs` | `check:task`, CI |
| Accessibility (WCAG 2.2 AA signals) | Zero contrast, name, heading, landmark, duplicate-id, lang and focus-indicator issues on login, dashboard, cart, stock, catalog, reports and palette in light/dark, desktop/phone; no horizontal scroll at 320 px; targets ≥ 24 px | `e2e/accessibility.spec.ts` | `check:full`, CI |
| Client JavaScript | Total ≤ 352 000 B gzip (each chunk gzipped as served), largest chunk ≤ 75 000 B | `node scripts/constraints/bundle-budget.mjs .next-e2e` | `check:full`, CI |
| Production dependencies | No known vulnerability at high or above | `npm audit --omit=dev --audit-level=high` | `check:full`, CI |

### Why these numbers

- **Coverage thresholds** are a ratchet: what the code measured on 2026-10-18
  (`src/lib` 89.6 / 88.0 / 82.7 / 81.4 %, `src/lib/domain` 95.0 / 92.5 / 84.7 / 87.5 %)
  minus 0.5 point, rounded down. Raise them when coverage rises; never lower them.
- **SQL coverage** is a proxy: PL/pgSQL line coverage has no tool that runs on
  both PGlite and Supabase. Business rules live in SQL, so no public function
  ships without a test that executes it.
- **Bundle**: 344 676 B measured on 2026-10-18, plus 2 % headroom. The largest
  chunk is React DOM (71 809 B).
- **Accessibility**: computed from the rendered page with the WCAG formulas (no
  extra dependency); this is the external opinion in the bar — it does not
  depend on our own tests agreeing with our code. A screen-reader pass by a
  person is still needed before a release.
- **Audit level high** for production dependencies; dev-only findings are
  tracked below until fixed.

## Measured, not yet enforced

| Metric | Today (2026-10-18) | Direction | How measured |
| --- | --- | --- | --- |
| `report_sales_by_day`, 365 days, 50k sales | 92 ms (was 15 000 ms, fixed P1) | must not exceed 200 ms | synthetic `sp_perf` database (10k articles, 50k sales), median of 5 |
| Sales list page 1 under RLS (50k sales) | 54 ms (was 365 ms, fixed P2) | must not exceed 120 ms | same |
| `search_products` text search, 10k articles | 216 ms (was 444 ms) | must fall (finding P3) | same |
| Movements page with exact count, 100k movements | 30 ms (was 517 ms, fixed P2) | must not exceed 100 ms | same |
| E2E suite duration | ≈ 85 s (26 tests) | must not double | `npm run test:e2e` |
| Dev-dependency vulnerabilities | 5 high (one chain) | must reach 0 | `npm audit --audit-level=high` |

## Lifecycle

| Stage | Command | Budget |
| --- | --- | --- |
| After an edit | `npm run check:fast` | < 60 s |
| Before handing work back | `npm run check:task` | < 90 s |
| Before merge / in CI | `npm run check:full` (needs `npx supabase start`) | minutes |

## Exceptions

Each exception names its owner and an expiry date; an expired exception fails its check.

| ID | Rule | Path | Reason | Owner | Expires |
| --- | --- | --- | --- | --- | --- |
| E4 | npm audit (dev) | `eslint-config-next@16.4.0` → `braces` | Lint toolchain only, never shipped; fixed by the patch update (finding T7) in phase C | @said0 | 2026-11-30 |

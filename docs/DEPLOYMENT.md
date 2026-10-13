# SoukPilot — Deployment Guide

Last updated 2026-10-13. Nothing has been deployed yet.

## Recommended setup (simplest maintainable)

- **App**: a managed Next.js host (e.g. Vercel, or any Node 22 host running
  `npm run build && npm start`). Choose an EU region close to Tunisia and to the
  Supabase region.
- **Database/Auth**: a Supabase project in an EU region.

> Free and low-cost tiers change often. **Before choosing a plan, verify on the
> providers' current pricing/terms pages**: whether commercial use is allowed on
> the free tier, project pausing after inactivity, database size and egress
> limits, automatic backup availability and retention, point-in-time recovery,
> email sending limits, and data-location options. A paying-customer pilot
> should not depend on a tier that pauses projects or has no backups.

## Environment variables

See `.env.example`. Production values:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | project publishable key |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` |

No secret key is needed by Milestone 1.

## Supabase project configuration (dashboard)

1. Auth → URL configuration: Site URL = `https://<domain>`; redirect URLs =
   `https://<domain>/auth/confirm`.
2. Auth → Providers → Email: confirmations **on**, secure password change **on**,
   minimum length 10, "letters and digits".
3. Auth → Email templates: paste `supabase/templates/confirmation.html` and
   `recovery.html` (French, token_hash links).
4. Auth → SMTP: configure a real SMTP provider (built-in email is rate-limited
   and for testing only).
5. API → exposed schemas: `public` only (the `private` schema must not be exposed).

## Applying migrations

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --dry-run   # review
npx supabase db push
```

Never run `supabase/seed.sql` in production.

## Production checklist

- [ ] `npm run check` and `npm run build` pass on the release commit.
- [ ] DB test suite passed (PGlite) **and** run once against staging.
- [ ] Migrations reviewed; `db push --dry-run` output checked.
- [ ] Backups enabled and a restore tested (docs/BACKUP_AND_RESTORE.md).
- [ ] Auth URLs, SMTP, templates configured; confirmations on.
- [ ] No secret key in client bundles (`grep -r "service_role\|sb_secret" .next/static` returns nothing).
- [ ] HTTPS only; HSTS header present.
- [ ] Error monitoring/log access configured (see below).

## Failed migration procedure

1. Supabase runs each migration file in a transaction: a failing file is rolled
   back and later files are not applied. Check `supabase migration list`.
2. Do not edit the failed file if it was partially applied elsewhere; fix forward
   with a new migration, test it on a fresh local DB (`npm run test:db`) and on
   staging, then push again.
3. If a successful migration caused a bug: write a corrective migration; restore
   from backup only if data was corrupted (see BACKUP_AND_RESTORE.md).

## Observability

- Server logs: JSON lines from `src/lib/logger.ts` in the host's log viewer.
- Database/Auth logs: Supabase dashboard (Logs Explorer).
- Error reporting service: not yet chosen; if added, scrub request bodies,
  cookies and headers before sending.
- Health check: planned (`/api/health` checking DB reachability) in M7.

## Investigating an incorrect stock balance (from M3)

1. Run the reconciliation query (stock_levels vs. SUM(stock_movements)) for the
   variant/location.
2. List movements by `created_at` with `source_type/source_id` and `actor_id`;
   compare with the documents (sales, receipts, counts).
3. Check `audit_logs` for adjustments/approvals around the time of drift.
4. Correct only with an explicit `adjustment` movement with a reason — never by
   editing the ledger.

# SoukPilot — Deployment Guide

Last updated 2026-10-13. Nothing has been deployed yet.

## Recommended setup (simplest maintainable)

- **App**: a managed Next.js host (e.g. Vercel, or any Node 22 host running
  `npm run build && npm start`). Choose an EU region close to Tunisia and to the
  Supabase region.
- **Database/Auth**: a Supabase project in an EU region.

### Plan terms (verified 2026-10-13 — re-check before deploying)

| Provider / plan | Relevant terms (from the providers' own pages) | Fit |
| --- | --- | --- |
| Supabase **Free** | $0; 500 MB database per project; 5 GB egress; 50,000 MAU; **projects paused after 1 week of inactivity**; **no backups**; 2 active projects | Development / demos only |
| Supabase **Pro** | from $25/month; 8 GB disk per project; 250 GB egress; 100,000 MAU; never paused; **daily backups kept 7 days**; PITR is a paid add-on ($100/month per 7 days) | Minimum for paying pilots |
| Vercel **Hobby** | Free; **"restricts users to non-commercial, personal use only"** (fair-use guidelines) | Not allowed for a paid SaaS |
| Vercel **Pro** | $20 per developer seat/month + usage | Suitable; or any Node 22 host |

Sources: https://supabase.com/pricing, https://vercel.com/docs/plans/hobby.
Consequences: a paid pilot needs Supabase Pro (backups, no pausing) and a
commercial-use app host; even with Pro, keep the independent logical backups
in docs/BACKUP_AND_RESTORE.md (7-day retention is short).

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

## Investigating a sale whose totals look wrong

Run `select * from public.check_sales_consistency('<org id>')` (owner/manager).
Any row names a sale whose stored totals disagree with its lines, payments,
returns or stock movements. Finalized sales are never edited: correct with a
return or a refund, and treat a non-empty result as a critical defect.

## Investigating an incorrect stock balance

1. As owner/manager, run `select * from public.check_stock_reconciliation('<org id>')`
   (or in SQL as the database owner). It must return no rows; any row means the
   balance and the ledger disagree for that (location, variant) — treat as a
   critical defect and keep the evidence (do not "fix" the balance by hand).
2. List movements by `created_at` with `source_type/source_id` and `actor_id`;
   compare with the documents (sales, receipts, counts).
3. Check `audit_logs` for adjustments/approvals around the time of drift.
4. Correct only with an explicit `adjustment` movement with a reason — never by
   editing the ledger.

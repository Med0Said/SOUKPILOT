# SoukPilot — Backup and Restore

Last updated 2026-10-13. **Status: procedure documented, never executed.**
A restore drill is a Milestone 7 deliverable and a pilot prerequisite.

## What must be backed up

- PostgreSQL database (all schemas, including `auth` — users and identities).
- Storage buckets (from M2 if product images are added).
- Configuration that lives outside git: Supabase Auth settings, SMTP, env vars.
  Keep a private, up-to-date checklist of these.

Code, migrations and email templates are in git.

## Backups

1. **Provider backups**: enable Supabase automatic backups (and point-in-time
   recovery if the plan offers it). Verify current retention for the chosen plan.
2. **Independent logical backup** (do not rely only on the provider), e.g. daily:
   ```bash
   npx supabase db dump --db-url "$DB_URL" -f roles.sql --role-only
   npx supabase db dump --db-url "$DB_URL" -f schema.sql
   npx supabase db dump --db-url "$DB_URL" -f data.sql --use-copy --data-only
   ```
   Store encrypted (it contains customer personal data and password hashes),
   off-provider, with restricted access and a retention policy.
   `$DB_URL` is a secret: never commit it or paste it in tickets.

## Restore procedure (to a NEW project first)

1. Create a fresh Supabase project (never restore over production first).
2. Restore:
   ```bash
   psql "$NEW_DB_URL" -f roles.sql
   psql "$NEW_DB_URL" -f schema.sql
   psql "$NEW_DB_URL" -c "SET session_replication_role = replica" -f data.sql
   ```
3. Verify:
   - row counts per table vs. the source;
   - `select count(*) from public.organizations` and members per org;
   - RLS still enabled (`tests/db/migrations.test.ts` checks, or the catalog query in it);
   - (from M3) stock reconciliation query returns no differences;
   - sign in with a test account and check tenant isolation.
4. Point a staging app at it and smoke-test, then decide whether to switch production.

## Restore drill log

| Date | Backup used | Target | Result | Duration | Notes |
| --- | --- | --- | --- | --- | --- |
| — | — | — | not yet performed | — | — |

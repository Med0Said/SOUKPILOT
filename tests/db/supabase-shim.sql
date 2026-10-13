-- Minimal emulation of the Supabase platform objects that SoukPilot migrations
-- depend on, so the REAL migrations and RLS policies can be tested in an
-- embedded PostgreSQL (PGlite) without Docker.
--
-- Mirrors Supabase behaviour that matters for authorization:
--   * API roles anon / authenticated / service_role (service_role BYPASSRLS).
--   * auth.uid() / auth.jwt() read the JWT claims that PostgREST sets per request.
--   * Default privileges: Supabase grants ALL on public tables/functions to the
--     API roles, so our migrations must REVOKE explicitly. Reproduced here so
--     tests catch a missing REVOKE.
-- It is NOT a full Supabase: no GoTrue, no PostgREST, no storage.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email varchar(255) unique,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      auth.jwt() ->> 'sub'
    ),
    ''
  )::uuid
$$;

create function auth.role() returns text
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.jwt() ->> 'role')
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

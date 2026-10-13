-- SoukPilot — Migration 1/3: foundation
-- Schemas, enums, shared trigger helpers and the append-only audit log.
--
-- Conventions (see docs/DATABASE_SCHEMA.md):
--   * UUID primary keys (gen_random_uuid()).
--   * Every tenant-owned table carries organization_id and has RLS enabled.
--   * Business operations that touch several rows run in SECURITY DEFINER
--     functions with `set search_path = ''` and fully-qualified names.
--   * Errors raised to clients use a stable machine-readable message key
--     (e.g. 'forbidden'); the app maps keys to French messages.

-- ---------------------------------------------------------------------------
-- Private schema: helpers that must never be exposed through the Data API.
-- PostgREST only exposes `public` (see supabase/config.toml [api].schemas).
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
-- RLS policies call private.* helpers with the caller's privileges, so the
-- `authenticated` role needs USAGE (and EXECUTE on those specific helpers).
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'manager', 'cashier');
create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'revoked');

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function private.set_updated_at() from public;

create function private.validate_timezone()
returns trigger
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function private.validate_timezone() from public;

-- ---------------------------------------------------------------------------
-- Organizations (one row per business customer / tenant)
-- Created here because audit_logs references it.
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 2 and 120),
  -- MVP supports TND only. Amounts are stored as integer millimes (1 TND = 1000).
  currency_code text not null default 'TND' check (currency_code = 'TND'),
  timezone text not null default 'Africa/Tunis',
  default_locale text not null default 'fr' check (default_locale in ('fr', 'ar')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.organizations is 'Tenant: one business customer.';
create index organizations_created_by_idx on public.organizations (created_by);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger organizations_validate_timezone
  before insert or update of timezone on public.organizations
  for each row execute function private.validate_timezone();

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- Clients can read (owner/manager, via RLS) but never write: rows are only
-- inserted by SECURITY DEFINER functions/triggers through private.write_audit.
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null check (entity_type ~ '^[a-z_]+$'),
  entity_id uuid,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
comment on table public.audit_logs is 'Append-only audit trail of sensitive operations. Never store secrets or payment card data here.';
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (organization_id, entity_type, entity_id);

create function private.prevent_audit_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log_immutable' using errcode = '42501';
end;
$$;
revoke execute on function private.prevent_audit_update() from public;

create trigger audit_logs_immutable
  before update on public.audit_logs
  for each row execute function private.prevent_audit_update();

create function private.write_audit(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
set search_path = ''
as $$
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, details)
  values (p_organization_id, auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;
-- Not callable by API roles; only by SECURITY DEFINER code owned by postgres.
revoke execute on function private.write_audit(uuid, text, text, uuid, jsonb) from public;

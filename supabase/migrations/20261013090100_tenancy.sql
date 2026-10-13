-- SoukPilot — Migration 2/3: tenancy tables, RLS helpers and policies
--
-- Tenant isolation strategy (see docs/SECURITY_MODEL.md):
--   1. Every tenant-owned table has organization_id NOT NULL and RLS enabled.
--   2. Policies authorize through organization_members for auth.uid() only;
--      a client-supplied organization_id is never trusted on its own.
--   3. Membership rows are never written directly by clients; membership
--      changes go through audited SECURITY DEFINER functions (migration 3).
--   4. Explicit GRANTs: anon gets nothing; authenticated gets only the verbs
--      and columns it needs (defense in depth on top of RLS).

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (full_name = btrim(full_name) and char_length(full_name) <= 120),
  -- Free text: Tunisian and foreign formats vary; validated loosely in the app.
  phone text check (phone is null or char_length(phone) between 4 and 32),
  locale text not null default 'fr' check (locale in ('fr', 'ar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Organization members
-- ---------------------------------------------------------------------------
create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- RESTRICT: an auth user who is a member cannot be deleted silently; the
  -- membership must be removed first (keeps the "at least one owner" rule).
  user_id uuid not null references auth.users (id) on delete restrict,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);
create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function private.set_updated_at();

-- Invariant: an existing organization always keeps at least one owner.
create function private.ensure_owner_remains()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and exists (select 1 from public.organizations o where o.id = old.organization_id)
     and not exists (
       select 1 from public.organization_members m
       where m.organization_id = old.organization_id and m.role = 'owner'
     )
  then
    raise exception 'last_owner' using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke execute on function private.ensure_owner_remains() from public;

create trigger organization_members_owner_remains
  after update of role or delete on public.organization_members
  for each row execute function private.ensure_owner_remains();

-- ---------------------------------------------------------------------------
-- Locations (shops / stock locations). One default location is created with
-- the organization; multi-location limits are enforced by plan in M7.
-- ---------------------------------------------------------------------------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  code text check (code ~ '^[A-Z0-9_-]{1,12}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, code),
  -- Target for composite foreign keys (organization_id, location_id) in later
  -- tables, guaranteeing a row can never reference another tenant's location.
  unique (organization_id, id)
);
create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Invitations (no email is sent by the app; the inviter shares the link and
-- the invitee must sign up / sign in with the SAME confirmed email address).
-- ---------------------------------------------------------------------------
create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (
    email = lower(btrim(email))
    and char_length(email) <= 254
    and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  role public.org_role not null check (role <> 'owner'),
  status public.invitation_status not null default 'pending',
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  responded_by uuid references auth.users (id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'pending') = (responded_at is null))
);
create unique index organization_invitations_one_pending_idx
  on public.organization_invitations (organization_id, email)
  where status = 'pending';
create index organization_invitations_email_idx
  on public.organization_invitations (email)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- RLS helper functions.
-- SECURITY DEFINER so that policies on organization_members do not recurse.
-- They only ever reveal facts about the *calling* user (auth.uid()).
-- ---------------------------------------------------------------------------
create function private.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
  );
$$;

create function private.has_org_role(p_organization_id uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

create function private.shares_org_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  );
$$;

revoke execute on function private.is_org_member(uuid) from public;
revoke execute on function private.has_org_role(uuid, public.org_role[]) from public;
revoke execute on function private.shares_org_with(uuid) from public;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, public.org_role[]) to authenticated;
grant execute on function private.shares_org_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Audit triggers for direct (RLS-guarded) writes.
-- ---------------------------------------------------------------------------
create function private.audit_organization_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes jsonb := '{}'::jsonb;
begin
  if new.name is distinct from old.name then
    v_changes := v_changes || jsonb_build_object('name', jsonb_build_array(old.name, new.name));
  end if;
  if new.timezone is distinct from old.timezone then
    v_changes := v_changes || jsonb_build_object('timezone', jsonb_build_array(old.timezone, new.timezone));
  end if;
  if new.default_locale is distinct from old.default_locale then
    v_changes := v_changes || jsonb_build_object('default_locale', jsonb_build_array(old.default_locale, new.default_locale));
  end if;
  if v_changes <> '{}'::jsonb then
    perform private.write_audit(new.id, 'organization.updated', 'organization', new.id, v_changes);
  end if;
  return null;
end;
$$;
revoke execute on function private.audit_organization_update() from public;

create trigger organizations_audit_update
  after update on public.organizations
  for each row execute function private.audit_organization_update();

create function private.audit_location_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.write_audit(
    new.organization_id,
    case when tg_op = 'INSERT' then 'location.created' else 'location.updated' end,
    'location',
    new.id,
    jsonb_build_object('name', new.name, 'code', new.code, 'is_active', new.is_active)
  );
  return null;
end;
$$;
revoke execute on function private.audit_location_change() from public;

create trigger locations_audit_change
  after insert or update on public.locations
  for each row execute function private.audit_location_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.audit_logs enable row level security;

-- organizations: members read; owners update a whitelisted set of columns.
-- No INSERT/DELETE policy: creation goes through public.create_organization().
create policy organizations_select_member on public.organizations
  for select to authenticated
  using ((select private.is_org_member(id)));

create policy organizations_update_owner on public.organizations
  for update to authenticated
  using ((select private.has_org_role(id, array['owner']::public.org_role[])))
  with check ((select private.has_org_role(id, array['owner']::public.org_role[])));

-- organization_members: members see co-members. All writes via functions.
create policy organization_members_select_member on public.organization_members
  for select to authenticated
  using ((select private.is_org_member(organization_id)));

-- profiles: own profile, or profiles of users sharing an organization.
create policy profiles_select_self_or_colleague on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_org_with(id)));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- locations: members read; owner/manager create and update. No DELETE
-- (deactivate instead, history will reference locations).
create policy locations_select_member on public.locations
  for select to authenticated
  using ((select private.is_org_member(organization_id)));

create policy locations_insert_manager on public.locations
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));

create policy locations_update_manager on public.locations
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])))
  with check ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));

-- invitations: owner/manager of the org read them. Invitees use
-- public.list_my_invitations(). All writes via functions.
create policy organization_invitations_select_manager on public.organization_invitations
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));

-- audit_logs: owner/manager read. Never writable by API roles.
create policy audit_logs_select_manager on public.audit_logs
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));

-- ---------------------------------------------------------------------------
-- Table privileges (defense in depth; Supabase grants ALL by default).
-- ---------------------------------------------------------------------------
revoke all on public.organizations, public.organization_members, public.profiles,
  public.locations, public.organization_invitations, public.audit_logs
  from anon, authenticated;

grant select on public.organizations to authenticated;
grant update (name, timezone, default_locale) on public.organizations to authenticated;

grant select on public.organization_members to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone, locale) on public.profiles to authenticated;

grant select on public.locations to authenticated;
grant insert (organization_id, name, code, is_active) on public.locations to authenticated;
grant update (name, code, is_active) on public.locations to authenticated;

grant select on public.organization_invitations to authenticated;

grant select on public.audit_logs to authenticated;

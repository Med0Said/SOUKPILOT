-- SoukPilot — Migration 3/3: tenancy business operations
--
-- Each function is one transaction: it authorizes the caller from
-- auth.uid() + organization_members, validates input, writes, and audits.
-- Any exception rolls the whole operation back.
--
-- All functions: SECURITY DEFINER, `set search_path = ''`, EXECUTE revoked
-- from PUBLIC/anon and granted to authenticated only.

-- ---------------------------------------------------------------------------
-- Internal guard
-- ---------------------------------------------------------------------------
create function private.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;
revoke execute on function private.require_user() from public;

-- ---------------------------------------------------------------------------
-- create_organization: tenant + owner membership + default location + audit.
-- ---------------------------------------------------------------------------
create function public.create_organization(
  p_name text,
  p_timezone text default 'Africa/Tunis',
  p_location_name text default 'Boutique principale'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_name text := btrim(coalesce(p_name, ''));
  v_location_name text := btrim(coalesce(p_location_name, ''));
  v_org_id uuid;
  v_location_id uuid;
begin
  if char_length(v_name) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if char_length(v_location_name) not between 1 and 80 then
    raise exception 'invalid_location_name' using errcode = '22023';
  end if;

  -- Abuse guard: a single account cannot create unlimited tenants.
  -- Serialize per user so two concurrent calls cannot both pass the check.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('create_organization:' || v_uid::text, 0));
  if (select count(*) from public.organizations o where o.created_by = v_uid) >= 5 then
    raise exception 'organization_limit_reached' using errcode = '54000';
  end if;

  insert into public.organizations (name, timezone, created_by)
  values (v_name, coalesce(nullif(btrim(p_timezone), ''), 'Africa/Tunis'), v_uid)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, v_uid, 'owner');

  insert into public.locations (organization_id, name, code)
  values (v_org_id, v_location_name, 'MAIN')
  returning id into v_location_id;

  perform private.write_audit(v_org_id, 'organization.created', 'organization', v_org_id,
    jsonb_build_object('name', v_name, 'default_location_id', v_location_id));

  return v_org_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_organization_members: members + names; emails only for owner/manager.
-- ---------------------------------------------------------------------------
create function public.list_organization_members(p_organization_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role public.org_role,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_can_see_email boolean;
begin
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = v_uid
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_can_see_email := exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = v_uid
      and m.role in ('owner', 'manager')
  );

  return query
    select m.user_id,
           coalesce(p.full_name, ''),
           case when v_can_see_email or m.user_id = v_uid then u.email::text else null end,
           m.role,
           m.created_at
    from public.organization_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.organization_id = p_organization_id
    order by m.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_member_role: owners only; never on oneself; last owner protected
-- by the organization_members_owner_remains trigger.
-- ---------------------------------------------------------------------------
create function public.update_member_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_role public.org_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_old_role public.org_role;
begin
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = v_uid and m.role = 'owner'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'cannot_change_own_role' using errcode = '42501';
  end if;
  if p_role is null then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  select m.role into v_old_role
  from public.organization_members m
  where m.organization_id = p_organization_id and m.user_id = p_user_id
  for update;

  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if v_old_role = p_role then
    return;
  end if;

  update public.organization_members
  set role = p_role
  where organization_id = p_organization_id and user_id = p_user_id;

  perform private.write_audit(p_organization_id, 'member.role_changed', 'user', p_user_id,
    jsonb_build_object('from', v_old_role, 'to', p_role));
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_member: owners remove anyone; any member may leave. The last owner
-- can never be removed (trigger).
-- ---------------------------------------------------------------------------
create function public.remove_member(p_organization_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_old_role public.org_role;
begin
  if p_user_id <> v_uid and not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = v_uid and m.role = 'owner'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.organization_members
  where organization_id = p_organization_id and user_id = p_user_id
  returning role into v_old_role;

  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  perform private.write_audit(p_organization_id,
    case when p_user_id = v_uid then 'member.left' else 'member.removed' end,
    'user', p_user_id, jsonb_build_object('role', v_old_role));
end;
$$;

-- ---------------------------------------------------------------------------
-- create_invitation: owner invites manager/cashier; manager invites cashier.
-- ---------------------------------------------------------------------------
create function public.create_invitation(
  p_organization_id uuid,
  p_email text,
  p_role public.org_role
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_caller_role public.org_role;
  v_invitation_id uuid;
begin
  select m.role into v_caller_role
  from public.organization_members m
  where m.organization_id = p_organization_id and m.user_id = v_uid;

  if v_caller_role is null
     or v_caller_role = 'cashier'
     or (v_caller_role = 'manager' and p_role <> 'cashier')
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role is null or p_role = 'owner' then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.organization_members m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id and lower(u.email) = v_email
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  -- Expire stale pending invitations for this address so a new one can be issued.
  update public.organization_invitations
  set status = 'revoked', responded_at = now(), responded_by = v_uid
  where organization_id = p_organization_id and email = v_email
    and status = 'pending' and expires_at <= now();

  begin
    insert into public.organization_invitations (organization_id, email, role, invited_by)
    values (p_organization_id, v_email, p_role, v_uid)
    returning id into v_invitation_id;
  exception when unique_violation then
    raise exception 'invitation_exists' using errcode = '23505';
  end;

  perform private.write_audit(p_organization_id, 'invitation.created', 'invitation', v_invitation_id,
    jsonb_build_object('email', v_email, 'role', p_role));

  return v_invitation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- revoke_invitation: owner, or the manager who may issue that role.
-- ---------------------------------------------------------------------------
create function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_inv public.organization_invitations;
  v_caller_role public.org_role;
begin
  select * into v_inv from public.organization_invitations i where i.id = p_invitation_id for update;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  select m.role into v_caller_role
  from public.organization_members m
  where m.organization_id = v_inv.organization_id and m.user_id = v_uid;

  if v_caller_role is null
     or v_caller_role = 'cashier'
     or (v_caller_role = 'manager' and v_inv.role <> 'cashier')
  then
    -- Same error as "not found" for non-members: do not reveal existence.
    if v_caller_role is null then
      raise exception 'invitation_not_found' using errcode = 'P0002';
    end if;
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation_not_pending' using errcode = '22023';
  end if;

  update public.organization_invitations
  set status = 'revoked', responded_at = now(), responded_by = v_uid
  where id = p_invitation_id;

  perform private.write_audit(v_inv.organization_id, 'invitation.revoked', 'invitation', p_invitation_id,
    jsonb_build_object('email', v_inv.email, 'role', v_inv.role));
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitee side. The caller's email must be confirmed and equal the invited
-- address; the auth.users row is the source of truth, not JWT claims.
-- ---------------------------------------------------------------------------
create function private.require_confirmed_email()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_confirmed timestamptz;
begin
  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed
  from auth.users u where u.id = private.require_user();
  if v_email is null or v_confirmed is null then
    raise exception 'email_not_confirmed' using errcode = '42501';
  end if;
  return v_email;
end;
$$;
revoke execute on function private.require_confirmed_email() from public;

create function public.list_my_invitations()
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  role public.org_role,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := private.require_confirmed_email();
begin
  return query
    select i.id, i.organization_id, o.name, i.role, i.expires_at, i.created_at
    from public.organization_invitations i
    join public.organizations o on o.id = i.organization_id
    where i.email = v_email and i.status = 'pending' and i.expires_at > now()
    order by i.created_at desc;
end;
$$;

create function public.respond_to_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_email text := private.require_confirmed_email();
  v_inv public.organization_invitations;
begin
  if p_accept is null then
    raise exception 'invalid_parameter' using errcode = '22023';
  end if;

  select * into v_inv from public.organization_invitations i where i.id = p_invitation_id for update;
  -- Mismatched email is reported as "not found" so invitation ids cannot be probed.
  if not found or v_inv.email <> v_email then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation_not_pending' using errcode = '22023';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = '22023';
  end if;

  if p_accept then
    if exists (
      select 1 from public.organization_members m
      where m.organization_id = v_inv.organization_id and m.user_id = v_uid
    ) then
      raise exception 'already_member' using errcode = '23505';
    end if;
    insert into public.organization_members (organization_id, user_id, role)
    values (v_inv.organization_id, v_uid, v_inv.role);
  end if;

  update public.organization_invitations
  set status = case when p_accept then 'accepted'::public.invitation_status else 'declined'::public.invitation_status end,
      responded_at = now(),
      responded_by = v_uid
  where id = p_invitation_id;

  perform private.write_audit(v_inv.organization_id,
    case when p_accept then 'invitation.accepted' else 'invitation.declined' end,
    'invitation', p_invitation_id, jsonb_build_object('role', v_inv.role));

  return v_inv.organization_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function private.require_user() from public;

revoke execute on function public.create_organization(text, text, text) from public, anon;
revoke execute on function public.list_organization_members(uuid) from public, anon;
revoke execute on function public.update_member_role(uuid, uuid, public.org_role) from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
revoke execute on function public.create_invitation(uuid, text, public.org_role) from public, anon;
revoke execute on function public.revoke_invitation(uuid) from public, anon;
revoke execute on function public.list_my_invitations() from public, anon;
revoke execute on function public.respond_to_invitation(uuid, boolean) from public, anon;

grant execute on function public.create_organization(text, text, text) to authenticated;
grant execute on function public.list_organization_members(uuid) to authenticated;
grant execute on function public.update_member_role(uuid, uuid, public.org_role) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.create_invitation(uuid, text, public.org_role) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.list_my_invitations() to authenticated;
grant execute on function public.respond_to_invitation(uuid, boolean) to authenticated;

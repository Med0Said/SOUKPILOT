-- SoukPilot — Modernization phase 4: external integrations (free, no key).
--
-- Each integration is OFF by default and switched on per organization by its
-- owner (audited). Before every external call the app asks the database
-- (consume_integration_call) — the switch and the quotas are enforced here,
-- not in the browser:
--   * per organization, so one shop cannot exhaust a shared free quota;
--   * per platform, below the provider's own published limit.
-- No business data is stored from the providers: results are suggestions the
-- user accepts or not.

create table public.organization_integrations (
  id uuid not null default gen_random_uuid() unique,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  integration text not null check (integration in ('barcode_lookup', 'exchange_rates')),
  enabled boolean not null default false,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, integration)
);
alter table public.organization_integrations enable row level security;
create trigger organization_integrations_set_updated_at before update on public.organization_integrations
  for each row execute function private.set_updated_at();
create trigger organization_integrations_audit after insert or update on public.organization_integrations
  for each row execute function private.audit_row_change('integration');

-- Members may see which integrations are on; changes only via the function.
create policy organization_integrations_select_member on public.organization_integrations
  for select to authenticated using (private.is_org_member(organization_id));
revoke all on public.organization_integrations from anon, authenticated;
grant select on public.organization_integrations to authenticated;

-- Owner only: switch an integration on or off.
create function public.set_integration_enabled(p_organization_id uuid, p_integration text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_org_role(p_organization_id, array['owner']::public.org_role[]);
  if p_integration not in ('barcode_lookup', 'exchange_rates') then
    raise exception 'invalid_integration' using errcode = '22023';
  end if;
  insert into public.organization_integrations (organization_id, integration, enabled, updated_by)
  values (p_organization_id, p_integration, coalesce(p_enabled, false), auth.uid())
  on conflict (organization_id, integration)
  do update set enabled = excluded.enabled, updated_by = excluded.updated_by;
end;
$$;

-- Called by the server before each external request. Raises
-- 'integration_disabled' or 'rate_limited'; returns nothing otherwise.
--   barcode_lookup: 10 / minute / organization, 12 / minute in total
--     (Open Food Facts allows 15 product reads / minute / IP).
--   exchange_rates: 30 / minute / organization (responses are cached anyway).
create function public.consume_integration_call(p_organization_id uuid, p_integration text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_integrations i
    where i.organization_id = p_organization_id and i.integration = p_integration and i.enabled
  ) then
    raise exception 'integration_disabled' using errcode = '42501';
  end if;
  if p_integration = 'barcode_lookup' then
    perform private.enforce_rate_limit('integration:barcode:' || p_organization_id::text, 10, interval '1 minute');
    perform private.enforce_rate_limit('integration:barcode', 12, interval '1 minute');
  else
    perform private.enforce_rate_limit('integration:rates:' || p_organization_id::text, 30, interval '1 minute');
  end if;
end;
$$;

revoke execute on function public.set_integration_enabled(uuid, text, boolean) from public, anon;
revoke execute on function public.consume_integration_call(uuid, text) from public, anon;
grant execute on function public.set_integration_enabled(uuid, text, boolean) to authenticated;
grant execute on function public.consume_integration_call(uuid, text) to authenticated;

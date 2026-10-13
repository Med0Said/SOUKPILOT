-- SoukPilot — Rate limiting inside the database.
--
-- Fixed-window counters, so limits hold on serverless hosts without Redis
-- and cannot be bypassed by calling the Data API directly. A request over
-- the limit raises 'rate_limited'; because the exception rolls back the
-- transaction, the rejected attempt does not consume the window.

create table private.rate_limit_counters (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (bucket, window_start)
);
revoke all on private.rate_limit_counters from public;

create function private.enforce_rate_limit(p_bucket text, p_limit integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seconds double precision := extract(epoch from p_window);
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / v_seconds) * v_seconds);
  v_hits integer;
begin
  insert into private.rate_limit_counters as c (bucket, window_start, hits)
  values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = c.hits + 1
  returning c.hits into v_hits;

  if v_hits > p_limit then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  -- Opportunistic cleanup of this bucket's expired windows.
  delete from private.rate_limit_counters
  where bucket = p_bucket and window_start < v_start;
end;
$$;
revoke execute on function private.enforce_rate_limit(text, integer, interval) from public;

-- Invitations: at most 30 per organization per hour.
create function private.rate_limit_invitations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enforce_rate_limit('invitation:' || new.organization_id::text, 30, interval '1 hour');
  return new;
end;
$$;
revoke execute on function private.rate_limit_invitations() from public;

create trigger organization_invitations_rate_limit
  before insert on public.organization_invitations
  for each row execute function private.rate_limit_invitations();

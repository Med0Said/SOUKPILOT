-- SoukPilot — Milestone 3: inventory operations.
--
-- Every stock change goes through private.apply_stock_lines():
--   1. validates the variant (same organization, stock-tracked) and location
--      (same organization, active);
--   2. locks the stock_levels row (rows are processed ordered by variant_id,
--      location_id, so concurrent transactions lock in the same order and
--      cannot deadlock);
--   3. refuses a negative result ('insufficient_stock');
--   4. updates the balance and appends the movement, in the same transaction.
--
-- Public functions create one document each and are idempotent: calling
-- again with the same idempotency key returns the existing document instead
-- of applying the stock change twice (also under concurrency).

-- ---------------------------------------------------------------------------
-- Line validation
-- ---------------------------------------------------------------------------
-- p_lines: [{ "variant_id": uuid, <p_qty_field>: integer, ... }]
-- p_signed: true = non-zero delta (adjustments), false = strictly positive.
create function private.validate_stock_lines(p_lines jsonb, p_qty_field text, p_signed boolean)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_count integer;
  v_bad integer;
  v_distinct integer;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'invalid_lines' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_lines);
  if v_count < 1 or v_count > 500 then
    raise exception 'invalid_lines' using errcode = '22023';
  end if;

  select
    count(*) filter (where not (
      jsonb_typeof(l -> 'variant_id') = 'string'
      and (l ->> 'variant_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jsonb_typeof(l -> p_qty_field) = 'number'
      and case
            when (l ->> p_qty_field) ~ '^-?[0-9]{1,7}$' then
              case when p_signed then (l ->> p_qty_field)::integer <> 0
                   else (l ->> p_qty_field)::integer > 0 end
              and abs((l ->> p_qty_field)::integer) <= 1000000
            else false
          end
      and (
        l -> 'unit_cost_millimes' is null
        or l -> 'unit_cost_millimes' = 'null'::jsonb
        or (jsonb_typeof(l -> 'unit_cost_millimes') = 'number'
            and case when (l ->> 'unit_cost_millimes') ~ '^[0-9]{1,13}$'
                     then (l ->> 'unit_cost_millimes')::bigint <= 1000000000000
                     else false end)
      )
    )),
    count(distinct lower(l ->> 'variant_id'))
  into v_bad, v_distinct
  from jsonb_array_elements(p_lines) as t(l);

  if v_bad > 0 then
    raise exception 'invalid_lines' using errcode = '22023';
  end if;
  if v_distinct <> v_count then
    raise exception 'duplicate_line' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function private.validate_stock_lines(jsonb, text, boolean) from public;

-- Human label of a variant for error details: "T-shirt (S / Noir)".
create function private.variant_display_name(p_variant_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.name || case when cardinality(v.option_values) > 0
                        then ' (' || array_to_string(v.option_values, ' / ') || ')' else '' end
  from public.product_variants v join public.products p on p.id = v.product_id
  where v.id = p_variant_id;
$$;
revoke execute on function private.variant_display_name(uuid) from public;

-- Checks a location belongs to the organization and is active.
create function private.require_active_location(p_organization_id uuid, p_location_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_active boolean;
begin
  select l.is_active into v_active from public.locations l
  where l.id = p_location_id and l.organization_id = p_organization_id;
  if not found then
    raise exception 'invalid_reference' using errcode = '23503';
  end if;
  if not v_active then
    raise exception 'location_inactive' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function private.require_active_location(uuid, uuid) from public;

-- Checks every variant of p_lines belongs to the organization and tracks stock.
create function private.require_tracked_variants(p_organization_id uuid, p_lines jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_missing integer;
  v_untracked text;
begin
  select count(*) into v_missing
  from jsonb_array_elements(p_lines) as t(l)
  where not exists (
    select 1 from public.product_variants v
    where v.id = (l ->> 'variant_id')::uuid and v.organization_id = p_organization_id
  );
  if v_missing > 0 then
    raise exception 'invalid_reference' using errcode = '23503';
  end if;

  select private.variant_display_name(v.id) into v_untracked
  from jsonb_array_elements(p_lines) as t(l)
  join public.product_variants v on v.id = (l ->> 'variant_id')::uuid
  join public.products p on p.id = v.product_id
  where not p.track_stock
  limit 1;
  if v_untracked is not null then
    raise exception 'stock_not_tracked' using errcode = '22023', detail = v_untracked;
  end if;
end;
$$;
revoke execute on function private.require_tracked_variants(uuid, jsonb) from public;

-- ---------------------------------------------------------------------------
-- The single write path for stock.
-- p_lines: [{ "location_id", "variant_id", "delta", "movement_type"? }]
-- ---------------------------------------------------------------------------
create function private.apply_stock_lines(
  p_organization_id uuid,
  p_movement_type public.stock_movement_type,
  p_source_type text,
  p_source_id uuid,
  p_reason text,
  p_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_quantity integer;
  v_new integer;
begin
  perform private.require_tracked_variants(p_organization_id, p_lines);

  for r in
    select
      (l ->> 'location_id')::uuid as location_id,
      (l ->> 'variant_id')::uuid as variant_id,
      (l ->> 'delta')::integer as delta,
      coalesce(l ->> 'movement_type', p_movement_type::text)::public.stock_movement_type as movement_type
    from jsonb_array_elements(p_lines) as t(l)
    order by 2, 1
  loop
    perform private.require_active_location(p_organization_id, r.location_id);

    insert into public.stock_levels (organization_id, location_id, variant_id, quantity)
    values (p_organization_id, r.location_id, r.variant_id, 0)
    on conflict (location_id, variant_id) do nothing;

    select s.quantity into v_quantity
    from public.stock_levels s
    where s.location_id = r.location_id and s.variant_id = r.variant_id
    for update;

    v_new := v_quantity + r.delta;
    if v_new < 0 then
      raise exception 'insufficient_stock' using errcode = '23514',
        detail = private.variant_display_name(r.variant_id) || ' — disponible : ' || v_quantity;
    end if;

    update public.stock_levels
    set quantity = v_new, updated_at = now()
    where location_id = r.location_id and variant_id = r.variant_id;

    insert into public.stock_movements
      (organization_id, location_id, variant_id, quantity_delta, quantity_after, movement_type, source_type, source_id, reason, actor_id)
    values
      (p_organization_id, r.location_id, r.variant_id, r.delta, v_new, r.movement_type, p_source_type, p_source_id, p_reason, auth.uid());
  end loop;
end;
$$;
revoke execute on function private.apply_stock_lines(uuid, public.stock_movement_type, text, uuid, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Goods receipt
-- p_lines: [{ "variant_id", "quantity" > 0, "unit_cost_millimes"? }]
-- ---------------------------------------------------------------------------
create function public.post_stock_receipt(
  p_organization_id uuid,
  p_location_id uuid,
  p_supplier_id uuid,
  p_reference text,
  p_note text,
  p_lines jsonb,
  p_update_costs boolean,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  v_id uuid;
begin
  if p_idempotency_key is null then
    raise exception 'invalid_parameter' using errcode = '22023';
  end if;
  select r.id into v_id from public.stock_receipts r
  where r.organization_id = p_organization_id and r.idempotency_key = p_idempotency_key;
  if found then
    return v_id;
  end if;

  perform private.validate_stock_lines(p_lines, 'quantity', false);
  perform private.require_active_location(p_organization_id, p_location_id);
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers s where s.id = p_supplier_id and s.organization_id = p_organization_id
  ) then
    raise exception 'invalid_reference' using errcode = '23503';
  end if;

  begin
    insert into public.stock_receipts (organization_id, number, location_id, supplier_id, reference, note, idempotency_key, created_by)
    values (
      p_organization_id,
      private.next_document_number(p_organization_id, 'stock_receipt'),
      p_location_id,
      p_supplier_id,
      nullif(btrim(coalesce(p_reference, '')), ''),
      nullif(btrim(coalesce(p_note, '')), ''),
      p_idempotency_key,
      v_uid
    )
    returning id into v_id;
  exception when unique_violation then
    -- Same key submitted concurrently: return the document that won.
    select r.id into v_id from public.stock_receipts r
    where r.organization_id = p_organization_id and r.idempotency_key = p_idempotency_key;
    if v_id is null then
      raise;
    end if;
    return v_id;
  end;

  perform private.apply_stock_lines(
    p_organization_id, 'purchase_receipt', 'stock_receipt', v_id, null,
    (select jsonb_agg(jsonb_build_object('location_id', p_location_id, 'variant_id', l -> 'variant_id', 'delta', l -> 'quantity'))
     from jsonb_array_elements(p_lines) as t(l))
  );

  insert into public.stock_receipt_lines (receipt_id, organization_id, variant_id, quantity, unit_cost_millimes)
  select v_id, p_organization_id, (l ->> 'variant_id')::uuid, (l ->> 'quantity')::integer, (l ->> 'unit_cost_millimes')::bigint
  from jsonb_array_elements(p_lines) as t(l);

  if coalesce(p_update_costs, false) then
    update public.product_variant_costs c
    set cost_millimes = (l ->> 'unit_cost_millimes')::bigint
    from jsonb_array_elements(p_lines) as t(l)
    where c.variant_id = (l ->> 'variant_id')::uuid
      and c.organization_id = p_organization_id
      and l ->> 'unit_cost_millimes' is not null
      and c.cost_millimes is distinct from (l ->> 'unit_cost_millimes')::bigint;
  end if;

  perform private.write_audit(p_organization_id, 'stock_receipt.posted', 'stock_receipt', v_id,
    jsonb_build_object('lines', jsonb_array_length(p_lines), 'location_id', p_location_id, 'update_costs', coalesce(p_update_costs, false)));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Opening stock: first quantity of a variant at a location (applied at once).
-- p_lines: [{ "variant_id", "quantity" > 0, "unit_cost_millimes"? }]
-- ---------------------------------------------------------------------------
create function public.record_opening_stock(
  p_organization_id uuid,
  p_location_id uuid,
  p_lines jsonb,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  v_id uuid;
  v_already text;
begin
  if p_idempotency_key is null then
    raise exception 'invalid_parameter' using errcode = '22023';
  end if;
  select a.id into v_id from public.stock_adjustments a
  where a.organization_id = p_organization_id and a.idempotency_key = p_idempotency_key;
  if found then
    return v_id;
  end if;

  perform private.validate_stock_lines(p_lines, 'quantity', false);

  begin
    insert into public.stock_adjustments
      (organization_id, number, kind, status, location_id, reason, idempotency_key, created_by, reviewed_by, reviewed_at)
    values (
      p_organization_id,
      private.next_document_number(p_organization_id, 'stock_adjustment'),
      'opening', 'approved', p_location_id, 'Stock initial', p_idempotency_key, v_uid, v_uid, now()
    )
    returning id into v_id;
  exception when unique_violation then
    select a.id into v_id from public.stock_adjustments a
    where a.organization_id = p_organization_id and a.idempotency_key = p_idempotency_key;
    if v_id is null then
      raise;
    end if;
    return v_id;
  end;

  perform private.apply_stock_lines(
    p_organization_id, 'opening', 'stock_adjustment', v_id, 'Stock initial',
    (select jsonb_agg(jsonb_build_object('location_id', p_location_id, 'variant_id', l -> 'variant_id', 'delta', l -> 'quantity'))
     from jsonb_array_elements(p_lines) as t(l))
  );

  -- Opening stock must be the FIRST movement of the variant at this location.
  -- Checked after taking the row locks, so two concurrent openings cannot both pass.
  select private.variant_display_name(m.variant_id) into v_already
  from public.stock_movements m
  join jsonb_array_elements(p_lines) as t(l) on m.variant_id = (l ->> 'variant_id')::uuid
  where m.location_id = p_location_id and m.source_id <> v_id
  limit 1;
  if v_already is not null then
    raise exception 'opening_already_recorded' using errcode = '22023', detail = v_already;
  end if;

  insert into public.stock_adjustment_lines (adjustment_id, organization_id, variant_id, quantity_delta)
  select v_id, p_organization_id, (l ->> 'variant_id')::uuid, (l ->> 'quantity')::integer
  from jsonb_array_elements(p_lines) as t(l);

  insert into public.stock_opening_costs (adjustment_id, organization_id, variant_id, unit_cost_millimes)
  select v_id, p_organization_id, (l ->> 'variant_id')::uuid, (l ->> 'unit_cost_millimes')::bigint
  from jsonb_array_elements(p_lines) as t(l)
  where l ->> 'unit_cost_millimes' is not null;

  update public.product_variant_costs c
  set cost_millimes = (l ->> 'unit_cost_millimes')::bigint
  from jsonb_array_elements(p_lines) as t(l)
  where c.variant_id = (l ->> 'variant_id')::uuid
    and c.organization_id = p_organization_id
    and l ->> 'unit_cost_millimes' is not null
    and c.cost_millimes is distinct from (l ->> 'unit_cost_millimes')::bigint;

  perform private.write_audit(p_organization_id, 'stock_opening.recorded', 'stock_adjustment', v_id,
    jsonb_build_object('lines', jsonb_array_length(p_lines), 'location_id', p_location_id));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Manual adjustment: proposed by any member, applied on owner/manager approval.
-- p_lines: [{ "variant_id", "quantity_delta" <> 0 }]
-- ---------------------------------------------------------------------------
create function public.create_stock_adjustment(
  p_organization_id uuid,
  p_location_id uuid,
  p_reason text,
  p_lines jsonb,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_org_role(p_organization_id, array['owner', 'manager', 'cashier']::public.org_role[]);
  v_id uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_idempotency_key is null then
    raise exception 'invalid_parameter' using errcode = '22023';
  end if;
  select a.id into v_id from public.stock_adjustments a
  where a.organization_id = p_organization_id and a.idempotency_key = p_idempotency_key;
  if found then
    return v_id;
  end if;

  if char_length(v_reason) not between 3 and 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  perform private.validate_stock_lines(p_lines, 'quantity_delta', true);
  perform private.require_active_location(p_organization_id, p_location_id);
  perform private.require_tracked_variants(p_organization_id, p_lines);

  begin
    insert into public.stock_adjustments (organization_id, number, kind, status, location_id, reason, idempotency_key, created_by)
    values (
      p_organization_id,
      private.next_document_number(p_organization_id, 'stock_adjustment'),
      'adjustment', 'pending', p_location_id, v_reason, p_idempotency_key, v_uid
    )
    returning id into v_id;
  exception when unique_violation then
    select a.id into v_id from public.stock_adjustments a
    where a.organization_id = p_organization_id and a.idempotency_key = p_idempotency_key;
    if v_id is null then
      raise;
    end if;
    return v_id;
  end;

  insert into public.stock_adjustment_lines (adjustment_id, organization_id, variant_id, quantity_delta)
  select v_id, p_organization_id, (l ->> 'variant_id')::uuid, (l ->> 'quantity_delta')::integer
  from jsonb_array_elements(p_lines) as t(l);

  perform private.write_audit(p_organization_id, 'stock_adjustment.created', 'stock_adjustment', v_id,
    jsonb_build_object('reason', v_reason, 'lines', jsonb_array_length(p_lines)));
  return v_id;
end;
$$;

create function public.review_stock_adjustment(p_adjustment_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adj public.stock_adjustments;
  v_uid uuid;
begin
  -- Lock the document: concurrent or repeated reviews wait, then see the new status.
  select * into v_adj from public.stock_adjustments a where a.id = p_adjustment_id for update;
  if not found or not private.is_org_member(v_adj.organization_id) then
    raise exception 'adjustment_not_found' using errcode = 'P0002';
  end if;
  v_uid := private.require_org_role(v_adj.organization_id, array['owner', 'manager']::public.org_role[]);
  if v_adj.status <> 'pending' then
    raise exception 'adjustment_not_pending' using errcode = '22023';
  end if;
  if p_approve is null then
    raise exception 'invalid_parameter' using errcode = '22023';
  end if;

  if p_approve then
    perform private.apply_stock_lines(
      v_adj.organization_id, 'adjustment', 'stock_adjustment', v_adj.id, v_adj.reason,
      (select jsonb_agg(jsonb_build_object('location_id', v_adj.location_id, 'variant_id', l.variant_id, 'delta', l.quantity_delta))
       from public.stock_adjustment_lines l where l.adjustment_id = v_adj.id)
    );
  end if;

  update public.stock_adjustments
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = v_uid,
      reviewed_at = now(),
      review_note = nullif(left(btrim(coalesce(p_note, '')), 500), '')
  where id = v_adj.id;

  perform private.write_audit(v_adj.organization_id,
    case when p_approve then 'stock_adjustment.approved' else 'stock_adjustment.rejected' end,
    'stock_adjustment', v_adj.id, jsonb_build_object('note', p_note));
end;
$$;

-- ---------------------------------------------------------------------------
-- Stock counts
-- ---------------------------------------------------------------------------
create unique index stock_counts_one_open_per_location_idx
  on public.stock_counts (location_id) where status in ('in_progress', 'submitted');

create function public.create_stock_count(
  p_organization_id uuid,
  p_location_id uuid,
  p_note text,
  p_variant_ids uuid[],
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  v_id uuid;
begin
  if p_idempotency_key is null then
    raise exception 'invalid_parameter' using errcode = '22023';
  end if;
  select c.id into v_id from public.stock_counts c
  where c.organization_id = p_organization_id and c.idempotency_key = p_idempotency_key;
  if found then
    return v_id;
  end if;
  perform private.require_active_location(p_organization_id, p_location_id);

  begin
    insert into public.stock_counts (organization_id, number, location_id, note, idempotency_key, created_by)
    values (
      p_organization_id,
      private.next_document_number(p_organization_id, 'stock_count'),
      p_location_id,
      nullif(left(btrim(coalesce(p_note, '')), 500), ''),
      p_idempotency_key,
      v_uid
    )
    returning id into v_id;
  exception when unique_violation then
    select c.id into v_id from public.stock_counts c
    where c.organization_id = p_organization_id and c.idempotency_key = p_idempotency_key;
    if v_id is not null then
      return v_id;
    end if;
    raise exception 'count_already_open' using errcode = '23505';
  end;

  -- Items: the given variants, or every active, stock-tracked variant.
  insert into public.stock_count_items (count_id, organization_id, variant_id)
  select v_id, p_organization_id, v.id
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.organization_id = p_organization_id
    and p.track_stock
    and (
      (p_variant_ids is null and v.is_active and p.is_active)
      or v.id = any (p_variant_ids)
    );

  perform private.write_audit(p_organization_id, 'stock_count.created', 'stock_count', v_id,
    jsonb_build_object('location_id', p_location_id));
  return v_id;
end;
$$;

-- Records counted quantities. Snapshot of the book quantity is taken per
-- item, at the time it is counted. p_items: [{ "variant_id", "counted_quantity" >= 0 }]
create function public.record_stock_count(p_count_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count public.stock_counts;
  v_uid uuid;
  v_bad integer;
  v_recorded integer;
begin
  select * into v_count from public.stock_counts c where c.id = p_count_id for update;
  if not found or not private.is_org_member(v_count.organization_id) then
    raise exception 'count_not_found' using errcode = 'P0002';
  end if;
  v_uid := private.require_user();
  if v_count.status <> 'in_progress' then
    raise exception 'count_not_in_progress' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'invalid_lines' using errcode = '22023';
  end if;
  select count(*) into v_bad
  from jsonb_array_elements(p_items) as t(i)
  where not (
    (i ->> 'variant_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and jsonb_typeof(i -> 'counted_quantity') = 'number'
    and case when (i ->> 'counted_quantity') ~ '^[0-9]{1,7}$'
             then (i ->> 'counted_quantity')::integer <= 1000000 else false end
  );
  if v_bad > 0 or (select count(distinct lower(i ->> 'variant_id')) from jsonb_array_elements(p_items) as t(i)) <> jsonb_array_length(p_items) then
    raise exception 'invalid_lines' using errcode = '22023';
  end if;
  perform private.require_tracked_variants(v_count.organization_id,
    (select jsonb_agg(jsonb_build_object('variant_id', i -> 'variant_id')) from jsonb_array_elements(p_items) as t(i)));

  insert into public.stock_count_items as ci
    (count_id, organization_id, variant_id, expected_quantity, counted_quantity, counted_by, counted_at)
  select
    v_count.id,
    v_count.organization_id,
    (i ->> 'variant_id')::uuid,
    coalesce((select s.quantity from public.stock_levels s
              where s.location_id = v_count.location_id and s.variant_id = (i ->> 'variant_id')::uuid), 0),
    (i ->> 'counted_quantity')::integer,
    v_uid,
    now()
  from jsonb_array_elements(p_items) as t(i)
  on conflict (count_id, variant_id) do update
  set expected_quantity = excluded.expected_quantity,
      counted_quantity = excluded.counted_quantity,
      counted_by = excluded.counted_by,
      counted_at = excluded.counted_at;

  get diagnostics v_recorded = row_count;
  return v_recorded;
end;
$$;

create function public.submit_stock_count(p_count_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count public.stock_counts;
  v_uid uuid;
begin
  select * into v_count from public.stock_counts c where c.id = p_count_id for update;
  if not found or not private.is_org_member(v_count.organization_id) then
    raise exception 'count_not_found' using errcode = 'P0002';
  end if;
  v_uid := private.require_user();
  if v_count.status <> 'in_progress' then
    raise exception 'count_not_in_progress' using errcode = '22023';
  end if;
  if not exists (select 1 from public.stock_count_items i where i.count_id = p_count_id and i.counted_quantity is not null) then
    raise exception 'count_empty' using errcode = '22023';
  end if;
  update public.stock_counts set status = 'submitted', submitted_by = v_uid, submitted_at = now() where id = p_count_id;
  perform private.write_audit(v_count.organization_id, 'stock_count.submitted', 'stock_count', p_count_id, '{}'::jsonb);
end;
$$;

-- Approve: apply (counted - expected) for each counted item with a
-- difference. Uncounted items are left untouched (never zeroed).
-- Reject: back to in_progress for a recount.
create function public.review_stock_count(p_count_id uuid, p_approve boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count public.stock_counts;
  v_uid uuid;
  v_lines jsonb;
begin
  select * into v_count from public.stock_counts c where c.id = p_count_id for update;
  if not found or not private.is_org_member(v_count.organization_id) then
    raise exception 'count_not_found' using errcode = 'P0002';
  end if;
  v_uid := private.require_org_role(v_count.organization_id, array['owner', 'manager']::public.org_role[]);
  if v_count.status <> 'submitted' then
    raise exception 'count_not_submitted' using errcode = '22023';
  end if;
  if p_approve is null then
    raise exception 'invalid_parameter' using errcode = '22023';
  end if;

  if not p_approve then
    update public.stock_counts set status = 'in_progress', submitted_by = null, submitted_at = null where id = p_count_id;
    perform private.write_audit(v_count.organization_id, 'stock_count.rejected', 'stock_count', p_count_id, '{}'::jsonb);
    return 0;
  end if;

  select jsonb_agg(jsonb_build_object(
           'location_id', v_count.location_id,
           'variant_id', i.variant_id,
           'delta', i.counted_quantity - i.expected_quantity))
    into v_lines
  from public.stock_count_items i
  where i.count_id = p_count_id
    and i.counted_quantity is not null
    and i.counted_quantity <> i.expected_quantity;

  if v_lines is not null then
    perform private.apply_stock_lines(
      v_count.organization_id, 'adjustment', 'stock_count', p_count_id,
      'Inventaire n° ' || v_count.number, v_lines);
  end if;

  update public.stock_counts set status = 'approved', reviewed_by = v_uid, reviewed_at = now() where id = p_count_id;
  perform private.write_audit(v_count.organization_id, 'stock_count.approved', 'stock_count', p_count_id,
    jsonb_build_object('adjusted_lines', coalesce(jsonb_array_length(v_lines), 0)));
  return coalesce(jsonb_array_length(v_lines), 0);
end;
$$;

create function public.cancel_stock_count(p_count_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count public.stock_counts;
  v_uid uuid;
begin
  select * into v_count from public.stock_counts c where c.id = p_count_id for update;
  if not found or not private.is_org_member(v_count.organization_id) then
    raise exception 'count_not_found' using errcode = 'P0002';
  end if;
  v_uid := private.require_org_role(v_count.organization_id, array['owner', 'manager']::public.org_role[]);
  if v_count.status not in ('in_progress', 'submitted') then
    raise exception 'count_not_in_progress' using errcode = '22023';
  end if;
  update public.stock_counts set status = 'cancelled', reviewed_by = v_uid, reviewed_at = now() where id = p_count_id;
  perform private.write_audit(v_count.organization_id, 'stock_count.cancelled', 'stock_count', p_count_id, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Transfers. p_lines: [{ "variant_id", "quantity" > 0 }]
-- ---------------------------------------------------------------------------
create function public.post_stock_transfer(
  p_organization_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_note text,
  p_lines jsonb,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  v_id uuid;
begin
  if p_idempotency_key is null then
    raise exception 'invalid_parameter' using errcode = '22023';
  end if;
  select tr.id into v_id from public.stock_transfers tr
  where tr.organization_id = p_organization_id and tr.idempotency_key = p_idempotency_key;
  if found then
    return v_id;
  end if;
  if p_from_location_id = p_to_location_id then
    raise exception 'same_location' using errcode = '22023';
  end if;
  perform private.validate_stock_lines(p_lines, 'quantity', false);

  begin
    insert into public.stock_transfers (organization_id, number, from_location_id, to_location_id, note, idempotency_key, created_by)
    values (
      p_organization_id,
      private.next_document_number(p_organization_id, 'stock_transfer'),
      p_from_location_id,
      p_to_location_id,
      nullif(left(btrim(coalesce(p_note, '')), 500), ''),
      p_idempotency_key,
      v_uid
    )
    returning id into v_id;
  exception when unique_violation then
    select tr.id into v_id from public.stock_transfers tr
    where tr.organization_id = p_organization_id and tr.idempotency_key = p_idempotency_key;
    if v_id is null then
      raise;
    end if;
    return v_id;
  end;

  perform private.apply_stock_lines(
    p_organization_id, 'transfer_out', 'stock_transfer', v_id, null,
    (select jsonb_agg(x) from (
       select jsonb_build_object('location_id', p_from_location_id, 'variant_id', l -> 'variant_id',
                                 'delta', -((l ->> 'quantity')::integer), 'movement_type', 'transfer_out') as x
       from jsonb_array_elements(p_lines) as t(l)
       union all
       select jsonb_build_object('location_id', p_to_location_id, 'variant_id', l -> 'variant_id',
                                 'delta', (l ->> 'quantity')::integer, 'movement_type', 'transfer_in')
       from jsonb_array_elements(p_lines) as t(l)
     ) s)
  );

  insert into public.stock_transfer_lines (transfer_id, organization_id, variant_id, quantity)
  select v_id, p_organization_id, (l ->> 'variant_id')::uuid, (l ->> 'quantity')::integer
  from jsonb_array_elements(p_lines) as t(l);

  perform private.write_audit(p_organization_id, 'stock_transfer.posted', 'stock_transfer', v_id,
    jsonb_build_object('from', p_from_location_id, 'to', p_to_location_id, 'lines', jsonb_array_length(p_lines)));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

-- Variant picker for stock documents (name / SKU / exact barcode).
create function public.search_variants(
  p_organization_id uuid,
  p_query text,
  p_location_id uuid default null,
  p_limit integer default 20
)
returns table (
  variant_id uuid,
  product_id uuid,
  product_name text,
  option_values text[],
  sku text,
  barcode text,
  price_millimes bigint,
  track_stock boolean,
  quantity integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select btrim(coalesce(p_query, '')) as q,
           '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  )
  select v.id, p.id, p.name, v.option_values, v.sku, v.barcode, v.price_millimes, p.track_stock,
         coalesce((select sum(s.quantity)::integer from public.stock_levels s
                   where s.variant_id = v.id and (p_location_id is null or s.location_id = p_location_id)), 0)
  from public.product_variants v
  join public.products p on p.id = v.product_id
  cross join params
  where v.organization_id = p_organization_id
    and v.is_active and p.is_active
    and params.q <> ''
    and (p.name ilike params.pattern or v.sku ilike params.pattern or v.barcode = params.q)
  order by (v.barcode = params.q or upper(v.sku) = upper(params.q)) desc, lower(p.name), v.option_values
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- Stock on hand per variant (one location, or all active locations).
-- Low stock: quantity <= low_stock_threshold (threshold set per variant).
create function public.stock_overview(
  p_organization_id uuid,
  p_location_id uuid default null,
  p_query text default '',
  p_low_only boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  variant_id uuid,
  product_id uuid,
  product_name text,
  option_values text[],
  sku text,
  barcode text,
  quantity integer,
  low_stock_threshold integer,
  is_low boolean,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select btrim(coalesce(p_query, '')) as q,
           '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  ),
  rows as (
    select v.id as variant_id, p.id as product_id, p.name as product_name, v.option_values, v.sku, v.barcode,
           coalesce((select sum(s.quantity)::integer
                     from public.stock_levels s
                     join public.locations l on l.id = s.location_id
                     where s.variant_id = v.id
                       and (case when p_location_id is null then l.is_active else s.location_id = p_location_id end)), 0) as quantity,
           v.low_stock_threshold
    from public.product_variants v
    join public.products p on p.id = v.product_id
    cross join params
    where v.organization_id = p_organization_id
      and v.is_active and p.is_active and p.track_stock
      and (params.q = '' or p.name ilike params.pattern or v.sku ilike params.pattern or v.barcode = params.q)
  )
  select r.variant_id, r.product_id, r.product_name, r.option_values, r.sku, r.barcode, r.quantity,
         r.low_stock_threshold,
         r.low_stock_threshold is not null and r.quantity <= r.low_stock_threshold,
         count(*) over ()
  from rows r
  where not coalesce(p_low_only, false) or (r.low_stock_threshold is not null and r.quantity <= r.low_stock_threshold)
  order by lower(r.product_name), r.option_values
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Estimated stock valuation at CURRENT purchase cost (owner/manager only).
create function public.stock_valuation(p_organization_id uuid, p_location_id uuid default null)
returns table (
  total_quantity bigint,
  valued_quantity bigint,
  total_value_millimes bigint,
  variants_in_stock integer,
  variants_without_cost integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  return query
    with stock as (
      select s.variant_id, sum(s.quantity)::bigint as quantity
      from public.stock_levels s
      join public.locations l on l.id = s.location_id
      where s.organization_id = p_organization_id
        and (case when p_location_id is null then l.is_active else s.location_id = p_location_id end)
      group by s.variant_id
      having sum(s.quantity) > 0
    )
    select
      coalesce(sum(st.quantity), 0)::bigint,
      coalesce(sum(st.quantity) filter (where c.cost_millimes is not null), 0)::bigint,
      coalesce(sum(st.quantity::numeric * c.cost_millimes) filter (where c.cost_millimes is not null), 0)::bigint,
      count(*)::integer,
      (count(*) filter (where c.cost_millimes is null))::integer
    from stock st
    left join public.product_variant_costs c on c.variant_id = st.variant_id;
end;
$$;

-- Integrity check: balances must equal the sum of the ledger, and the last
-- movement's quantity_after must equal the balance. Returns mismatches only.
create function public.check_stock_reconciliation(p_organization_id uuid)
returns table (location_id uuid, variant_id uuid, level_quantity integer, ledger_quantity bigint, last_quantity_after integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  return query
    with ledger as (
      select m.location_id, m.variant_id, sum(m.quantity_delta)::bigint as total,
             (array_agg(m.quantity_after order by m.seq desc))[1] as last_after
      from public.stock_movements m
      where m.organization_id = p_organization_id
      group by m.location_id, m.variant_id
    )
    select coalesce(s.location_id, l.location_id), coalesce(s.variant_id, l.variant_id),
           s.quantity, l.total, l.last_after
    from public.stock_levels s
    full join ledger l on l.location_id = s.location_id and l.variant_id = s.variant_id
    where (s.organization_id = p_organization_id or s.organization_id is null)
      and (coalesce(s.quantity, 0) <> coalesce(l.total, 0)
           or (l.last_after is not null and l.last_after <> s.quantity));
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.post_stock_receipt(uuid, uuid, uuid, text, text, jsonb, boolean, uuid) from public, anon;
revoke execute on function public.record_opening_stock(uuid, uuid, jsonb, uuid) from public, anon;
revoke execute on function public.create_stock_adjustment(uuid, uuid, text, jsonb, uuid) from public, anon;
revoke execute on function public.review_stock_adjustment(uuid, boolean, text) from public, anon;
revoke execute on function public.create_stock_count(uuid, uuid, text, uuid[], uuid) from public, anon;
revoke execute on function public.record_stock_count(uuid, jsonb) from public, anon;
revoke execute on function public.submit_stock_count(uuid) from public, anon;
revoke execute on function public.review_stock_count(uuid, boolean) from public, anon;
revoke execute on function public.cancel_stock_count(uuid) from public, anon;
revoke execute on function public.post_stock_transfer(uuid, uuid, uuid, text, jsonb, uuid) from public, anon;
revoke execute on function public.search_variants(uuid, text, uuid, integer) from public, anon;
revoke execute on function public.stock_overview(uuid, uuid, text, boolean, integer, integer) from public, anon;
revoke execute on function public.stock_valuation(uuid, uuid) from public, anon;
revoke execute on function public.check_stock_reconciliation(uuid) from public, anon;

grant execute on function public.post_stock_receipt(uuid, uuid, uuid, text, text, jsonb, boolean, uuid) to authenticated;
grant execute on function public.record_opening_stock(uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function public.create_stock_adjustment(uuid, uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.review_stock_adjustment(uuid, boolean, text) to authenticated;
grant execute on function public.create_stock_count(uuid, uuid, text, uuid[], uuid) to authenticated;
grant execute on function public.record_stock_count(uuid, jsonb) to authenticated;
grant execute on function public.submit_stock_count(uuid) to authenticated;
grant execute on function public.review_stock_count(uuid, boolean) to authenticated;
grant execute on function public.cancel_stock_count(uuid) to authenticated;
grant execute on function public.post_stock_transfer(uuid, uuid, uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.search_variants(uuid, text, uuid, integer) to authenticated;
grant execute on function public.stock_overview(uuid, uuid, text, boolean, integer, integer) to authenticated;
grant execute on function public.stock_valuation(uuid, uuid) to authenticated;
grant execute on function public.check_stock_reconciliation(uuid) to authenticated;

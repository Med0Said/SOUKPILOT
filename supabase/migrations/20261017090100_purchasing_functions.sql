-- SoukPilot — Milestone 5: purchasing operations (owner/manager only).

-- ---------------------------------------------------------------------------
-- Draft purchase orders. p_lines: [{ "variant_id", "quantity" > 0, "unit_cost_millimes" >= 0 }]
-- ---------------------------------------------------------------------------
create function public.save_purchase_order(
  p_organization_id uuid,
  p_purchase_order_id uuid,
  p_supplier_id uuid,
  p_location_id uuid,
  p_expected_date date,
  p_reference text,
  p_note text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  v_id uuid;
  v_status text;
  v_total numeric;
  v_supplier_active boolean;
begin
  perform private.validate_stock_lines(p_lines, 'quantity', false);
  if exists (
    select 1 from jsonb_array_elements(p_lines) as t(l)
    where l -> 'unit_cost_millimes' is null or l -> 'unit_cost_millimes' = 'null'::jsonb
  ) then
    raise exception 'unit_cost_required' using errcode = '22023';
  end if;
  perform private.require_tracked_variants(p_organization_id, p_lines);
  perform private.require_active_location(p_organization_id, p_location_id);
  select s.is_active into v_supplier_active from public.suppliers s
  where s.id = p_supplier_id and s.organization_id = p_organization_id;
  if not found then
    raise exception 'invalid_reference' using errcode = '23503';
  end if;
  if not v_supplier_active then
    raise exception 'supplier_inactive' using errcode = '22023';
  end if;

  select sum((l ->> 'quantity')::numeric * (l ->> 'unit_cost_millimes')::bigint) into v_total
  from jsonb_array_elements(p_lines) as t(l);
  if v_total > 1000000000000 then
    raise exception 'purchase_amount_too_large' using errcode = '22023';
  end if;

  if p_purchase_order_id is null then
    insert into public.purchase_orders
      (organization_id, supplier_id, location_id, expected_date, reference, note, ordered_total_millimes, created_by)
    values (p_organization_id, p_supplier_id, p_location_id, p_expected_date,
            nullif(left(btrim(coalesce(p_reference, '')), 80), ''), nullif(left(btrim(coalesce(p_note, '')), 1000), ''),
            v_total::bigint, v_uid)
    returning id into v_id;
  else
    select po.status into v_status from public.purchase_orders po
    where po.id = p_purchase_order_id and po.organization_id = p_organization_id
    for update;
    if not found then
      raise exception 'purchase_order_not_found' using errcode = 'P0002';
    end if;
    if v_status <> 'draft' then
      raise exception 'purchase_order_locked' using errcode = '42501';
    end if;
    update public.purchase_orders
    set supplier_id = p_supplier_id, location_id = p_location_id, expected_date = p_expected_date,
        reference = nullif(left(btrim(coalesce(p_reference, '')), 80), ''),
        note = nullif(left(btrim(coalesce(p_note, '')), 1000), ''),
        ordered_total_millimes = v_total::bigint
    where id = p_purchase_order_id;
    v_id := p_purchase_order_id;
    delete from public.purchase_order_items where purchase_order_id = v_id;
  end if;

  insert into public.purchase_order_items (organization_id, purchase_order_id, line_no, variant_id, quantity, unit_cost_millimes)
  select p_organization_id, v_id, t.ord::integer, (t.l ->> 'variant_id')::uuid, (t.l ->> 'quantity')::integer,
         (t.l ->> 'unit_cost_millimes')::bigint
  from jsonb_array_elements(p_lines) with ordinality as t(l, ord);

  return v_id;
end;
$$;

-- Lock + authorize helper for order state changes.
create function private.lock_purchase_order(p_purchase_order_id uuid)
returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders;
begin
  select * into v_po from public.purchase_orders po where po.id = p_purchase_order_id for update;
  if not found or not private.is_org_member(v_po.organization_id) then
    raise exception 'purchase_order_not_found' using errcode = 'P0002';
  end if;
  perform private.require_org_role(v_po.organization_id, array['owner', 'manager']::public.org_role[]);
  return v_po;
end;
$$;
revoke execute on function private.lock_purchase_order(uuid) from public;

-- Draft → ordered (numbered). Placing an order never moves stock.
create function public.place_purchase_order(p_purchase_order_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders := private.lock_purchase_order(p_purchase_order_id);
  v_number bigint;
begin
  if v_po.status <> 'draft' then
    raise exception 'purchase_order_locked' using errcode = '42501';
  end if;
  if not exists (select 1 from public.purchase_order_items i where i.purchase_order_id = v_po.id) then
    raise exception 'invalid_lines' using errcode = '22023';
  end if;
  if not exists (select 1 from public.suppliers s where s.id = v_po.supplier_id and s.is_active) then
    raise exception 'supplier_inactive' using errcode = '22023';
  end if;
  v_number := private.next_document_number(v_po.organization_id, 'purchase_order');
  update public.purchase_orders
  set status = 'ordered', number = v_number, ordered_at = now(), ordered_by = auth.uid()
  where id = v_po.id;
  perform private.write_audit(v_po.organization_id, 'purchase_order.placed', 'purchase_order', v_po.id,
    jsonb_build_object('number', v_number, 'total_millimes', v_po.ordered_total_millimes, 'supplier_id', v_po.supplier_id));
  return v_number;
end;
$$;

-- Cancel: a draft, or an order of which nothing was received.
create function public.cancel_purchase_order(p_purchase_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders := private.lock_purchase_order(p_purchase_order_id);
begin
  if v_po.status not in ('draft', 'ordered') then
    raise exception 'purchase_order_not_cancellable' using errcode = '22023';
  end if;
  update public.purchase_orders set status = 'cancelled', closed_at = now(), closed_by = auth.uid() where id = v_po.id;
  perform private.write_audit(v_po.organization_id, 'purchase_order.cancelled', 'purchase_order', v_po.id, '{}'::jsonb);
end;
$$;

-- Close a partially received order: the rest will not be delivered.
create function public.close_purchase_order(p_purchase_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders := private.lock_purchase_order(p_purchase_order_id);
begin
  if v_po.status <> 'partially_received' then
    raise exception 'purchase_order_not_open' using errcode = '22023';
  end if;
  update public.purchase_orders set status = 'closed', closed_at = now(), closed_by = auth.uid() where id = v_po.id;
  perform private.write_audit(v_po.organization_id, 'purchase_order.closed', 'purchase_order', v_po.id, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Receive goods against an order (partial or complete). Idempotent.
-- p_lines: [{ "purchase_order_item_id", "quantity" > 0, "unit_cost_millimes"? (override) }]
-- ---------------------------------------------------------------------------
create function public.receive_purchase_order(
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_reference text,
  p_note text,
  p_update_costs boolean,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Order lock first: concurrent receipts of the same order are serialized.
  v_po public.purchase_orders := private.lock_purchase_order(p_purchase_order_id);
  v_id uuid;
  v_bad integer;
  v_distinct integer;
  v_lines jsonb := '[]'::jsonb;
  r record;
begin
  if p_idempotency_key is null then
    raise exception 'invalid_parameter' using errcode = '22023';
  end if;
  select sr.id into v_id from public.stock_receipts sr
  where sr.organization_id = v_po.organization_id and sr.idempotency_key = p_idempotency_key;
  if found then
    return v_id;
  end if;
  if v_po.status not in ('ordered', 'partially_received') then
    raise exception 'purchase_order_not_open' using errcode = '22023';
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 500 then
    raise exception 'invalid_lines' using errcode = '22023';
  end if;
  select count(*) filter (where not (
           (l ->> 'purchase_order_item_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           and jsonb_typeof(l -> 'quantity') = 'number'
           and case when (l ->> 'quantity') ~ '^[0-9]{1,7}$' then (l ->> 'quantity')::integer between 1 and 1000000 else false end
           and (l -> 'unit_cost_millimes' is null or l -> 'unit_cost_millimes' = 'null'::jsonb
                or (jsonb_typeof(l -> 'unit_cost_millimes') = 'number'
                    and case when (l ->> 'unit_cost_millimes') ~ '^[0-9]{1,13}$'
                             then (l ->> 'unit_cost_millimes')::bigint <= 1000000000000 else false end)))),
         count(distinct lower(l ->> 'purchase_order_item_id'))
    into v_bad, v_distinct
  from jsonb_array_elements(p_lines) as t(l);
  if v_bad > 0 then
    raise exception 'invalid_lines' using errcode = '22023';
  end if;
  if v_distinct <> jsonb_array_length(p_lines) then
    raise exception 'duplicate_line' using errcode = '22023';
  end if;

  for r in
    select i.*, (l ->> 'quantity')::integer as qty, (l ->> 'unit_cost_millimes')::bigint as cost_override
    from jsonb_array_elements(p_lines) as t(l)
    left join public.purchase_order_items i
      on i.id = (l ->> 'purchase_order_item_id')::uuid and i.purchase_order_id = v_po.id
    order by i.variant_id
  loop
    if r.id is null then
      raise exception 'invalid_reference' using errcode = '23503';
    end if;
    if r.qty > r.quantity - r.received_quantity then
      raise exception 'receipt_exceeds_ordered' using errcode = '22023',
        detail = private.variant_display_name(r.variant_id) || ' — reste à recevoir : ' || (r.quantity - r.received_quantity);
    end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'item_id', r.id, 'variant_id', r.variant_id, 'quantity', r.qty,
      'unit_cost_millimes', coalesce(r.cost_override, r.unit_cost_millimes)));
  end loop;

  begin
    insert into public.stock_receipts
      (organization_id, number, location_id, supplier_id, reference, note, idempotency_key, created_by, purchase_order_id)
    values (
      v_po.organization_id,
      private.next_document_number(v_po.organization_id, 'stock_receipt'),
      v_po.location_id,
      v_po.supplier_id,
      nullif(left(btrim(coalesce(p_reference, '')), 80), ''),
      nullif(left(btrim(coalesce(p_note, '')), 1000), ''),
      p_idempotency_key,
      auth.uid(),
      v_po.id
    )
    returning id into v_id;
  exception when unique_violation then
    select sr.id into v_id from public.stock_receipts sr
    where sr.organization_id = v_po.organization_id and sr.idempotency_key = p_idempotency_key;
    if v_id is null then
      raise;
    end if;
    return v_id;
  end;

  perform private.apply_stock_lines(
    v_po.organization_id, 'purchase_receipt', 'stock_receipt', v_id, null,
    (select jsonb_agg(jsonb_build_object('location_id', v_po.location_id, 'variant_id', x -> 'variant_id', 'delta', x -> 'quantity'))
     from jsonb_array_elements(v_lines) as t(x))
  );

  insert into public.stock_receipt_lines
    (receipt_id, organization_id, variant_id, quantity, unit_cost_millimes, purchase_order_item_id)
  select v_id, v_po.organization_id, (x ->> 'variant_id')::uuid, (x ->> 'quantity')::integer,
         (x ->> 'unit_cost_millimes')::bigint, (x ->> 'item_id')::uuid
  from jsonb_array_elements(v_lines) as t(x);

  update public.purchase_order_items i
  set received_quantity = i.received_quantity + (x ->> 'quantity')::integer
  from jsonb_array_elements(v_lines) as t(x)
  where i.id = (x ->> 'item_id')::uuid;

  update public.purchase_orders
  set status = case when exists (select 1 from public.purchase_order_items i
                                 where i.purchase_order_id = v_po.id and i.received_quantity < i.quantity)
                    then 'partially_received' else 'received' end
  where id = v_po.id;

  if coalesce(p_update_costs, false) then
    update public.product_variant_costs c
    set cost_millimes = (x ->> 'unit_cost_millimes')::bigint
    from jsonb_array_elements(v_lines) as t(x)
    where c.variant_id = (x ->> 'variant_id')::uuid
      and c.cost_millimes is distinct from (x ->> 'unit_cost_millimes')::bigint;
  end if;

  perform private.write_audit(v_po.organization_id, 'purchase_order.received', 'purchase_order', v_po.id,
    jsonb_build_object('receipt_id', v_id, 'lines', jsonb_array_length(v_lines)));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Supplier payments (and refunds received from a supplier)
-- ---------------------------------------------------------------------------
create function public.record_supplier_payment(
  p_organization_id uuid,
  p_supplier_id uuid,
  p_method_id uuid,
  p_kind text,
  p_amount_millimes bigint,
  p_paid_on date,
  p_reference text,
  p_note text,
  p_purchase_order_id uuid,
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
  if p_idempotency_key is null or p_paid_on is null or p_kind not in ('payment', 'refund') then
    raise exception 'invalid_parameter' using errcode = '22023';
  end if;
  select sp.id into v_id from public.supplier_payments sp
  where sp.organization_id = p_organization_id and sp.idempotency_key = p_idempotency_key;
  if found then
    return v_id;
  end if;
  if p_paid_on < date '2000-01-01' or p_paid_on > current_date + 1 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if not exists (select 1 from public.suppliers s where s.id = p_supplier_id and s.organization_id = p_organization_id) then
    raise exception 'invalid_reference' using errcode = '23503';
  end if;
  if p_purchase_order_id is not null and not exists (
    select 1 from public.purchase_orders po
    where po.id = p_purchase_order_id and po.organization_id = p_organization_id and po.supplier_id = p_supplier_id
  ) then
    raise exception 'invalid_reference' using errcode = '23503';
  end if;
  perform private.validate_payments(p_organization_id,
    jsonb_build_array(jsonb_build_object('method_id', p_method_id, 'amount_millimes', p_amount_millimes)));

  begin
    insert into public.supplier_payments
      (organization_id, supplier_id, method_id, kind, amount_millimes, paid_on, reference, note, purchase_order_id, idempotency_key, created_by)
    values (p_organization_id, p_supplier_id, p_method_id, p_kind, p_amount_millimes, p_paid_on,
            nullif(left(btrim(coalesce(p_reference, '')), 80), ''), nullif(left(btrim(coalesce(p_note, '')), 500), ''),
            p_purchase_order_id, p_idempotency_key, v_uid)
    returning id into v_id;
  exception when unique_violation then
    select sp.id into v_id from public.supplier_payments sp
    where sp.organization_id = p_organization_id and sp.idempotency_key = p_idempotency_key;
    if v_id is null then
      raise;
    end if;
    return v_id;
  end;

  perform private.write_audit(p_organization_id, 'supplier.' || p_kind || '_recorded', 'supplier', p_supplier_id,
    jsonb_build_object('amount_millimes', p_amount_millimes, 'payment_id', v_id));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
-- purchases = Σ value of goods received from the supplier (lines with a known cost)
-- paid      = Σ payments − Σ refunds
-- balance   = purchases − paid (negative = credit with the supplier)
create function public.supplier_balances(p_organization_id uuid)
returns table (
  supplier_id uuid,
  supplier_name text,
  purchases_millimes bigint,
  paid_millimes bigint,
  balance_millimes bigint,
  receipts_without_cost integer,
  last_receipt_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with purchases as (
    select r.supplier_id, sum(r.total_cost_millimes)::bigint as total,
           (count(*) filter (where r.lines_without_cost > 0))::integer as without_cost,
           max(r.created_at) as last_at
    from public.stock_receipts r
    where r.organization_id = p_organization_id and r.supplier_id is not null
    group by r.supplier_id
  ),
  payments as (
    select p.supplier_id,
           sum(case when p.kind = 'payment' then p.amount_millimes else -p.amount_millimes end)::bigint as total
    from public.supplier_payments p
    where p.organization_id = p_organization_id
    group by p.supplier_id
  )
  select s.id, s.name,
         coalesce(pu.total, 0), coalesce(pa.total, 0), coalesce(pu.total, 0) - coalesce(pa.total, 0),
         coalesce(pu.without_cost, 0), pu.last_at
  from public.suppliers s
  left join purchases pu on pu.supplier_id = s.id
  left join payments pa on pa.supplier_id = s.id
  where s.organization_id = p_organization_id and (pu.supplier_id is not null or pa.supplier_id is not null)
  order by 5 desc, s.name;
$$;

create function public.check_purchasing_consistency(p_organization_id uuid)
returns table (reference_id uuid, problem text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  return query
    select i.id, 'po_item_received' from public.purchase_order_items i
    where i.organization_id = p_organization_id
      and i.received_quantity <> coalesce((select sum(l.quantity) from public.stock_receipt_lines l
                                           where l.purchase_order_item_id = i.id), 0)
    union all
    select r.id, 'receipt_total' from public.stock_receipts r
    where r.organization_id = p_organization_id
      and (r.total_cost_millimes <> coalesce((select sum(l.quantity::numeric * l.unit_cost_millimes)::bigint
                                              from public.stock_receipt_lines l
                                              where l.receipt_id = r.id and l.unit_cost_millimes is not null), 0)
           or r.lines_without_cost <> (select count(*) from public.stock_receipt_lines l
                                       where l.receipt_id = r.id and l.unit_cost_millimes is null))
    union all
    select po.id, 'po_status' from public.purchase_orders po
    where po.organization_id = p_organization_id
      and ((po.status = 'received' and exists (select 1 from public.purchase_order_items i
                                               where i.purchase_order_id = po.id and i.received_quantity < i.quantity))
        or (po.status = 'ordered' and exists (select 1 from public.purchase_order_items i
                                              where i.purchase_order_id = po.id and i.received_quantity > 0)))
    union all
    select po.id, 'po_total' from public.purchase_orders po
    where po.organization_id = p_organization_id
      and po.ordered_total_millimes <> coalesce((select sum(i.quantity::numeric * i.unit_cost_millimes)::bigint
                                                 from public.purchase_order_items i where i.purchase_order_id = po.id), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.save_purchase_order(uuid, uuid, uuid, uuid, date, text, text, jsonb) from public, anon;
revoke execute on function public.place_purchase_order(uuid) from public, anon;
revoke execute on function public.cancel_purchase_order(uuid) from public, anon;
revoke execute on function public.close_purchase_order(uuid) from public, anon;
revoke execute on function public.receive_purchase_order(uuid, jsonb, text, text, boolean, uuid) from public, anon;
revoke execute on function public.record_supplier_payment(uuid, uuid, uuid, text, bigint, date, text, text, uuid, uuid) from public, anon;
revoke execute on function public.supplier_balances(uuid) from public, anon;
revoke execute on function public.check_purchasing_consistency(uuid) from public, anon;

grant execute on function public.save_purchase_order(uuid, uuid, uuid, uuid, date, text, text, jsonb) to authenticated;
grant execute on function public.place_purchase_order(uuid) to authenticated;
grant execute on function public.cancel_purchase_order(uuid) to authenticated;
grant execute on function public.close_purchase_order(uuid) to authenticated;
grant execute on function public.receive_purchase_order(uuid, jsonb, text, text, boolean, uuid) to authenticated;
grant execute on function public.record_supplier_payment(uuid, uuid, uuid, text, bigint, date, text, text, uuid, uuid) to authenticated;
grant execute on function public.supplier_balances(uuid) to authenticated;
grant execute on function public.check_purchasing_consistency(uuid) to authenticated;

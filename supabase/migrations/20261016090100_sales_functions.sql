-- SoukPilot — Milestone 4: sale operations.
-- See the rounding rules at the top of 20261016090000_sales.sql.

-- ---------------------------------------------------------------------------
-- Pricing (authoritative). Returns
-- { subtotal, line_discount, order_discount, total, lines: [ … ] }.
-- p_max_discount_bps NULL = no limit (owner/manager).
-- ---------------------------------------------------------------------------
create function private.compute_sale(
  p_organization_id uuid,
  p_lines jsonb,
  p_order_discount bigint,
  p_max_discount_bps integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_bad integer;
  v_distinct integer;
  v_lines jsonb := '[]'::jsonb;
  r record;
  v_gross numeric;
  v_discount numeric;
  v_subtotal numeric := 0;
  v_line_discount numeric := 0;
  v_order_discount numeric := coalesce(p_order_discount, 0);
  v_inactive text;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'invalid_lines' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_lines);
  if v_count < 1 or v_count > 200 then
    raise exception 'invalid_lines' using errcode = '22023';
  end if;

  select
    count(*) filter (where not (
      (l ->> 'variant_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jsonb_typeof(l -> 'quantity') = 'number'
      and case when (l ->> 'quantity') ~ '^[0-9]{1,7}$'
               then (l ->> 'quantity')::integer between 1 and 1000000 else false end
      and (
        l -> 'discount_bps' is null or l -> 'discount_bps' = 'null'::jsonb
        or (jsonb_typeof(l -> 'discount_bps') = 'number'
            and case when (l ->> 'discount_bps') ~ '^[0-9]{1,5}$'
                     then (l ->> 'discount_bps')::integer <= 10000 else false end)
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
  if v_order_discount < 0 then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) as t(l)
    where not exists (
      select 1 from public.product_variants v
      where v.id = (l ->> 'variant_id')::uuid and v.organization_id = p_organization_id
    )
  ) then
    raise exception 'invalid_reference' using errcode = '23503';
  end if;

  select private.variant_display_name(v.id) into v_inactive
  from jsonb_array_elements(p_lines) as t(l)
  join public.product_variants v on v.id = (l ->> 'variant_id')::uuid
  join public.products p on p.id = v.product_id
  where not (v.is_active and p.is_active)
  limit 1;
  if v_inactive is not null then
    raise exception 'variant_inactive' using errcode = '22023', detail = v_inactive;
  end if;

  for r in
    select
      t.ord::integer as line_no,
      v.id as variant_id,
      (t.l ->> 'quantity')::integer as quantity,
      coalesce((t.l ->> 'discount_bps')::integer, 0) as discount_bps,
      v.price_millimes,
      p.name as product_name,
      array_to_string(v.option_values, ' / ') as variant_label,
      p.track_stock,
      c.cost_millimes
    from jsonb_array_elements(p_lines) with ordinality as t(l, ord)
    join public.product_variants v on v.id = (t.l ->> 'variant_id')::uuid
    join public.products p on p.id = v.product_id
    left join public.product_variant_costs c on c.variant_id = v.id
    order by t.ord
  loop
    if p_max_discount_bps is not null and r.discount_bps > p_max_discount_bps then
      raise exception 'discount_not_allowed' using errcode = '42501';
    end if;
    v_gross := r.quantity::numeric * r.price_millimes;
    if v_gross > 1000000000000 then
      raise exception 'sale_amount_too_large' using errcode = '22023';
    end if;
    v_discount := round(v_gross * r.discount_bps / 10000);
    v_subtotal := v_subtotal + (v_gross - v_discount);
    v_line_discount := v_line_discount + v_discount;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'line_no', r.line_no,
      'variant_id', r.variant_id,
      'product_name', r.product_name,
      'variant_label', r.variant_label,
      'track_stock', r.track_stock,
      'quantity', r.quantity,
      'unit_price_millimes', r.price_millimes,
      'discount_bps', r.discount_bps,
      'gross_millimes', v_gross,
      'line_discount_millimes', v_discount,
      'line_total_millimes', v_gross - v_discount,
      'unit_cost_millimes', r.cost_millimes
    ));
  end loop;

  if v_subtotal > 1000000000000 then
    raise exception 'sale_amount_too_large' using errcode = '22023';
  end if;
  if v_order_discount > v_subtotal then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;
  if p_max_discount_bps is not null and v_order_discount > round(v_subtotal * p_max_discount_bps / 10000) then
    raise exception 'discount_not_allowed' using errcode = '42501';
  end if;

  -- Allocate the order discount: floor shares, then the leftover millimes to
  -- the largest remainders (ties: lower line number).
  with base as (
    select e, (e ->> 'line_no')::integer as line_no, (e ->> 'line_total_millimes')::numeric as lt
    from jsonb_array_elements(v_lines) as x(e)
  ),
  shares as (
    select e, line_no, lt,
           case when v_order_discount = 0 then 0 else floor(lt * v_order_discount / v_subtotal) end as fl,
           case when v_order_discount = 0 then 0 else mod(lt * v_order_discount, v_subtotal) end as rem
    from base
  ),
  ranked as (
    select *, row_number() over (order by rem desc, line_no) as rk,
           v_order_discount - sum(fl) over () as leftover
    from shares
  )
  select jsonb_agg(
           e || jsonb_build_object(
             'order_discount_share_millimes', fl + case when rk <= leftover then 1 else 0 end,
             'net_total_millimes', lt - fl - case when rk <= leftover then 1 else 0 end)
           order by line_no)
    into v_lines
  from ranked;

  return jsonb_build_object(
    'subtotal', v_subtotal,
    'line_discount', v_line_discount,
    'order_discount', v_order_discount,
    'total', v_subtotal - v_order_discount,
    'lines', v_lines
  );
end;
$$;
revoke execute on function private.compute_sale(uuid, jsonb, bigint, integer) from public;

-- Role-dependent discount ceiling: cashiers are capped by the org setting.
create function private.discount_ceiling(p_organization_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when m.role = 'cashier' then o.cashier_max_discount_bps else null end
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.organization_id = p_organization_id and m.user_id = auth.uid();
$$;
revoke execute on function private.discount_ceiling(uuid) from public;

create function private.require_customer(p_organization_id uuid, p_customer_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.organization_id = p_organization_id
  ) then
    raise exception 'invalid_reference' using errcode = '23503';
  end if;
end;
$$;
revoke execute on function private.require_customer(uuid, uuid) from public;

-- Replaces the lines of a DRAFT sale with freshly computed ones.
create function private.write_sale_items(p_organization_id uuid, p_sale_id uuid, p_computed jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.sale_items where sale_id = p_sale_id;
  insert into public.sale_items (
    organization_id, sale_id, line_no, variant_id, product_name, variant_label, track_stock, quantity,
    unit_price_millimes, discount_bps, gross_millimes, line_discount_millimes, line_total_millimes,
    order_discount_share_millimes, net_total_millimes)
  select p_organization_id, p_sale_id,
         (e ->> 'line_no')::integer, (e ->> 'variant_id')::uuid, e ->> 'product_name', e ->> 'variant_label',
         (e ->> 'track_stock')::boolean, (e ->> 'quantity')::integer, (e ->> 'unit_price_millimes')::bigint,
         (e ->> 'discount_bps')::integer, (e ->> 'gross_millimes')::bigint, (e ->> 'line_discount_millimes')::bigint,
         (e ->> 'line_total_millimes')::bigint, (e ->> 'order_discount_share_millimes')::bigint,
         (e ->> 'net_total_millimes')::bigint
  from jsonb_array_elements(p_computed -> 'lines') as x(e);
end;
$$;
revoke execute on function private.write_sale_items(uuid, uuid, jsonb) from public;

-- Validates p_payments: [{ "method_id", "amount_millimes" > 0 }] (≤ 10). Returns the sum.
create function private.validate_payments(p_organization_id uuid, p_payments jsonb)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bad integer;
  v_sum numeric;
begin
  if p_payments is null or p_payments = 'null'::jsonb then
    return 0;
  end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) > 10 then
    raise exception 'invalid_payment' using errcode = '22023';
  end if;
  select count(*) filter (where not (
           (p ->> 'method_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           and jsonb_typeof(p -> 'amount_millimes') = 'number'
           and case when (p ->> 'amount_millimes') ~ '^[0-9]{1,13}$'
                    then (p ->> 'amount_millimes')::bigint between 1 and 1000000000000 else false end
           and exists (select 1 from public.payment_methods m
                       where m.id = (p ->> 'method_id')::uuid and m.organization_id = p_organization_id and m.is_active))),
         coalesce(sum(case when (p ->> 'amount_millimes') ~ '^[0-9]{1,13}$' then (p ->> 'amount_millimes')::numeric else 0 end), 0)
    into v_bad, v_sum
  from jsonb_array_elements(p_payments) as t(p);
  if v_bad > 0 then
    raise exception 'invalid_payment' using errcode = '22023';
  end if;
  return v_sum::bigint;
end;
$$;
revoke execute on function private.validate_payments(uuid, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Drafts
-- ---------------------------------------------------------------------------
create function public.save_sale_draft(
  p_organization_id uuid,
  p_sale_id uuid,
  p_location_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_order_discount_millimes bigint,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_org_role(p_organization_id, array['owner', 'manager', 'cashier']::public.org_role[]);
  v_computed jsonb;
  v_id uuid;
  v_status text;
begin
  v_computed := private.compute_sale(p_organization_id, p_lines, p_order_discount_millimes, private.discount_ceiling(p_organization_id));
  perform private.require_active_location(p_organization_id, p_location_id);
  perform private.require_customer(p_organization_id, p_customer_id);

  if p_sale_id is null then
    insert into public.sales (organization_id, location_id, customer_id, note, subtotal_millimes, line_discount_millimes,
                              order_discount_millimes, total_millimes, created_by)
    values (p_organization_id, p_location_id, p_customer_id, nullif(left(btrim(coalesce(p_note, '')), 500), ''),
            (v_computed ->> 'subtotal')::bigint, (v_computed ->> 'line_discount')::bigint,
            (v_computed ->> 'order_discount')::bigint, (v_computed ->> 'total')::bigint, v_uid)
    returning id into v_id;
  else
    select s.status into v_status from public.sales s
    where s.id = p_sale_id and s.organization_id = p_organization_id
    for update;
    if not found then
      raise exception 'sale_not_found' using errcode = 'P0002';
    end if;
    if v_status <> 'draft' then
      raise exception 'sale_not_draft' using errcode = '22023';
    end if;
    update public.sales
    set location_id = p_location_id, customer_id = p_customer_id,
        note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
        subtotal_millimes = (v_computed ->> 'subtotal')::bigint,
        line_discount_millimes = (v_computed ->> 'line_discount')::bigint,
        order_discount_millimes = (v_computed ->> 'order_discount')::bigint,
        total_millimes = (v_computed ->> 'total')::bigint
    where id = p_sale_id;
    v_id := p_sale_id;
  end if;

  perform private.write_sale_items(p_organization_id, v_id, v_computed);
  return v_id;
end;
$$;

create function public.cancel_sale_draft(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_uid uuid := private.require_user();
begin
  select * into v_sale from public.sales s where s.id = p_sale_id for update;
  if not found or not private.is_org_member(v_sale.organization_id) then
    raise exception 'sale_not_found' using errcode = 'P0002';
  end if;
  if v_sale.status <> 'draft' then
    raise exception 'sale_not_draft' using errcode = '22023';
  end if;
  update public.sales set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid where id = p_sale_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- finalize_sale: the single transaction that turns a cart into a sale.
--   prices recomputed from the DB → sale + lines + cost snapshots → stock
--   movements (insufficient stock aborts everything) → payments → audit.
-- Idempotent on p_idempotency_key (also under concurrency).
-- p_sale_id: optional draft to finalize (its lines are replaced by p_lines).
-- ---------------------------------------------------------------------------
create function public.finalize_sale(
  p_organization_id uuid,
  p_sale_id uuid,
  p_location_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_order_discount_millimes bigint,
  p_note text,
  p_payments jsonb,
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
  v_sale public.sales;
  v_computed jsonb;
  v_total bigint;
  v_paid bigint;
  v_stock jsonb;
begin
  if p_idempotency_key is null then
    raise exception 'invalid_parameter' using errcode = '22023';
  end if;
  select s.id into v_id from public.sales s
  where s.organization_id = p_organization_id and s.finalize_idempotency_key = p_idempotency_key and s.status = 'finalized';
  if found then
    return v_id;
  end if;

  v_computed := private.compute_sale(p_organization_id, p_lines, p_order_discount_millimes, private.discount_ceiling(p_organization_id));
  v_total := (v_computed ->> 'total')::bigint;
  perform private.require_active_location(p_organization_id, p_location_id);
  perform private.require_customer(p_organization_id, p_customer_id);
  v_paid := private.validate_payments(p_organization_id, p_payments);
  if v_paid > v_total then
    raise exception 'payment_exceeds_balance' using errcode = '22023';
  end if;
  if v_paid < v_total and p_customer_id is null then
    raise exception 'customer_required_for_credit' using errcode = '22023';
  end if;

  if p_sale_id is not null then
    select * into v_sale from public.sales s
    where s.id = p_sale_id and s.organization_id = p_organization_id
    for update;
    if not found then
      raise exception 'sale_not_found' using errcode = 'P0002';
    end if;
    if v_sale.status = 'finalized' and v_sale.finalize_idempotency_key = p_idempotency_key then
      return v_sale.id;
    end if;
    if v_sale.status <> 'draft' then
      raise exception 'sale_not_draft' using errcode = '22023';
    end if;
    v_id := p_sale_id;
    update public.sales
    set location_id = p_location_id, customer_id = p_customer_id,
        note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
        subtotal_millimes = (v_computed ->> 'subtotal')::bigint,
        line_discount_millimes = (v_computed ->> 'line_discount')::bigint,
        order_discount_millimes = (v_computed ->> 'order_discount')::bigint,
        total_millimes = v_total,
        finalize_idempotency_key = p_idempotency_key
    where id = v_id;
  else
    begin
      insert into public.sales (organization_id, location_id, customer_id, note, subtotal_millimes, line_discount_millimes,
                                order_discount_millimes, total_millimes, finalize_idempotency_key, created_by)
      values (p_organization_id, p_location_id, p_customer_id, nullif(left(btrim(coalesce(p_note, '')), 500), ''),
              (v_computed ->> 'subtotal')::bigint, (v_computed ->> 'line_discount')::bigint,
              (v_computed ->> 'order_discount')::bigint, v_total, p_idempotency_key, v_uid)
      returning id into v_id;
    exception when unique_violation then
      -- Same key submitted concurrently: the other request created the sale.
      select s.id into v_id from public.sales s
      where s.organization_id = p_organization_id and s.finalize_idempotency_key = p_idempotency_key;
      if v_id is null then
        raise;
      end if;
      return v_id;
    end;
  end if;

  perform private.write_sale_items(p_organization_id, v_id, v_computed);

  insert into public.sale_item_costs (sale_item_id, organization_id, unit_cost_millimes)
  select i.id, p_organization_id, (e ->> 'unit_cost_millimes')::bigint
  from public.sale_items i
  join jsonb_array_elements(v_computed -> 'lines') as x(e) on (e ->> 'line_no')::integer = i.line_no
  where i.sale_id = v_id;

  update public.sales
  set status = 'finalized',
      number = private.next_document_number(p_organization_id, 'sale'),
      finalized_at = now(),
      finalized_by = v_uid,
      paid_millimes = v_paid
  where id = v_id;

  select jsonb_agg(jsonb_build_object('location_id', p_location_id, 'variant_id', e -> 'variant_id',
                                      'delta', -((e ->> 'quantity')::integer)))
    into v_stock
  from jsonb_array_elements(v_computed -> 'lines') as x(e)
  where (e ->> 'track_stock')::boolean;
  if v_stock is not null then
    perform private.apply_stock_lines(p_organization_id, 'sale', 'sale', v_id, null, v_stock);
  end if;

  insert into public.sale_payments (organization_id, sale_id, method_id, kind, amount_millimes, created_by)
  select p_organization_id, v_id, (p ->> 'method_id')::uuid, 'payment', (p ->> 'amount_millimes')::bigint, v_uid
  from jsonb_array_elements(coalesce(nullif(p_payments, 'null'::jsonb), '[]'::jsonb)) as t(p);

  perform private.write_audit(p_organization_id, 'sale.finalized', 'sale', v_id,
    jsonb_build_object('total_millimes', v_total, 'paid_millimes', v_paid, 'lines', jsonb_array_length(v_computed -> 'lines')));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Later payments (credit sales)
-- ---------------------------------------------------------------------------
create function public.record_sale_payment(
  p_sale_id uuid,
  p_method_id uuid,
  p_amount_millimes bigint,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_sale public.sales;
  v_id uuid;
begin
  select * into v_sale from public.sales s where s.id = p_sale_id for update;
  if not found or not private.is_org_member(v_sale.organization_id) then
    raise exception 'sale_not_found' using errcode = 'P0002';
  end if;
  if p_idempotency_key is null then
    raise exception 'invalid_parameter' using errcode = '22023';
  end if;
  select sp.id into v_id from public.sale_payments sp
  where sp.organization_id = v_sale.organization_id and sp.idempotency_key = p_idempotency_key;
  if found then
    return v_id;
  end if;
  if v_sale.status <> 'finalized' then
    raise exception 'sale_not_finalized' using errcode = '22023';
  end if;
  perform private.validate_payments(v_sale.organization_id,
    jsonb_build_array(jsonb_build_object('method_id', p_method_id, 'amount_millimes', p_amount_millimes)));
  if p_amount_millimes > v_sale.total_millimes - v_sale.returned_millimes - v_sale.paid_millimes then
    raise exception 'payment_exceeds_balance' using errcode = '22023';
  end if;

  insert into public.sale_payments (organization_id, sale_id, method_id, kind, amount_millimes, idempotency_key, created_by)
  values (v_sale.organization_id, p_sale_id, p_method_id, 'payment', p_amount_millimes, p_idempotency_key, v_uid)
  returning id into v_id;
  update public.sales set paid_millimes = paid_millimes + p_amount_millimes where id = p_sale_id;

  perform private.write_audit(v_sale.organization_id, 'sale.payment_recorded', 'sale', p_sale_id,
    jsonb_build_object('amount_millimes', p_amount_millimes, 'method_id', p_method_id));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Returns (owner/manager): explicit reversal document.
-- p_lines: [{ "sale_item_id", "quantity" > 0, "restock": bool }]
-- restock = goods are resellable and go back to the sale's location.
-- Optional refund, limited to what the customer overpaid after the return.
-- ---------------------------------------------------------------------------
create function public.create_sale_return(
  p_sale_id uuid,
  p_lines jsonb,
  p_reason text,
  p_refund_method_id uuid,
  p_refund_amount_millimes bigint,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_sale public.sales;
  v_id uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_bad integer;
  v_distinct integer;
  r record;
  v_amount numeric;
  v_total_amount numeric := 0;
  v_items jsonb := '[]'::jsonb;
  v_stock jsonb := '[]'::jsonb;
  v_refundable bigint;
begin
  select * into v_sale from public.sales s where s.id = p_sale_id for update;
  if not found or not private.is_org_member(v_sale.organization_id) then
    raise exception 'sale_not_found' using errcode = 'P0002';
  end if;
  v_uid := private.require_org_role(v_sale.organization_id, array['owner', 'manager']::public.org_role[]);
  if p_idempotency_key is null then
    raise exception 'invalid_parameter' using errcode = '22023';
  end if;
  select sr.id into v_id from public.sale_returns sr
  where sr.organization_id = v_sale.organization_id and sr.idempotency_key = p_idempotency_key;
  if found then
    return v_id;
  end if;
  if v_sale.status <> 'finalized' then
    raise exception 'sale_not_finalized' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 200 then
    raise exception 'invalid_lines' using errcode = '22023';
  end if;
  select count(*) filter (where not (
           (l ->> 'sale_item_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           and jsonb_typeof(l -> 'quantity') = 'number'
           and case when (l ->> 'quantity') ~ '^[0-9]{1,7}$' then (l ->> 'quantity')::integer >= 1 else false end
           and jsonb_typeof(l -> 'restock') = 'boolean')),
         count(distinct lower(l ->> 'sale_item_id'))
    into v_bad, v_distinct
  from jsonb_array_elements(p_lines) as t(l);
  if v_bad > 0 then
    raise exception 'invalid_lines' using errcode = '22023';
  end if;
  if v_distinct <> jsonb_array_length(p_lines) then
    raise exception 'duplicate_line' using errcode = '22023';
  end if;

  for r in
    select (l ->> 'sale_item_id')::uuid as item_id, (l ->> 'quantity')::integer as qty, (l ->> 'restock')::boolean as restock
    from jsonb_array_elements(p_lines) as t(l)
    order by 1
  loop
    declare
      v_item public.sale_items;
    begin
      select * into v_item from public.sale_items i where i.id = r.item_id and i.sale_id = p_sale_id for update;
      if not found then
        raise exception 'invalid_reference' using errcode = '23503';
      end if;
      if r.qty > v_item.quantity - v_item.returned_quantity then
        raise exception 'return_exceeds_sold' using errcode = '22023',
          detail = v_item.product_name || case when v_item.variant_label <> '' then ' (' || v_item.variant_label || ')' else '' end
                   || ' — retournable : ' || (v_item.quantity - v_item.returned_quantity);
      end if;
      -- Cumulative rounding: a full return refunds exactly the line's net total.
      v_amount := round(v_item.net_total_millimes::numeric * (v_item.returned_quantity + r.qty) / v_item.quantity)
                - round(v_item.net_total_millimes::numeric * v_item.returned_quantity / v_item.quantity);
      v_total_amount := v_total_amount + v_amount;

      update public.sale_items
      set returned_quantity = returned_quantity + r.qty, returned_millimes = returned_millimes + v_amount::bigint
      where id = v_item.id;

      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'sale_item_id', v_item.id, 'quantity', r.qty, 'restock', r.restock, 'amount', v_amount));
      if r.restock and v_item.track_stock then
        v_stock := v_stock || jsonb_build_array(jsonb_build_object(
          'location_id', v_sale.location_id, 'variant_id', v_item.variant_id, 'delta', r.qty));
      end if;
    end;
  end loop;

  insert into public.sale_returns (organization_id, sale_id, number, reason, amount_millimes, idempotency_key, created_by)
  values (v_sale.organization_id, p_sale_id, private.next_document_number(v_sale.organization_id, 'sale_return'),
          v_reason, v_total_amount::bigint, p_idempotency_key, v_uid)
  returning id into v_id;

  insert into public.sale_return_items (return_id, organization_id, sale_item_id, quantity, restock, amount_millimes)
  select v_id, v_sale.organization_id, (i ->> 'sale_item_id')::uuid, (i ->> 'quantity')::integer,
         (i ->> 'restock')::boolean, (i ->> 'amount')::bigint
  from jsonb_array_elements(v_items) as x(i);

  update public.sales set returned_millimes = returned_millimes + v_total_amount::bigint where id = p_sale_id;

  if jsonb_array_length(v_stock) > 0 then
    perform private.apply_stock_lines(v_sale.organization_id, 'customer_return', 'sale_return', v_id, v_reason, v_stock);
  end if;

  if coalesce(p_refund_amount_millimes, 0) > 0 then
    perform private.validate_payments(v_sale.organization_id,
      jsonb_build_array(jsonb_build_object('method_id', p_refund_method_id, 'amount_millimes', p_refund_amount_millimes)));
    select s.paid_millimes - (s.total_millimes - s.returned_millimes) into v_refundable
    from public.sales s where s.id = p_sale_id;
    if p_refund_amount_millimes > v_refundable then
      raise exception 'refund_exceeds_balance' using errcode = '22023';
    end if;
    insert into public.sale_payments (organization_id, sale_id, method_id, kind, amount_millimes, return_id, created_by)
    values (v_sale.organization_id, p_sale_id, p_refund_method_id, 'refund', p_refund_amount_millimes, v_id, v_uid);
    update public.sales set paid_millimes = paid_millimes - p_refund_amount_millimes where id = p_sale_id;
  end if;

  perform private.write_audit(v_sale.organization_id, 'sale.returned', 'sale', p_sale_id,
    jsonb_build_object('return_id', v_id, 'amount_millimes', v_total_amount, 'refund_millimes', coalesce(p_refund_amount_millimes, 0)));
  return v_id;
end;
$$;

-- Refund later (owner/manager), limited to the overpaid amount.
create function public.record_sale_refund(
  p_sale_id uuid,
  p_method_id uuid,
  p_amount_millimes bigint,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_sale public.sales;
  v_id uuid;
begin
  select * into v_sale from public.sales s where s.id = p_sale_id for update;
  if not found or not private.is_org_member(v_sale.organization_id) then
    raise exception 'sale_not_found' using errcode = 'P0002';
  end if;
  v_uid := private.require_org_role(v_sale.organization_id, array['owner', 'manager']::public.org_role[]);
  if p_idempotency_key is null then
    raise exception 'invalid_parameter' using errcode = '22023';
  end if;
  select sp.id into v_id from public.sale_payments sp
  where sp.organization_id = v_sale.organization_id and sp.idempotency_key = p_idempotency_key;
  if found then
    return v_id;
  end if;
  perform private.validate_payments(v_sale.organization_id,
    jsonb_build_array(jsonb_build_object('method_id', p_method_id, 'amount_millimes', p_amount_millimes)));
  if p_amount_millimes > v_sale.paid_millimes - (v_sale.total_millimes - v_sale.returned_millimes) then
    raise exception 'refund_exceeds_balance' using errcode = '22023';
  end if;
  insert into public.sale_payments (organization_id, sale_id, method_id, kind, amount_millimes, idempotency_key, created_by)
  values (v_sale.organization_id, p_sale_id, p_method_id, 'refund', p_amount_millimes, p_idempotency_key, v_uid)
  returning id into v_id;
  update public.sales set paid_millimes = paid_millimes - p_amount_millimes where id = p_sale_id;
  perform private.write_audit(v_sale.organization_id, 'sale.refund_recorded', 'sale', p_sale_id,
    jsonb_build_object('amount_millimes', p_amount_millimes, 'method_id', p_method_id));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

-- Daily summary in the ORGANIZATION's timezone. Definitions:
--   sales_total     = Σ total of sales finalized that day (after discounts)
--   returns         = Σ return amounts created that day (any sale date)
--   net_sales       = sales_total − returns
--   payments        = per method: received, refunded, net (money movements that day)
--   credit_given    = Σ balance still due on that day's sales (as of now)
create function public.sales_daily_summary(p_organization_id uuid, p_day date, p_location_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with org as (
    select o.timezone from public.organizations o where o.id = p_organization_id
  ),
  bounds as (
    select (p_day::timestamp at time zone org.timezone) as start_at,
           ((p_day + 1)::timestamp at time zone org.timezone) as end_at
    from org
  ),
  day_sales as (
    select s.* from public.sales s, bounds b
    where s.organization_id = p_organization_id and s.status = 'finalized'
      and s.finalized_at >= b.start_at and s.finalized_at < b.end_at
      and (p_location_id is null or s.location_id = p_location_id)
  ),
  day_returns as (
    select r.* from public.sale_returns r
    join public.sales s on s.id = r.sale_id, bounds b
    where r.organization_id = p_organization_id
      and r.created_at >= b.start_at and r.created_at < b.end_at
      and (p_location_id is null or s.location_id = p_location_id)
  ),
  day_payments as (
    select p.* from public.sale_payments p
    join public.sales s on s.id = p.sale_id, bounds b
    where p.organization_id = p_organization_id
      and p.created_at >= b.start_at and p.created_at < b.end_at
      and (p_location_id is null or s.location_id = p_location_id)
  ),
  by_method as (
    select m.id, m.label, m.kind, m.sort_order,
           coalesce(sum(p.amount_millimes) filter (where p.kind = 'payment'), 0) as received,
           coalesce(sum(p.amount_millimes) filter (where p.kind = 'refund'), 0) as refunded
    from day_payments p
    join public.payment_methods m on m.id = p.method_id
    group by m.id, m.label, m.kind, m.sort_order
  )
  select case when not exists (select 1 from org) then null else jsonb_build_object(
    'day', p_day,
    'timezone', (select timezone from org),
    'sales_count', (select count(*) from day_sales),
    'gross_millimes', (select coalesce(sum(subtotal_millimes + line_discount_millimes), 0) from day_sales),
    'discount_millimes', (select coalesce(sum(line_discount_millimes + order_discount_millimes), 0) from day_sales),
    'sales_total_millimes', (select coalesce(sum(total_millimes), 0) from day_sales),
    'returns_count', (select count(*) from day_returns),
    'returns_millimes', (select coalesce(sum(amount_millimes), 0) from day_returns),
    'net_sales_millimes', (select coalesce(sum(total_millimes), 0) from day_sales)
                          - (select coalesce(sum(amount_millimes), 0) from day_returns),
    'credit_given_millimes', (select coalesce(sum(greatest(total_millimes - returned_millimes - paid_millimes, 0)), 0) from day_sales),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
                   'method_id', id, 'label', label, 'kind', kind,
                   'received_millimes', received, 'refunded_millimes', refunded, 'net_millimes', received - refunded)
                   order by sort_order, label) from by_method), '[]'::jsonb)
  ) end;
$$;

-- Outstanding balances per customer (credit sales).
create function public.customer_balances(p_organization_id uuid)
returns table (customer_id uuid, customer_name text, sales_count bigint, balance_millimes bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.name, count(s.id), sum(s.total_millimes - s.returned_millimes - s.paid_millimes)::bigint
  from public.sales s
  join public.customers c on c.id = s.customer_id
  where s.organization_id = p_organization_id and s.status = 'finalized'
  group by c.id, c.name
  having sum(s.total_millimes - s.returned_millimes - s.paid_millimes) <> 0
  order by 4 desc;
$$;

-- Integrity check: stored aggregates must equal their detail rows.
create function public.check_sales_consistency(p_organization_id uuid)
returns table (sale_id uuid, problem text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  return query
    select s.id, 'paid' from public.sales s
    where s.organization_id = p_organization_id
      and s.paid_millimes <> coalesce((select sum(case when p.kind = 'payment' then p.amount_millimes else -p.amount_millimes end)
                                       from public.sale_payments p where p.sale_id = s.id), 0)
    union all
    select s.id, 'total' from public.sales s
    where s.organization_id = p_organization_id and s.status = 'finalized'
      and s.total_millimes <> coalesce((select sum(i.net_total_millimes) from public.sale_items i where i.sale_id = s.id), 0)
    union all
    select s.id, 'returned' from public.sales s
    where s.organization_id = p_organization_id
      and s.returned_millimes <> coalesce((select sum(r.amount_millimes) from public.sale_returns r where r.sale_id = s.id), 0)
    union all
    select i.sale_id, 'returned_quantity' from public.sale_items i
    where i.organization_id = p_organization_id
      and (i.returned_quantity <> coalesce((select sum(ri.quantity) from public.sale_return_items ri where ri.sale_item_id = i.id), 0)
        or i.returned_millimes <> coalesce((select sum(ri.amount_millimes) from public.sale_return_items ri where ri.sale_item_id = i.id), 0))
    union all
    select s.id, 'stock' from public.sales s
    where s.organization_id = p_organization_id and s.status = 'finalized'
      and exists (
        select 1 from public.sale_items i
        where i.sale_id = s.id and i.track_stock
          and coalesce((select -sum(m.quantity_delta) from public.stock_movements m
                        where m.source_type = 'sale' and m.source_id = s.id and m.variant_id = i.variant_id), 0) <> i.quantity);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.save_sale_draft(uuid, uuid, uuid, uuid, jsonb, bigint, text) from public, anon;
revoke execute on function public.cancel_sale_draft(uuid) from public, anon;
revoke execute on function public.finalize_sale(uuid, uuid, uuid, uuid, jsonb, bigint, text, jsonb, uuid) from public, anon;
revoke execute on function public.record_sale_payment(uuid, uuid, bigint, uuid) from public, anon;
revoke execute on function public.create_sale_return(uuid, jsonb, text, uuid, bigint, uuid) from public, anon;
revoke execute on function public.record_sale_refund(uuid, uuid, bigint, uuid) from public, anon;
revoke execute on function public.sales_daily_summary(uuid, date, uuid) from public, anon;
revoke execute on function public.customer_balances(uuid) from public, anon;
revoke execute on function public.check_sales_consistency(uuid) from public, anon;

grant execute on function public.save_sale_draft(uuid, uuid, uuid, uuid, jsonb, bigint, text) to authenticated;
grant execute on function public.cancel_sale_draft(uuid) to authenticated;
grant execute on function public.finalize_sale(uuid, uuid, uuid, uuid, jsonb, bigint, text, jsonb, uuid) to authenticated;
grant execute on function public.record_sale_payment(uuid, uuid, bigint, uuid) to authenticated;
grant execute on function public.create_sale_return(uuid, jsonb, text, uuid, bigint, uuid) to authenticated;
grant execute on function public.record_sale_refund(uuid, uuid, bigint, uuid) to authenticated;
grant execute on function public.sales_daily_summary(uuid, date, uuid) to authenticated;
grant execute on function public.customer_balances(uuid) to authenticated;
grant execute on function public.check_sales_consistency(uuid) to authenticated;

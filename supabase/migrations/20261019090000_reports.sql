-- SoukPilot — Modernization phase 3 / Milestone 6: reports.
--
-- Read-only functions; no table or data change. Owner/manager only (they
-- expose purchase costs and margins): SECURITY DEFINER + explicit role check,
-- every query filtered on the organization.
--
-- Definitions (documented in docs/REPORTS.md, same as sales_daily_summary):
--   * Days are calendar days in the ORGANIZATION's time zone.
--   * A sale counts on the day it was finalized; a return on the day it was
--     recorded; a payment/refund on the day it was received/paid.
--   * Sales total = Σ sale totals (all discounts deducted).
--   * Net sales = sales total − returns of the period.
--   * Cost = quantity × unit cost snapshotted when the sale was finalized
--     (current purchase cost at that moment). Lines whose cost was unknown are
--     EXCLUDED from cost and margin and reported separately as
--     "revenue without cost", so the margin is never overstated silently.
--   * Estimated margin = (net sales − revenue without cost) − cost of sales.
--   * Product / category reports: lines of sales finalized in the period,
--     minus the returns already recorded on those lines (whatever their date).

create function private.require_report_period(p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function private.require_report_period(date, date) from public;

-- ---------------------------------------------------------------------------
-- Sales per day (one row per day of the period, zero days included).
-- ---------------------------------------------------------------------------
create function public.report_sales_by_day(
  p_organization_id uuid,
  p_from date,
  p_to date,
  p_location_id uuid default null
)
returns table (
  day date,
  sales_count bigint,
  gross_millimes bigint,
  discount_millimes bigint,
  sales_total_millimes bigint,
  returns_count bigint,
  returns_millimes bigint,
  net_sales_millimes bigint,
  credit_given_millimes bigint,
  cost_millimes bigint,
  margin_millimes bigint,
  revenue_without_cost_millimes bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
begin
  perform private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  perform private.require_report_period(p_from, p_to);
  select o.timezone into v_tz from public.organizations o where o.id = p_organization_id;

  return query
  with days as (
    select d::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as d
  ),
  bounds as (
    select (p_from::timestamp at time zone v_tz) as start_at, ((p_to + 1)::timestamp at time zone v_tz) as end_at
  ),
  sales as (
    select s.*, (s.finalized_at at time zone v_tz)::date as day
    from public.sales s, bounds b
    where s.organization_id = p_organization_id and s.status = 'finalized'
      and s.finalized_at >= b.start_at and s.finalized_at < b.end_at
      and (p_location_id is null or s.location_id = p_location_id)
  ),
  sold_lines as (
    select s.day, i.net_total_millimes as revenue, i.quantity, c.unit_cost_millimes as unit_cost
    from sales s
    join public.sale_items i on i.sale_id = s.id
    left join public.sale_item_costs c on c.sale_item_id = i.id
  ),
  returns as (
    select r.*, (r.created_at at time zone v_tz)::date as day
    from public.sale_returns r
    join public.sales s on s.id = r.sale_id, bounds b
    where r.organization_id = p_organization_id
      and r.created_at >= b.start_at and r.created_at < b.end_at
      and (p_location_id is null or s.location_id = p_location_id)
  ),
  returned_lines as (
    select r.day, ri.amount_millimes as revenue, ri.quantity, c.unit_cost_millimes as unit_cost
    from returns r
    join public.sale_return_items ri on ri.return_id = r.id
    left join public.sale_item_costs c on c.sale_item_id = ri.sale_item_id
  ),
  line_totals as (
    select day,
           sum(case when unit_cost is not null then quantity * unit_cost else 0 end) as cost,
           sum(case when unit_cost is null then revenue else 0 end) as without_cost
    from (
      select day, revenue, quantity, unit_cost from sold_lines
      union all
      select day, -revenue, -quantity, unit_cost from returned_lines
    ) l
    group by day
  )
  select
    d.day,
    (select count(*) from sales s where s.day = d.day),
    (select coalesce(sum(s.subtotal_millimes + s.line_discount_millimes), 0) from sales s where s.day = d.day)::bigint,
    (select coalesce(sum(s.line_discount_millimes + s.order_discount_millimes), 0) from sales s where s.day = d.day)::bigint,
    (select coalesce(sum(s.total_millimes), 0) from sales s where s.day = d.day)::bigint,
    (select count(*) from returns r where r.day = d.day),
    (select coalesce(sum(r.amount_millimes), 0) from returns r where r.day = d.day)::bigint,
    ((select coalesce(sum(s.total_millimes), 0) from sales s where s.day = d.day)
      - (select coalesce(sum(r.amount_millimes), 0) from returns r where r.day = d.day))::bigint,
    (select coalesce(sum(greatest(s.total_millimes - s.returned_millimes - s.paid_millimes, 0)), 0) from sales s where s.day = d.day)::bigint,
    coalesce(lt.cost, 0)::bigint,
    ((select coalesce(sum(s.total_millimes), 0) from sales s where s.day = d.day)
      - (select coalesce(sum(r.amount_millimes), 0) from returns r where r.day = d.day)
      - coalesce(lt.without_cost, 0) - coalesce(lt.cost, 0))::bigint,
    coalesce(lt.without_cost, 0)::bigint
  from days d
  left join line_totals lt on lt.day = d.day
  order by d.day;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sales by product or by category.
-- p_group: 'product' (default) or 'category'. p_sort: revenue (default),
-- quantity, margin.
-- ---------------------------------------------------------------------------
create function public.report_sales_by_product(
  p_organization_id uuid,
  p_from date,
  p_to date,
  p_group text default 'product',
  p_sort text default 'revenue',
  p_limit integer default 20
)
returns table (
  group_id uuid,
  label text,
  category_name text,
  quantity bigint,
  revenue_millimes bigint,
  cost_millimes bigint,
  margin_millimes bigint,
  revenue_without_cost_millimes bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
begin
  perform private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  perform private.require_report_period(p_from, p_to);
  select o.timezone into v_tz from public.organizations o where o.id = p_organization_id;

  return query
  with lines as (
    select
      p.id as product_id,
      p.name as product_name,
      p.category_id,
      cat.name as category_name,
      (i.quantity - i.returned_quantity) as quantity,
      (i.net_total_millimes - i.returned_millimes) as revenue,
      c.unit_cost_millimes as unit_cost
    from public.sales s
    join public.sale_items i on i.sale_id = s.id
    join public.product_variants v on v.id = i.variant_id
    join public.products p on p.id = v.product_id
    left join public.categories cat on cat.id = p.category_id
    left join public.sale_item_costs c on c.sale_item_id = i.id
    where s.organization_id = p_organization_id and s.status = 'finalized'
      and s.finalized_at >= (p_from::timestamp at time zone v_tz)
      and s.finalized_at < ((p_to + 1)::timestamp at time zone v_tz)
  ),
  grouped as (
    select
      case when p_group = 'category' then l.category_id else l.product_id end as group_id,
      case when p_group = 'category' then min(l.category_name) else min(l.product_name) end as label,
      min(l.category_name) as category_name,
      sum(l.quantity)::bigint as quantity,
      sum(l.revenue)::bigint as revenue,
      sum(case when l.unit_cost is not null then l.quantity * l.unit_cost else 0 end)::bigint as cost,
      sum(case when l.unit_cost is not null then l.revenue - l.quantity * l.unit_cost else 0 end)::bigint as margin,
      sum(case when l.unit_cost is null then l.revenue else 0 end)::bigint as without_cost
    from lines l
    group by 1
  )
  select g.group_id, g.label, g.category_name, g.quantity, g.revenue, g.cost, g.margin, g.without_cost, count(*) over ()
  from grouped g
  order by
    case when p_sort = 'quantity' then g.quantity end desc,
    case when p_sort = 'margin' then g.margin end desc,
    g.revenue desc, g.label
  limit least(greatest(coalesce(p_limit, 20), 1), 500);
end;
$$;

-- ---------------------------------------------------------------------------
-- Money received per payment method (payments − refunds), by day received.
-- ---------------------------------------------------------------------------
create function public.report_payments_by_method(
  p_organization_id uuid,
  p_from date,
  p_to date
)
returns table (
  method_id uuid,
  label text,
  kind text,
  received_millimes bigint,
  refunded_millimes bigint,
  net_millimes bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
begin
  perform private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  perform private.require_report_period(p_from, p_to);
  select o.timezone into v_tz from public.organizations o where o.id = p_organization_id;

  return query
  select m.id, m.label, m.kind::text,
         coalesce(sum(p.amount_millimes) filter (where p.kind = 'payment'), 0)::bigint,
         coalesce(sum(p.amount_millimes) filter (where p.kind = 'refund'), 0)::bigint,
         (coalesce(sum(p.amount_millimes) filter (where p.kind = 'payment'), 0)
          - coalesce(sum(p.amount_millimes) filter (where p.kind = 'refund'), 0))::bigint
  from public.sale_payments p
  join public.payment_methods m on m.id = p.method_id
  where p.organization_id = p_organization_id
    and p.created_at >= (p_from::timestamp at time zone v_tz)
    and p.created_at < ((p_to + 1)::timestamp at time zone v_tz)
  group by m.id, m.label, m.kind, m.sort_order
  order by m.sort_order, m.label;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard counters for owners and managers ("what needs attention").
-- ---------------------------------------------------------------------------
create function public.dashboard_attention(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date;
begin
  perform private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  select (now() at time zone o.timezone)::date into v_today from public.organizations o where o.id = p_organization_id;

  return jsonb_build_object(
    'pending_adjustments', (select count(*) from public.stock_adjustments a
                            where a.organization_id = p_organization_id and a.status = 'pending'),
    'submitted_counts', (select count(*) from public.stock_counts c
                         where c.organization_id = p_organization_id and c.status = 'submitted'),
    'late_purchase_orders', (select count(*) from public.purchase_orders po
                             where po.organization_id = p_organization_id
                               and po.status in ('ordered', 'partially_received')
                               and po.expected_date < v_today),
    'customers_owing', (select count(*) from (
                          select s.customer_id from public.sales s
                          where s.organization_id = p_organization_id and s.status = 'finalized' and s.customer_id is not null
                          group by s.customer_id
                          having sum(s.total_millimes - s.returned_millimes - s.paid_millimes) > 0) x),
    'customer_credit_millimes', (select coalesce(sum(greatest(b, 0)), 0) from (
                          select sum(s.total_millimes - s.returned_millimes - s.paid_millimes) as b from public.sales s
                          where s.organization_id = p_organization_id and s.status = 'finalized' and s.customer_id is not null
                          group by s.customer_id) x)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.report_sales_by_day(uuid, date, date, uuid) from public, anon;
revoke execute on function public.report_sales_by_product(uuid, date, date, text, text, integer) from public, anon;
revoke execute on function public.report_payments_by_method(uuid, date, date) from public, anon;
revoke execute on function public.dashboard_attention(uuid) from public, anon;

grant execute on function public.report_sales_by_day(uuid, date, date, uuid) to authenticated;
grant execute on function public.report_sales_by_product(uuid, date, date, text, text, integer) to authenticated;
grant execute on function public.report_payments_by_method(uuid, date, date) to authenticated;
grant execute on function public.dashboard_attention(uuid) to authenticated;

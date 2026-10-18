-- SoukPilot — Phase C (audit finding P1): report_sales_by_day aggregates each
-- day once.
--
-- Before: for every day of the period, seven correlated subqueries re-scanned
-- all the period's sales and returns, so the cost grew with days × sales
-- (365 days over 50 000 sales: 13.5 s after P2). After: sales, returns and
-- cost lines are summed per local day once, then joined to the calendar.
--
-- Same signature, same access check, same definitions (docs/REPORTS.md),
-- same output. Proven by tests/db/reports.test.ts: equality with
-- sales_daily_summary for each day, the margin identity, and a 60-day oracle
-- comparing every column with an independent computation over raw rows
-- (green before and after this migration).
create or replace function public.report_sales_by_day(
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
    select s.id, s.subtotal_millimes, s.line_discount_millimes, s.order_discount_millimes, s.total_millimes,
           s.returned_millimes, s.paid_millimes, (s.finalized_at at time zone v_tz)::date as day
    from public.sales s, bounds b
    where s.organization_id = p_organization_id and s.status = 'finalized'
      and s.finalized_at >= b.start_at and s.finalized_at < b.end_at
      and (p_location_id is null or s.location_id = p_location_id)
  ),
  sales_by_day as (
    select day,
           count(*) as sales_count,
           sum(subtotal_millimes + line_discount_millimes) as gross,
           sum(line_discount_millimes + order_discount_millimes) as discount,
           sum(total_millimes) as total,
           sum(greatest(total_millimes - returned_millimes - paid_millimes, 0)) as credit
    from sales
    group by day
  ),
  returns as (
    select r.id, r.amount_millimes, (r.created_at at time zone v_tz)::date as day
    from public.sale_returns r
    join public.sales s on s.id = r.sale_id, bounds b
    where r.organization_id = p_organization_id
      and r.created_at >= b.start_at and r.created_at < b.end_at
      and (p_location_id is null or s.location_id = p_location_id)
  ),
  returns_by_day as (
    select day, count(*) as returns_count, sum(amount_millimes) as amount
    from returns
    group by day
  ),
  line_totals as (
    select day,
           sum(case when unit_cost is not null then quantity * unit_cost else 0 end) as cost,
           sum(case when unit_cost is null then revenue else 0 end) as without_cost
    from (
      select s.day, i.net_total_millimes as revenue, i.quantity, c.unit_cost_millimes as unit_cost
      from sales s
      join public.sale_items i on i.sale_id = s.id
      left join public.sale_item_costs c on c.sale_item_id = i.id
      union all
      select r.day, -ri.amount_millimes, -ri.quantity, c.unit_cost_millimes
      from returns r
      join public.sale_return_items ri on ri.return_id = r.id
      left join public.sale_item_costs c on c.sale_item_id = ri.sale_item_id
    ) l
    group by day
  )
  select
    d.day,
    coalesce(sd.sales_count, 0)::bigint,
    coalesce(sd.gross, 0)::bigint,
    coalesce(sd.discount, 0)::bigint,
    coalesce(sd.total, 0)::bigint,
    coalesce(rd.returns_count, 0)::bigint,
    coalesce(rd.amount, 0)::bigint,
    (coalesce(sd.total, 0) - coalesce(rd.amount, 0))::bigint,
    coalesce(sd.credit, 0)::bigint,
    coalesce(lt.cost, 0)::bigint,
    (coalesce(sd.total, 0) - coalesce(rd.amount, 0) - coalesce(lt.without_cost, 0) - coalesce(lt.cost, 0))::bigint,
    coalesce(lt.without_cost, 0)::bigint
  from days d
  left join sales_by_day sd on sd.day = d.day
  left join returns_by_day rd on rd.day = d.day
  left join line_totals lt on lt.day = d.day
  order by d.day;
end;
$$;

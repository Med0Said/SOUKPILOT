-- SoukPilot — Modernization phase 2: accent-insensitive search, sortable and
-- paginated lists, global search (command palette).
--
-- Additive and read-only with respect to business data:
--   * one extension (unaccent) and one immutable normalization helper;
--   * expression trigram indexes replacing the plain name trigram indexes;
--   * search/list functions are SECURITY INVOKER: RLS still decides what the
--     caller sees (e.g. cashiers get no supplier or purchase-order results);
--   * no table, column, constraint, ledger or money logic is changed.
--
-- Matching rules (all functions): case- and accent-insensitive on names
-- ("creme" finds "Crème", "CAFE" finds "café"), case-insensitive on SKU,
-- exact on barcode. LIKE wildcards in the query are escaped.

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Search key: lower case without diacritics. Declared IMMUTABLE so it can be
-- indexed; this is safe because the dictionary is named explicitly (the
-- built-in unaccent() is only STABLE because it resolves it via search_path).
create function private.search_key(p_text text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, p_text));
$$;
revoke execute on function private.search_key(text) from public;
grant execute on function private.search_key(text) to authenticated, service_role;

-- '%<escaped key>%' for LIKE against private.search_key(column).
create function private.search_pattern(p_query text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select '%' || replace(replace(replace(private.search_key(btrim(coalesce(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;
revoke execute on function private.search_pattern(text) from public;
grant execute on function private.search_pattern(text) to authenticated, service_role;

-- Same escaping without normalization (SKU, phone).
create function private.like_pattern(p_query text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;
revoke execute on function private.like_pattern(text) from public;
grant execute on function private.like_pattern(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Indexes (expression indexes on the search key)
-- ---------------------------------------------------------------------------
drop index if exists public.products_org_name_trgm_idx;
create index products_name_search_idx on public.products
  using gin (private.search_key(name) extensions.gin_trgm_ops);

drop index if exists public.customers_name_trgm_idx;
create index customers_name_search_idx on public.customers
  using gin (private.search_key(name) extensions.gin_trgm_ops);

create index suppliers_name_search_idx on public.suppliers
  using gin (private.search_key(name) extensions.gin_trgm_ops);

create index product_variants_sku_trgm_idx on public.product_variants
  using gin (sku extensions.gin_trgm_ops) where sku is not null;

-- ---------------------------------------------------------------------------
-- search_products: + accent-insensitive names, + p_sort.
-- Signature change (new trailing parameter) → drop and recreate; callers
-- using named parameters (PostgREST) are unaffected.
-- Sorts: name (default), name_desc, price_asc, price_desc, recent.
-- ---------------------------------------------------------------------------
drop function public.search_products(uuid, text, uuid, boolean, integer, integer);

create function public.search_products(
  p_organization_id uuid,
  p_query text default '',
  p_category_id uuid default null,
  p_include_inactive boolean default false,
  p_limit integer default 50,
  p_offset integer default 0,
  p_sort text default 'name'
)
returns table (
  product_id uuid,
  name text,
  category_name text,
  is_active boolean,
  track_stock boolean,
  variant_count integer,
  min_price_millimes bigint,
  max_price_millimes bigint,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select btrim(coalesce(p_query, '')) as q,
           private.search_pattern(p_query) as pattern,
           private.like_pattern(p_query) as raw_pattern
  ),
  matches as (
    select p.id
    from public.products p, params
    where p.organization_id = p_organization_id
      and (p_include_inactive or p.is_active)
      and (p_category_id is null or p.category_id = p_category_id)
      and (
        params.q = ''
        or private.search_key(p.name) like params.pattern
        or exists (
          select 1 from public.product_variants v
          where v.product_id = p.id
            and (v.sku ilike params.raw_pattern or v.barcode = params.q)
        )
      )
  ),
  rows as (
    select
      p.id,
      p.name,
      c.name as category_name,
      p.is_active,
      p.track_stock,
      p.created_at,
      (select count(*)::integer from public.product_variants v where v.product_id = p.id and v.is_active) as variant_count,
      (select min(v.price_millimes) from public.product_variants v where v.product_id = p.id and v.is_active) as min_price,
      (select max(v.price_millimes) from public.product_variants v where v.product_id = p.id and v.is_active) as max_price
    from matches m
    join public.products p on p.id = m.id
    left join public.categories c on c.id = p.category_id
  )
  select r.id, r.name, r.category_name, r.is_active, r.track_stock, r.variant_count, r.min_price, r.max_price,
         count(*) over ()
  from rows r
  order by
    case when p_sort = 'price_asc' then r.min_price end asc nulls last,
    case when p_sort = 'price_desc' then r.max_price end desc nulls last,
    case when p_sort = 'recent' then r.created_at end desc,
    case when p_sort = 'name_desc' then lower(r.name) end desc,
    lower(r.name), r.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- search_variants (cart, stock forms): same signature, accent-insensitive.
-- ---------------------------------------------------------------------------
create or replace function public.search_variants(
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
           private.search_pattern(p_query) as pattern,
           private.like_pattern(p_query) as raw_pattern
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
    and (private.search_key(p.name) like params.pattern or v.sku ilike params.raw_pattern or v.barcode = params.q)
  order by (v.barcode = params.q or upper(v.sku) = upper(params.q)) desc, lower(p.name), v.option_values
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- stock_overview: + accent-insensitive names, + p_sort.
-- Sorts: name (default), quantity_asc, quantity_desc.
-- ---------------------------------------------------------------------------
drop function public.stock_overview(uuid, uuid, text, boolean, integer, integer);

create function public.stock_overview(
  p_organization_id uuid,
  p_location_id uuid default null,
  p_query text default '',
  p_low_only boolean default false,
  p_limit integer default 50,
  p_offset integer default 0,
  p_sort text default 'name'
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
           private.search_pattern(p_query) as pattern,
           private.like_pattern(p_query) as raw_pattern
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
      and (params.q = ''
           or private.search_key(p.name) like params.pattern
           or v.sku ilike params.raw_pattern
           or v.barcode = params.q)
  )
  select r.variant_id, r.product_id, r.product_name, r.option_values, r.sku, r.barcode, r.quantity,
         r.low_stock_threshold,
         r.low_stock_threshold is not null and r.quantity <= r.low_stock_threshold,
         count(*) over ()
  from rows r
  where not coalesce(p_low_only, false) or (r.low_stock_threshold is not null and r.quantity <= r.low_stock_threshold)
  order by
    case when p_sort = 'quantity_asc' then r.quantity end asc,
    case when p_sort = 'quantity_desc' then r.quantity end desc,
    lower(r.product_name), r.option_values, r.variant_id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- search_customers: name (accent-insensitive) or phone, with balance.
-- Balance = Σ (total − returned − paid) over finalized sales, the same
-- definition as customer_balances. Sorts: name (default), recent, balance_desc.
-- ---------------------------------------------------------------------------
create function public.search_customers(
  p_organization_id uuid,
  p_query text default '',
  p_due_only boolean default false,
  p_sort text default 'name',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  customer_id uuid,
  name text,
  phone text,
  is_active boolean,
  created_at timestamptz,
  sales_count bigint,
  balance_millimes bigint,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select btrim(coalesce(p_query, '')) as q,
           private.search_pattern(p_query) as pattern,
           private.like_pattern(p_query) as raw_pattern
  ),
  rows as (
    select c.id, c.name, c.phone, c.is_active, c.created_at,
           coalesce(b.sales_count, 0) as sales_count,
           coalesce(b.balance, 0) as balance
    from public.customers c
    cross join params
    left join lateral (
      select count(*) as sales_count, sum(s.total_millimes - s.returned_millimes - s.paid_millimes)::bigint as balance
      from public.sales s
      where s.organization_id = c.organization_id and s.customer_id = c.id and s.status = 'finalized'
    ) b on true
    where c.organization_id = p_organization_id
      and (params.q = '' or private.search_key(c.name) like params.pattern or c.phone like params.raw_pattern)
  )
  select r.id, r.name, r.phone, r.is_active, r.created_at, r.sales_count, r.balance, count(*) over ()
  from rows r
  where not coalesce(p_due_only, false) or r.balance > 0
  order by
    case when p_sort = 'balance_desc' then r.balance end desc,
    case when p_sort = 'recent' then r.created_at end desc,
    lower(r.name), r.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- search_sales: finalized sales or drafts, by date range in the
-- organization's time zone, customer, unpaid balance, number or customer name.
-- Dates are local calendar days, inclusive. Finalized sales are dated by
-- finalized_at, drafts by created_at. Due = total − returned − paid.
-- Sorts: recent (default), oldest, total_desc, total_asc, due_desc.
-- ---------------------------------------------------------------------------
create function public.search_sales(
  p_organization_id uuid,
  p_status text default 'finalized',
  p_from date default null,
  p_to date default null,
  p_customer_id uuid default null,
  p_due_only boolean default false,
  p_query text default '',
  p_sort text default 'recent',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  sale_id uuid,
  number bigint,
  status text,
  customer_id uuid,
  customer_name text,
  total_millimes bigint,
  returned_millimes bigint,
  paid_millimes bigint,
  due_millimes bigint,
  created_at timestamptz,
  finalized_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select btrim(coalesce(p_query, '')) as q,
           private.search_pattern(p_query) as pattern,
           -- "12", "000012", "n° 12", "#12" → 12
           case when btrim(coalesce(p_query, '')) ~ '^[^0-9]{0,6}[0-9]{1,12}$'
                then substring(btrim(p_query) from '([0-9]{1,12})$')::bigint end as number,
           o.timezone as tz
    from public.organizations o
    where o.id = p_organization_id
  ),
  rows as (
    select s.id, s.number, s.status, s.customer_id, c.name as customer_name,
           s.total_millimes, s.returned_millimes, s.paid_millimes,
           s.total_millimes - s.returned_millimes - s.paid_millimes as due,
           s.created_at, s.finalized_at,
           case when s.status = 'finalized' then s.finalized_at else s.created_at end as dated_at
    from public.sales s
    cross join params
    left join public.customers c on c.id = s.customer_id
    where s.organization_id = p_organization_id
      and s.status = case when p_status = 'draft' then 'draft' else 'finalized' end
      and (p_customer_id is null or s.customer_id = p_customer_id)
      and (params.q = ''
           or s.number = params.number
           or private.search_key(c.name) like params.pattern)
  )
  select r.id, r.number, r.status, r.customer_id, r.customer_name, r.total_millimes, r.returned_millimes,
         r.paid_millimes, r.due, r.created_at, r.finalized_at, count(*) over ()
  from rows r
  cross join params
  where (p_from is null or r.dated_at >= (p_from::timestamp at time zone params.tz))
    and (p_to is null or r.dated_at < ((p_to + 1)::timestamp at time zone params.tz))
    and (not coalesce(p_due_only, false) or (r.status = 'finalized' and r.due > 0))
  order by
    case when p_sort = 'total_desc' then r.total_millimes end desc,
    case when p_sort = 'total_asc' then r.total_millimes end asc,
    case when p_sort = 'due_desc' then r.due end desc,
    case when p_sort = 'oldest' then r.dated_at end asc,
    r.dated_at desc, r.number desc nulls last, r.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- global_search (command palette): a few best matches per kind.
-- kind: product | customer | supplier | sale | purchase_order.
-- RLS applies (SECURITY INVOKER): suppliers and purchase orders are only
-- visible to owners and managers, exactly like their pages.
-- Prefix matches rank before substring matches.
-- ---------------------------------------------------------------------------
create function public.global_search(
  p_organization_id uuid,
  p_query text,
  p_limit_per_kind integer default 5
)
returns table (
  kind text,
  id uuid,
  label text,
  detail text,
  number bigint,
  amount_millimes bigint,
  occurred_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select btrim(coalesce(p_query, '')) as q,
           private.search_key(btrim(coalesce(p_query, ''))) as key,
           private.search_pattern(p_query) as pattern,
           private.like_pattern(p_query) as raw_pattern,
           case when btrim(coalesce(p_query, '')) ~ '^[^0-9]{0,6}[0-9]{1,12}$'
                then substring(btrim(p_query) from '([0-9]{1,12})$')::bigint end as number,
           least(greatest(coalesce(p_limit_per_kind, 5), 1), 10) as lim
  ),
  products as (
    select 'product'::text as kind, p.id, p.name as label, c.name as detail,
           null::bigint as number, null::bigint as amount, null::timestamptz as occurred_at
    from public.products p
    cross join params
    left join public.categories c on c.id = p.category_id
    where p.organization_id = p_organization_id
      and char_length(params.q) >= 2
      and (private.search_key(p.name) like params.pattern
           or exists (select 1 from public.product_variants v
                      where v.product_id = p.id and (v.sku ilike params.raw_pattern or v.barcode = params.q)))
    order by (private.search_key(p.name) like params.key || '%') desc, not p.is_active, lower(p.name)
    limit (select lim from params)
  ),
  customers as (
    select 'customer'::text, c.id, c.name, c.phone, null::bigint, null::bigint, null::timestamptz
    from public.customers c
    cross join params
    where c.organization_id = p_organization_id
      and char_length(params.q) >= 2
      and (private.search_key(c.name) like params.pattern or c.phone like params.raw_pattern)
    order by (private.search_key(c.name) like params.key || '%') desc, not c.is_active, lower(c.name)
    limit (select lim from params)
  ),
  suppliers as (
    select 'supplier'::text, s.id, s.name, s.phone, null::bigint, null::bigint, null::timestamptz
    from public.suppliers s
    cross join params
    where s.organization_id = p_organization_id
      and char_length(params.q) >= 2
      and private.search_key(s.name) like params.pattern
    order by (private.search_key(s.name) like params.key || '%') desc, not s.is_active, lower(s.name)
    limit (select lim from params)
  ),
  sales as (
    select 'sale'::text, s.id, null::text, c.name, s.number, s.total_millimes, s.finalized_at
    from public.sales s
    cross join params
    left join public.customers c on c.id = s.customer_id
    where s.organization_id = p_organization_id
      and s.status = 'finalized'
      and s.number = params.number
    limit (select lim from params)
  ),
  purchase_orders as (
    select 'purchase_order'::text, po.id, null::text, su.name, po.number, po.ordered_total_millimes, po.created_at
    from public.purchase_orders po
    cross join params
    join public.suppliers su on su.id = po.supplier_id
    where po.organization_id = p_organization_id
      and po.number = params.number
    limit (select lim from params)
  )
  select * from products
  union all select * from customers
  union all select * from suppliers
  union all select * from sales
  union all select * from purchase_orders;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.search_products(uuid, text, uuid, boolean, integer, integer, text) from public, anon;
revoke execute on function public.stock_overview(uuid, uuid, text, boolean, integer, integer, text) from public, anon;
revoke execute on function public.search_customers(uuid, text, boolean, text, integer, integer) from public, anon;
revoke execute on function public.search_sales(uuid, text, date, date, uuid, boolean, text, text, integer, integer) from public, anon;
revoke execute on function public.global_search(uuid, text, integer) from public, anon;

grant execute on function public.search_products(uuid, text, uuid, boolean, integer, integer, text) to authenticated;
grant execute on function public.stock_overview(uuid, uuid, text, boolean, integer, integer, text) to authenticated;
grant execute on function public.search_customers(uuid, text, boolean, text, integer, integer) to authenticated;
grant execute on function public.search_sales(uuid, text, date, date, uuid, boolean, text, text, integer, integer) to authenticated;
grant execute on function public.global_search(uuid, text, integer) to authenticated;

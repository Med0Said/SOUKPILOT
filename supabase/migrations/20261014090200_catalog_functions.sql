-- SoukPilot — Milestone 2: catalog business operations.
--
-- Product payload (JSON) shared by create_product and the CSV import:
-- {
--   "name": "T-shirt col V", "description": null, "track_stock": true,
--   "option_names": ["Taille", "Couleur"],
--   "variants": [
--     { "sku": "TS-V-S-NOIR", "barcode": "6191234567890", "option_values": ["S", "Noir"],
--       "price_millimes": 25000, "cost_millimes": 12500, "low_stock_threshold": 2 }
--   ]
-- }
-- create_product additionally accepts "category_id"/"supplier_id";
-- import payloads carry "category_name"/"supplier_name" (found or created).

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create function private.jsonb_text_array(p_value jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or p_value = 'null'::jsonb then
    return '{}';
  end if;
  if jsonb_typeof(p_value) <> 'array' then
    raise exception 'invalid_product' using errcode = '22023';
  end if;
  return coalesce(array(select jsonb_array_elements_text(p_value)), '{}');
end;
$$;
revoke execute on function private.jsonb_text_array(jsonb) from public;

create function private.require_org_role(p_organization_id uuid, p_roles public.org_role[])
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = v_uid and m.role = any (p_roles)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;
revoke execute on function private.require_org_role(uuid, public.org_role[]) from public;

-- Translates constraint failures into stable error keys for the app.
create function private.raise_catalog_error(p_state text, p_constraint text, p_message text, p_detail text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_key text;
begin
  v_key := case
    when p_constraint = 'product_variants_org_sku_idx' then 'duplicate_sku'
    when p_constraint = 'product_variants_org_barcode_idx' then 'duplicate_barcode'
    when p_constraint = 'product_variants_product_options_idx' then 'duplicate_variant_options'
    when p_message in ('variant_options_mismatch', 'invalid_product', 'invalid_variant_count',
                       'import_product_exists', 'forbidden', 'rate_limited') then p_message
    when p_state = '23503' then 'invalid_reference'
    when p_state in ('23514', '23502', '22P02', '22003', '22023') then 'invalid_product'
    else null
  end;
  if v_key is null then
    -- Unknown failure: re-raise the original (logged server-side, generic for users).
    raise exception '%', p_message using errcode = p_state, detail = coalesce(p_detail, '');
  end if;
  raise exception '%', v_key using errcode = case when p_state = '23505' then '23505' else '22023' end,
    detail = coalesce(p_detail, '');
end;
$$;
revoke execute on function private.raise_catalog_error(text, text, text, text) from public;

-- Inserts one product and its variants (+ costs). Caller authorizes and
-- resolves category/supplier ids. Raises raw constraint errors.
create function private.insert_product(
  p_organization_id uuid,
  p_product jsonb,
  p_category_id uuid,
  p_supplier_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_variant jsonb;
  v_variant_id uuid;
  v_count integer;
begin
  if jsonb_typeof(p_product) <> 'object' or jsonb_typeof(p_product -> 'variants') is distinct from 'array' then
    raise exception 'invalid_product' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_product -> 'variants');
  if v_count < 1 or v_count > 200 then
    raise exception 'invalid_variant_count' using errcode = '22023';
  end if;

  insert into public.products (organization_id, name, description, category_id, supplier_id, option_names, track_stock, created_by)
  values (
    p_organization_id,
    btrim(p_product ->> 'name'),
    nullif(btrim(coalesce(p_product ->> 'description', '')), ''),
    p_category_id,
    p_supplier_id,
    private.jsonb_text_array(p_product -> 'option_names'),
    coalesce((p_product ->> 'track_stock')::boolean, true),
    auth.uid()
  )
  returning id into v_product_id;

  for v_variant in select value from jsonb_array_elements(p_product -> 'variants') loop
    insert into public.product_variants (organization_id, product_id, sku, barcode, option_values, price_millimes, low_stock_threshold)
    values (
      p_organization_id,
      v_product_id,
      nullif(btrim(coalesce(v_variant ->> 'sku', '')), ''),
      nullif(btrim(coalesce(v_variant ->> 'barcode', '')), ''),
      private.jsonb_text_array(v_variant -> 'option_values'),
      (v_variant ->> 'price_millimes')::bigint,
      (v_variant ->> 'low_stock_threshold')::integer
    )
    returning id into v_variant_id;

    if v_variant ->> 'cost_millimes' is not null then
      update public.product_variant_costs
      set cost_millimes = (v_variant ->> 'cost_millimes')::bigint
      where variant_id = v_variant_id;
    end if;
  end loop;

  return v_product_id;
end;
$$;
revoke execute on function private.insert_product(uuid, jsonb, uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- create_product: one product + its variants, atomically.
-- ---------------------------------------------------------------------------
create function public.create_product(p_organization_id uuid, p_product jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_constraint text;
  v_message text;
begin
  perform private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  begin
    return private.insert_product(
      p_organization_id,
      p_product,
      nullif(p_product ->> 'category_id', '')::uuid,
      nullif(p_product ->> 'supplier_id', '')::uuid
    );
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_constraint = constraint_name, v_message = message_text;
    perform private.raise_catalog_error(v_state, v_constraint, v_message, null);
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_variant: add a variant to a product, or update one, together with its
-- purchase cost, atomically. p_variant_id NULL = create.
-- ---------------------------------------------------------------------------
create function public.save_variant(
  p_organization_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_variant jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_state text;
  v_constraint text;
  v_message text;
begin
  perform private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  if jsonb_typeof(p_variant) is distinct from 'object' then
    raise exception 'invalid_product' using errcode = '22023';
  end if;
  begin
    if p_variant_id is null then
      insert into public.product_variants (organization_id, product_id, sku, barcode, option_values, price_millimes, low_stock_threshold, is_active)
      values (
        p_organization_id,
        p_product_id,
        nullif(btrim(coalesce(p_variant ->> 'sku', '')), ''),
        nullif(btrim(coalesce(p_variant ->> 'barcode', '')), ''),
        private.jsonb_text_array(p_variant -> 'option_values'),
        (p_variant ->> 'price_millimes')::bigint,
        (p_variant ->> 'low_stock_threshold')::integer,
        coalesce((p_variant ->> 'is_active')::boolean, true)
      )
      returning id into v_id;
    else
      update public.product_variants
      set sku = nullif(btrim(coalesce(p_variant ->> 'sku', '')), ''),
          barcode = nullif(btrim(coalesce(p_variant ->> 'barcode', '')), ''),
          option_values = private.jsonb_text_array(p_variant -> 'option_values'),
          price_millimes = (p_variant ->> 'price_millimes')::bigint,
          low_stock_threshold = (p_variant ->> 'low_stock_threshold')::integer,
          is_active = coalesce((p_variant ->> 'is_active')::boolean, true)
      where id = p_variant_id and organization_id = p_organization_id and product_id = p_product_id
      returning id into v_id;
      if v_id is null then
        raise exception 'invalid_reference' using errcode = '23503';
      end if;
    end if;

    update public.product_variant_costs
    set cost_millimes = (p_variant ->> 'cost_millimes')::bigint
    where variant_id = v_id and cost_millimes is distinct from (p_variant ->> 'cost_millimes')::bigint;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_constraint = constraint_name, v_message = message_text;
    if v_message = 'invalid_reference' then
      raise;
    end if;
    perform private.raise_catalog_error(v_state, v_constraint, v_message, null);
  end;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- search_products: product list with name / SKU / barcode search.
-- SECURITY INVOKER: RLS decides what the caller can see.
-- ---------------------------------------------------------------------------
create function public.search_products(
  p_organization_id uuid,
  p_query text default '',
  p_category_id uuid default null,
  p_include_inactive boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
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
    select
      btrim(coalesce(p_query, '')) as q,
      '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  ),
  matches as (
    select p.id
    from public.products p, params
    where p.organization_id = p_organization_id
      and (p_include_inactive or p.is_active)
      and (p_category_id is null or p.category_id = p_category_id)
      and (
        params.q = ''
        or p.name ilike params.pattern
        or exists (
          select 1 from public.product_variants v
          where v.product_id = p.id
            and (v.sku ilike params.pattern or v.barcode = params.q)
        )
      )
  )
  select
    p.id,
    p.name,
    c.name,
    p.is_active,
    p.track_stock,
    (select count(*)::integer from public.product_variants v where v.product_id = p.id and v.is_active),
    (select min(v.price_millimes) from public.product_variants v where v.product_id = p.id and v.is_active),
    (select max(v.price_millimes) from public.product_variants v where v.product_id = p.id and v.is_active),
    count(*) over ()
  from matches m
  join public.products p on p.id = m.id
  left join public.categories c on c.id = p.category_id
  order by lower(p.name), p.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Exact lookup by barcode or SKU (scanner / quick search).
create function public.find_variant_by_code(p_organization_id uuid, p_code text)
returns table (
  variant_id uuid,
  product_id uuid,
  product_name text,
  option_values text[],
  sku text,
  barcode text,
  price_millimes bigint,
  is_active boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.id, p.id, p.name, v.option_values, v.sku, v.barcode, v.price_millimes, v.is_active and p.is_active
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.organization_id = p_organization_id
    and btrim(coalesce(p_code, '')) <> ''
    and (v.barcode = btrim(p_code) or upper(v.sku) = upper(btrim(p_code)))
  limit 5;
$$;

-- Which of these product names / SKUs / barcodes already exist (import preview).
create function public.find_catalog_conflicts(
  p_organization_id uuid,
  p_names text[],
  p_skus text[],
  p_barcodes text[]
)
returns table (kind text, value text)
language sql
stable
security invoker
set search_path = ''
as $$
  select 'name', lower(p.name) from public.products p
  where p.organization_id = p_organization_id
    and lower(p.name) = any (select lower(n) from unnest(coalesce(p_names, '{}')) as n)
  union
  select 'sku', upper(v.sku) from public.product_variants v
  where v.organization_id = p_organization_id
    and upper(v.sku) = any (select upper(s) from unnest(coalesce(p_skus, '{}')) as s)
  union
  select 'barcode', v.barcode from public.product_variants v
  where v.organization_id = p_organization_id
    and v.barcode = any (coalesce(p_barcodes, '{}'));
$$;

-- ---------------------------------------------------------------------------
-- CSV import: stage, then commit once.
-- ---------------------------------------------------------------------------
create function public.stage_catalog_import(
  p_organization_id uuid,
  p_file_name text,
  p_products jsonb,
  p_summary jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_org_role(p_organization_id, array['owner', 'manager']::public.org_role[]);
  v_id uuid;
  v_variants integer;
begin
  perform private.enforce_rate_limit('catalog_import:' || p_organization_id::text, 30, interval '1 hour');

  if jsonb_typeof(p_products) is distinct from 'array'
     or jsonb_array_length(p_products) not between 1 and 2000 then
    raise exception 'import_invalid_payload' using errcode = '22023';
  end if;
  select coalesce(sum(jsonb_array_length(coalesce(item -> 'variants', '[]'::jsonb))), 0) into v_variants
  from jsonb_array_elements(p_products) as t(item);
  if v_variants > 5000 or pg_column_size(p_products) > 5 * 1024 * 1024 then
    raise exception 'import_too_large' using errcode = '22023';
  end if;

  insert into public.catalog_import_batches (organization_id, file_name, products, summary, created_by)
  values (
    p_organization_id,
    left(coalesce(nullif(btrim(p_file_name), ''), 'import.csv'), 255),
    p_products,
    case when jsonb_typeof(p_summary) = 'object' then p_summary else '{}'::jsonb end,
    v_uid
  )
  returning id into v_id;
  return v_id;
end;
$$;

create function public.commit_catalog_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_batch public.catalog_import_batches;
  v_product jsonb;
  v_name text;
  v_category_name text;
  v_supplier_name text;
  v_category_id uuid;
  v_supplier_id uuid;
  v_products integer := 0;
  v_variants integer := 0;
  v_categories_created integer := 0;
  v_suppliers_created integer := 0;
  v_result jsonb;
  v_state text;
  v_constraint text;
  v_message text;
begin
  -- Row lock: a concurrent or repeated commit waits here, then sees 'committed'.
  select * into v_batch from public.catalog_import_batches b where b.id = p_batch_id for update;
  if not found or not private.is_org_member(v_batch.organization_id) then
    raise exception 'import_not_found' using errcode = 'P0002';
  end if;
  perform private.require_org_role(v_batch.organization_id, array['owner', 'manager']::public.org_role[]);
  if v_batch.status <> 'pending' then
    raise exception 'import_already_committed' using errcode = '22023';
  end if;
  if v_batch.created_at < now() - interval '24 hours' then
    raise exception 'import_expired' using errcode = '22023';
  end if;

  for v_product in select value from jsonb_array_elements(v_batch.products) loop
    v_name := btrim(coalesce(v_product ->> 'name', ''));
    begin
      v_category_id := null;
      v_category_name := nullif(btrim(coalesce(v_product ->> 'category_name', '')), '');
      if v_category_name is not null then
        insert into public.categories (organization_id, name)
        values (v_batch.organization_id, v_category_name)
        on conflict (organization_id, lower(name)) do nothing
        returning id into v_category_id;
        if v_category_id is null then
          select c.id into v_category_id from public.categories c
          where c.organization_id = v_batch.organization_id and lower(c.name) = lower(v_category_name);
        else
          v_categories_created := v_categories_created + 1;
        end if;
      end if;

      v_supplier_id := null;
      v_supplier_name := nullif(btrim(coalesce(v_product ->> 'supplier_name', '')), '');
      if v_supplier_name is not null then
        insert into public.suppliers (organization_id, name)
        values (v_batch.organization_id, v_supplier_name)
        on conflict (organization_id, lower(name)) do nothing
        returning id into v_supplier_id;
        if v_supplier_id is null then
          select s.id into v_supplier_id from public.suppliers s
          where s.organization_id = v_batch.organization_id and lower(s.name) = lower(v_supplier_name);
        else
          v_suppliers_created := v_suppliers_created + 1;
        end if;
      end if;

      -- Import never merges into an existing product (no silent merge).
      if exists (
        select 1 from public.products p
        where p.organization_id = v_batch.organization_id and lower(p.name) = lower(v_name)
      ) then
        raise exception 'import_product_exists' using errcode = '23505';
      end if;

      perform private.insert_product(v_batch.organization_id, v_product, v_category_id, v_supplier_id);
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_constraint = constraint_name, v_message = message_text;
      perform private.raise_catalog_error(v_state, v_constraint, v_message, v_name);
    end;

    v_products := v_products + 1;
    v_variants := v_variants + jsonb_array_length(v_product -> 'variants');
  end loop;

  v_result := jsonb_build_object(
    'products_created', v_products,
    'variants_created', v_variants,
    'categories_created', v_categories_created,
    'suppliers_created', v_suppliers_created
  );

  update public.catalog_import_batches
  set status = 'committed', committed_at = now(), committed_by = v_uid, summary = summary || v_result
  where id = p_batch_id;

  perform private.write_audit(v_batch.organization_id, 'catalog_import.committed', 'catalog_import', p_batch_id,
    v_result || jsonb_build_object('file_name', v_batch.file_name));

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.create_product(uuid, jsonb) from public, anon;
revoke execute on function public.save_variant(uuid, uuid, uuid, jsonb) from public, anon;
revoke execute on function public.search_products(uuid, text, uuid, boolean, integer, integer) from public, anon;
revoke execute on function public.find_variant_by_code(uuid, text) from public, anon;
revoke execute on function public.find_catalog_conflicts(uuid, text[], text[], text[]) from public, anon;
revoke execute on function public.stage_catalog_import(uuid, text, jsonb, jsonb) from public, anon;
revoke execute on function public.commit_catalog_import(uuid) from public, anon;

grant execute on function public.create_product(uuid, jsonb) to authenticated;
grant execute on function public.save_variant(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.search_products(uuid, text, uuid, boolean, integer, integer) to authenticated;
grant execute on function public.find_variant_by_code(uuid, text) to authenticated;
grant execute on function public.find_catalog_conflicts(uuid, text[], text[], text[]) to authenticated;
grant execute on function public.stage_catalog_import(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.commit_catalog_import(uuid) to authenticated;

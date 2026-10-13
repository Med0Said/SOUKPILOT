-- SoukPilot — Milestone 2: catalog (categories, suppliers, products, variants,
-- purchase costs) and CSV import staging.
--
-- Key decisions (docs/DATABASE_SCHEMA.md §4):
--   * Every product has >= 1 variant; stock (M3) will reference variants only,
--     so each sellable item has a stable UUID identity.
--   * Up to 3 option names per product ("Taille", "Couleur", "Teinte"); each
--     variant has one value per option. No variant can repeat a combination.
--   * SKU unique per organization (case-insensitive); barcode unique per
--     organization. Both optional.
--   * Prices are integer millimes (1 TND = 1000 millimes).
--   * Purchase cost lives in product_variant_costs, readable by owner/manager
--     only (cashiers must not see margins). NULL cost = unknown.
--   * Composite foreign keys (organization_id, x_id) make cross-tenant
--     references impossible.
--   * Products and variants are never deleted by API users: deactivate.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Validates a list of short labels (option names / option values).
create function private.valid_labels(p_values text[], p_max_length integer, p_distinct boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_values is not null
    and not exists (
      select 1 from unnest(p_values) as v(label)
      where label is null or label <> btrim(label) or char_length(label) not between 1 and p_max_length
    )
    and (
      not p_distinct
      or (select count(distinct lower(label)) from unnest(p_values) as v(label)) = cardinality(p_values)
    );
$$;
-- Evaluated inside CHECK constraints with the inserting user's privileges.
revoke execute on function private.valid_labels(text[], integer, boolean) from public;
grant execute on function private.valid_labels(text[], integer, boolean) to authenticated, service_role;

-- Case-insensitive key of an option-value combination (for uniqueness).
create function private.options_key(p_values text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(array_to_string(p_values, chr(31)));
$$;
revoke execute on function private.options_key(text[]) from public;
grant execute on function private.options_key(text[]) to authenticated, service_role;

-- Generic audit trigger: TG_ARGV[0] = entity type, TG_ARGV[1] = id column.
-- INSERT/DELETE log a snapshot, UPDATE logs only changed columns as [old, new].
create function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity text := tg_argv[0];
  v_id_column text := coalesce(tg_argv[1], 'id');
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old jsonb;
  v_details jsonb;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old) - 'created_at' - 'updated_at' - 'organization_id';
    select coalesce(jsonb_object_agg(key, jsonb_build_array(v_old -> key, value)), '{}'::jsonb)
      into v_details
    from jsonb_each(v_row - 'created_at' - 'updated_at' - 'organization_id')
    where (v_old -> key) is distinct from value;
    if v_details = '{}'::jsonb then
      return null;
    end if;
  else
    v_details := v_row - 'created_at' - 'updated_at' - 'organization_id';
  end if;

  perform private.write_audit(
    (v_row ->> 'organization_id')::uuid,
    v_entity || '.' || case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    v_entity,
    (v_row ->> v_id_column)::uuid,
    v_details
  );
  return null;
end;
$$;
revoke execute on function private.audit_row_change() from public;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index categories_org_name_idx on public.categories (organization_id, lower(name));
create trigger categories_set_updated_at before update on public.categories
  for each row execute function private.set_updated_at();
create trigger categories_audit after insert or update or delete on public.categories
  for each row execute function private.audit_row_change('category');

-- ---------------------------------------------------------------------------
-- Suppliers (minimal in M2; purchasing details come in M5)
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  phone text check (phone is null or char_length(phone) between 4 and 32),
  email text check (
    email is null or (email = lower(btrim(email)) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  notes text check (notes is null or char_length(notes) <= 2000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index suppliers_org_name_idx on public.suppliers (organization_id, lower(name));
create trigger suppliers_set_updated_at before update on public.suppliers
  for each row execute function private.set_updated_at();
create trigger suppliers_audit after insert or update on public.suppliers
  for each row execute function private.audit_row_change('supplier');

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 200),
  description text check (description is null or char_length(description) <= 4000),
  category_id uuid,
  supplier_id uuid,
  -- Immutable after creation (not in the UPDATE grant): variants depend on it.
  option_names text[] not null default '{}'
    check (cardinality(option_names) <= 3 and private.valid_labels(option_names, 40, true)),
  track_stock boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, category_id)
    references public.categories (organization_id, id) on delete set null (category_id),
  foreign key (organization_id, supplier_id)
    references public.suppliers (organization_id, id)
);
create index products_org_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create index products_org_category_idx on public.products (organization_id, category_id);
create index products_org_name_idx on public.products (organization_id, lower(name));
create trigger products_set_updated_at before update on public.products
  for each row execute function private.set_updated_at();
create trigger products_audit after insert or update on public.products
  for each row execute function private.audit_row_change('product');

-- ---------------------------------------------------------------------------
-- Product variants (the stock-keeping identity)
-- ---------------------------------------------------------------------------
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  product_id uuid not null,
  sku text check (sku is null or (sku = btrim(sku) and char_length(sku) between 1 and 64)),
  barcode text check (barcode is null or barcode ~ '^[0-9A-Za-z.-]{1,64}$'),
  option_values text[] not null default '{}' check (private.valid_labels(option_values, 60, false)),
  price_millimes bigint not null check (price_millimes between 0 and 1000000000000),
  low_stock_threshold integer check (low_stock_threshold is null or low_stock_threshold between 0 and 1000000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id)
);
create unique index product_variants_org_sku_idx
  on public.product_variants (organization_id, upper(sku)) where sku is not null;
create unique index product_variants_org_barcode_idx
  on public.product_variants (organization_id, barcode) where barcode is not null;
create unique index product_variants_product_options_idx
  on public.product_variants (product_id, private.options_key(option_values));
create index product_variants_org_product_idx on public.product_variants (organization_id, product_id);

create trigger product_variants_set_updated_at before update on public.product_variants
  for each row execute function private.set_updated_at();
create trigger product_variants_audit after insert or update on public.product_variants
  for each row execute function private.audit_row_change('variant');

-- A variant has exactly one value per option of its product.
create function private.check_variant_options()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected integer;
begin
  select cardinality(p.option_names) into v_expected
  from public.products p where p.id = new.product_id;
  if v_expected is distinct from cardinality(new.option_values) then
    raise exception 'variant_options_mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function private.check_variant_options() from public;
create trigger product_variants_check_options
  before insert or update of option_values, product_id on public.product_variants
  for each row execute function private.check_variant_options();

-- ---------------------------------------------------------------------------
-- Purchase costs (owner/manager only)
-- ---------------------------------------------------------------------------
create table public.product_variant_costs (
  variant_id uuid primary key,
  organization_id uuid not null,
  cost_millimes bigint check (cost_millimes is null or cost_millimes between 0 and 1000000000000),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id)
);
create trigger product_variant_costs_set_updated_at before update on public.product_variant_costs
  for each row execute function private.set_updated_at();
create trigger product_variant_costs_audit after update on public.product_variant_costs
  for each row execute function private.audit_row_change('variant_cost', 'variant_id');

-- Every variant gets a cost row (unknown cost) so updates never need an insert.
create function private.create_variant_cost_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.product_variant_costs (variant_id, organization_id)
  values (new.id, new.organization_id);
  return null;
end;
$$;
revoke execute on function private.create_variant_cost_row() from public;
create trigger product_variants_create_cost
  after insert on public.product_variants
  for each row execute function private.create_variant_cost_row();

-- ---------------------------------------------------------------------------
-- CSV import staging. Rows are validated by the app, stored here, then
-- committed once by commit_catalog_import() (idempotent, all-or-nothing).
-- ---------------------------------------------------------------------------
create table public.catalog_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'committed')),
  file_name text not null check (char_length(file_name) between 1 and 255),
  products jsonb not null check (jsonb_typeof(products) = 'array'),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  committed_by uuid references auth.users (id) on delete set null,
  committed_at timestamptz,
  check ((status = 'committed') = (committed_at is not null))
);
create index catalog_import_batches_org_idx on public.catalog_import_batches (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_variant_costs enable row level security;
alter table public.catalog_import_batches enable row level security;

-- categories: members read; owner/manager write (delete un-categorizes products)
create policy categories_select_member on public.categories for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy categories_insert_manager on public.categories for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));
create policy categories_update_manager on public.categories for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])))
  with check ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));
create policy categories_delete_manager on public.categories for delete to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));

-- suppliers: owner/manager only (contact data, purchasing)
create policy suppliers_select_manager on public.suppliers for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));
create policy suppliers_insert_manager on public.suppliers for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));
create policy suppliers_update_manager on public.suppliers for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])))
  with check ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));

-- products: members read; owner/manager update. Creation via create_product().
create policy products_select_member on public.products for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy products_update_manager on public.products for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])))
  with check ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));

-- variants: members read; owner/manager add and update.
create policy product_variants_select_member on public.product_variants for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy product_variants_insert_manager on public.product_variants for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));
create policy product_variants_update_manager on public.product_variants for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])))
  with check ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));

-- costs: owner/manager read and update. Rows are created by trigger.
create policy product_variant_costs_select_manager on public.product_variant_costs for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));
create policy product_variant_costs_update_manager on public.product_variant_costs for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])))
  with check ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));

-- import batches: owner/manager read; writes via functions only.
create policy catalog_import_batches_select_manager on public.catalog_import_batches for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.categories, public.suppliers, public.products, public.product_variants,
  public.product_variant_costs, public.catalog_import_batches
  from anon, authenticated;

grant select, delete on public.categories to authenticated;
grant insert (organization_id, name) on public.categories to authenticated;
grant update (name) on public.categories to authenticated;

grant select on public.suppliers to authenticated;
grant insert (organization_id, name, phone, email, notes, is_active) on public.suppliers to authenticated;
grant update (name, phone, email, notes, is_active) on public.suppliers to authenticated;

grant select on public.products to authenticated;
grant update (name, description, category_id, supplier_id, track_stock, is_active) on public.products to authenticated;

grant select on public.product_variants to authenticated;
grant insert (organization_id, product_id, sku, barcode, option_values, price_millimes, low_stock_threshold, is_active)
  on public.product_variants to authenticated;
grant update (sku, barcode, option_values, price_millimes, low_stock_threshold, is_active)
  on public.product_variants to authenticated;

grant select on public.product_variant_costs to authenticated;
grant update (cost_millimes) on public.product_variant_costs to authenticated;

grant select on public.catalog_import_batches to authenticated;

-- SoukPilot — Milestone 4: sales, payments, returns, customers.
--
-- Money: bigint millimes. Rounding (also implemented in src/lib/domain/pricing.ts
-- and cross-checked by tests):
--   line gross            = quantity × unit price (price read from the DB)
--   line discount         = round_half_up(gross × discount_bps / 10000)
--   line total            = gross − line discount
--   subtotal              = Σ line totals
--   total                 = subtotal − order discount (fixed amount)
--   order discount share  = proportional to line totals, floor, remaining
--                           millimes to the largest remainders (then line order)
--   line net total        = line total − share          (Σ net totals = total)
--   return amount         = round_half_up(net × returned_after / qty)
--                           − round_half_up(net × returned_before / qty)
--   balance due           = total − returned − paid     (paid = payments − refunds)

-- ---------------------------------------------------------------------------
-- Organization setting: maximum discount a cashier may grant (basis points).
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column cashier_max_discount_bps integer not null default 1000
  check (cashier_max_discount_bps between 0 and 10000);
grant update (cashier_max_discount_bps) on public.organizations to authenticated;

create or replace function private.audit_organization_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes jsonb := '{}'::jsonb;
begin
  if new.name is distinct from old.name then
    v_changes := v_changes || jsonb_build_object('name', jsonb_build_array(old.name, new.name));
  end if;
  if new.timezone is distinct from old.timezone then
    v_changes := v_changes || jsonb_build_object('timezone', jsonb_build_array(old.timezone, new.timezone));
  end if;
  if new.default_locale is distinct from old.default_locale then
    v_changes := v_changes || jsonb_build_object('default_locale', jsonb_build_array(old.default_locale, new.default_locale));
  end if;
  if new.cashier_max_discount_bps is distinct from old.cashier_max_discount_bps then
    v_changes := v_changes || jsonb_build_object('cashier_max_discount_bps',
      jsonb_build_array(old.cashier_max_discount_bps, new.cashier_max_discount_bps));
  end if;
  if v_changes <> '{}'::jsonb then
    perform private.write_audit(new.id, 'organization.updated', 'organization', new.id, v_changes);
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payment methods (configurable per organization)
-- ---------------------------------------------------------------------------
create type public.payment_method_kind as enum ('cash', 'card', 'transfer', 'check', 'mobile', 'other');

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  label text not null check (label = btrim(label) and char_length(label) between 1 and 40),
  kind public.payment_method_kind not null,
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index payment_methods_org_label_idx on public.payment_methods (organization_id, lower(label));
create trigger payment_methods_set_updated_at before update on public.payment_methods
  for each row execute function private.set_updated_at();
create trigger payment_methods_audit after insert or update on public.payment_methods
  for each row execute function private.audit_row_change('payment_method');

create function private.create_default_payment_methods()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payment_methods (organization_id, label, kind, sort_order) values
    (new.id, 'Espèces', 'cash', 10),
    (new.id, 'Carte bancaire', 'card', 20),
    (new.id, 'Virement', 'transfer', 30),
    (new.id, 'Chèque', 'check', 40);
  return null;
end;
$$;
revoke execute on function private.create_default_payment_methods() from public;
create trigger organizations_default_payment_methods
  after insert on public.organizations
  for each row execute function private.create_default_payment_methods();

-- Backfill organizations created before this migration.
insert into public.payment_methods (organization_id, label, kind, sort_order)
select o.id, m.label, m.kind::public.payment_method_kind, m.sort_order
from public.organizations o
cross join (values ('Espèces', 'cash', 10), ('Carte bancaire', 'card', 20), ('Virement', 'transfer', 30), ('Chèque', 'check', 40))
  as m(label, kind, sort_order)
where not exists (select 1 from public.payment_methods pm where pm.organization_id = o.id);

-- ---------------------------------------------------------------------------
-- Customers (only what the workflow needs)
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  phone text check (phone is null or char_length(phone) between 4 and 32),
  address text check (address is null or char_length(address) <= 300),
  notes text check (notes is null or char_length(notes) <= 1000),
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index customers_org_name_idx on public.customers (organization_id, lower(name));
create index customers_name_trgm_idx on public.customers using gin (name extensions.gin_trgm_ops);
create trigger customers_set_updated_at before update on public.customers
  for each row execute function private.set_updated_at();
create trigger customers_audit after insert or update on public.customers
  for each row execute function private.audit_row_change('customer');

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  number bigint,
  status text not null default 'draft' check (status in ('draft', 'finalized', 'cancelled')),
  customer_id uuid,
  note text check (note is null or char_length(note) <= 500),
  subtotal_millimes bigint not null default 0 check (subtotal_millimes between 0 and 1000000000000),
  line_discount_millimes bigint not null default 0 check (line_discount_millimes >= 0),
  order_discount_millimes bigint not null default 0 check (order_discount_millimes >= 0),
  total_millimes bigint not null default 0 check (total_millimes >= 0),
  returned_millimes bigint not null default 0 check (returned_millimes >= 0),
  -- Payments minus refunds. Never negative: a refund cannot exceed what was paid.
  paid_millimes bigint not null default 0 check (paid_millimes >= 0),
  finalize_idempotency_key uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_by uuid references auth.users (id) on delete set null,
  finalized_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, number),
  unique (organization_id, finalize_idempotency_key),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  check (order_discount_millimes <= subtotal_millimes),
  check (total_millimes = subtotal_millimes - order_discount_millimes),
  check (returned_millimes <= total_millimes),
  check ((status = 'finalized') = (number is not null and finalized_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index sales_org_finalized_idx on public.sales (organization_id, finalized_at desc) where status = 'finalized';
create index sales_org_status_idx on public.sales (organization_id, status, created_at desc);
create index sales_org_customer_idx on public.sales (organization_id, customer_id) where customer_id is not null;
create trigger sales_set_updated_at before update on public.sales
  for each row execute function private.set_updated_at();

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sale_id uuid not null,
  line_no integer not null check (line_no between 1 and 200),
  variant_id uuid not null,
  -- Snapshots: the receipt stays correct if the product is renamed later.
  product_name text not null,
  variant_label text not null default '',
  track_stock boolean not null,
  quantity integer not null check (quantity between 1 and 1000000),
  unit_price_millimes bigint not null check (unit_price_millimes >= 0),
  discount_bps integer not null default 0 check (discount_bps between 0 and 10000),
  gross_millimes bigint not null,
  line_discount_millimes bigint not null check (line_discount_millimes >= 0),
  line_total_millimes bigint not null check (line_total_millimes >= 0),
  order_discount_share_millimes bigint not null default 0 check (order_discount_share_millimes >= 0),
  net_total_millimes bigint not null check (net_total_millimes >= 0),
  returned_quantity integer not null default 0,
  returned_millimes bigint not null default 0,
  unique (sale_id, line_no),
  unique (sale_id, variant_id),
  foreign key (organization_id, sale_id) references public.sales (organization_id, id) on delete cascade,
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id),
  check (gross_millimes = quantity::numeric * unit_price_millimes and gross_millimes <= 1000000000000),
  check (line_total_millimes = gross_millimes - line_discount_millimes),
  check (net_total_millimes = line_total_millimes - order_discount_share_millimes),
  check (returned_quantity between 0 and quantity),
  check (returned_millimes between 0 and net_total_millimes)
);
create index sale_items_org_variant_idx on public.sale_items (organization_id, variant_id);

-- Cost snapshot at finalization (estimated gross margin). Owner/manager only.
create table public.sale_item_costs (
  sale_item_id uuid primary key references public.sale_items (id) on delete cascade,
  organization_id uuid not null,
  unit_cost_millimes bigint check (unit_cost_millimes is null or unit_cost_millimes >= 0)
);

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sale_id uuid not null,
  method_id uuid not null,
  kind text not null check (kind in ('payment', 'refund')),
  amount_millimes bigint not null check (amount_millimes between 1 and 1000000000000),
  idempotency_key uuid,
  return_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, sale_id) references public.sales (organization_id, id),
  foreign key (organization_id, method_id) references public.payment_methods (organization_id, id)
);
create index sale_payments_org_created_idx on public.sale_payments (organization_id, created_at desc);
create index sale_payments_sale_idx on public.sale_payments (sale_id);

create table public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sale_id uuid not null,
  number bigint not null,
  reason text not null check (char_length(reason) between 3 and 500),
  amount_millimes bigint not null check (amount_millimes >= 0),
  idempotency_key uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, number),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, sale_id) references public.sales (organization_id, id)
);
create index sale_returns_sale_idx on public.sale_returns (sale_id);

create table public.sale_return_items (
  return_id uuid not null references public.sale_returns (id),
  organization_id uuid not null,
  sale_item_id uuid not null references public.sale_items (id),
  quantity integer not null check (quantity between 1 and 1000000),
  restock boolean not null,
  amount_millimes bigint not null check (amount_millimes >= 0),
  primary key (return_id, sale_item_id)
);

-- ---------------------------------------------------------------------------
-- Finalized history is frozen: only the running aggregates may change
-- (returned / paid), and only through the SQL functions (no API grants).
-- ---------------------------------------------------------------------------
create function private.protect_finalized_sale()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'sale_immutable' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.status = 'finalized' and (
       new.status <> old.status or new.number <> old.number or new.location_id <> old.location_id
       or new.customer_id is distinct from old.customer_id
       or new.subtotal_millimes <> old.subtotal_millimes or new.line_discount_millimes <> old.line_discount_millimes
       or new.order_discount_millimes <> old.order_discount_millimes or new.total_millimes <> old.total_millimes
       or new.finalized_at <> old.finalized_at or new.finalize_idempotency_key is distinct from old.finalize_idempotency_key)
  then
    raise exception 'sale_immutable' using errcode = '42501';
  end if;
  if old.status = 'cancelled' then
    raise exception 'sale_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.protect_finalized_sale() from public;
create trigger sales_protect_finalized before update or delete on public.sales
  for each row execute function private.protect_finalized_sale();

create function private.protect_finalized_sale_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_row public.sale_items := case when tg_op = 'DELETE' then old else new end;
begin
  select s.status into v_status from public.sales s where s.id = v_row.sale_id;
  if v_status is null or v_status = 'draft' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' and v_status = 'finalized' then
    -- Lines are written in the finalizing transaction before the status flips.
    raise exception 'sale_immutable' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'sale_immutable' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'returned_quantity' - 'returned_millimes') <> (to_jsonb(old) - 'returned_quantity' - 'returned_millimes') then
    raise exception 'sale_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.protect_finalized_sale_item() from public;
create trigger sale_items_protect_finalized before insert or update or delete on public.sale_items
  for each row execute function private.protect_finalized_sale_item();

create function private.prevent_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'record_immutable' using errcode = '42501';
end;
$$;
revoke execute on function private.prevent_change() from public;
create trigger sale_payments_immutable before update or delete on public.sale_payments
  for each row execute function private.prevent_change();
create trigger sale_returns_immutable before update or delete on public.sale_returns
  for each row execute function private.prevent_change();
create trigger sale_return_items_immutable before update or delete on public.sale_return_items
  for each row execute function private.prevent_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.payment_methods enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_item_costs enable row level security;
alter table public.sale_payments enable row level security;
alter table public.sale_returns enable row level security;
alter table public.sale_return_items enable row level security;

create policy payment_methods_select_member on public.payment_methods for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy payment_methods_insert_manager on public.payment_methods for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));
create policy payment_methods_update_manager on public.payment_methods for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])))
  with check ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));

create policy customers_select_member on public.customers for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy customers_insert_member on public.customers for insert to authenticated
  with check ((select private.is_org_member(organization_id)));
create policy customers_update_manager on public.customers for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])))
  with check ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));

create policy sales_select_member on public.sales for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy sale_items_select_member on public.sale_items for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy sale_payments_select_member on public.sale_payments for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy sale_returns_select_member on public.sale_returns for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy sale_return_items_select_member on public.sale_return_items for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy sale_item_costs_select_manager on public.sale_item_costs for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));

revoke all on public.payment_methods, public.customers, public.sales, public.sale_items, public.sale_item_costs,
  public.sale_payments, public.sale_returns, public.sale_return_items
  from anon, authenticated;

grant select on public.payment_methods to authenticated;
grant insert (organization_id, label, kind, sort_order, is_active) on public.payment_methods to authenticated;
grant update (label, kind, sort_order, is_active) on public.payment_methods to authenticated;

grant select on public.customers to authenticated;
grant insert (organization_id, name, phone, address, notes) on public.customers to authenticated;
grant update (name, phone, address, notes, is_active) on public.customers to authenticated;

grant select on public.sales, public.sale_items, public.sale_item_costs, public.sale_payments,
  public.sale_returns, public.sale_return_items to authenticated;

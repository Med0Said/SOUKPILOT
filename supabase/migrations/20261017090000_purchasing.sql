-- SoukPilot — Milestone 5: purchasing (purchase orders, receipts against
-- orders, supplier payments, supplier balances).
--
-- Rules:
--   * A purchase order never moves stock. Receiving goods does, through
--     private.apply_stock_lines (same ledger, same guarantees as M3).
--   * Partial receipts are tracked per order line (received_quantity) and can
--     never exceed the ordered quantity.
--   * Supplier balance = Σ value of goods received from the supplier (receipt
--     lines with a known unit cost) − Σ supplier payments (+ Σ refunds).
--   * Ordered / received history is never edited: cancel or close the order.
--   * All purchasing data contains purchase costs: owner/manager only.

-- ---------------------------------------------------------------------------
-- Receipt totals (maintained from lines; covers M3 direct receipts too)
-- ---------------------------------------------------------------------------
alter table public.stock_receipts
  add column total_cost_millimes bigint not null default 0 check (total_cost_millimes >= 0),
  add column lines_without_cost integer not null default 0 check (lines_without_cost >= 0),
  add column purchase_order_id uuid;

alter table public.stock_receipt_lines
  add column purchase_order_item_id uuid;

update public.stock_receipts r
set total_cost_millimes = coalesce((select sum(l.quantity::numeric * l.unit_cost_millimes)
                                    from public.stock_receipt_lines l
                                    where l.receipt_id = r.id and l.unit_cost_millimes is not null), 0)::bigint,
    lines_without_cost = (select count(*) from public.stock_receipt_lines l
                          where l.receipt_id = r.id and l.unit_cost_millimes is null);

create function private.accumulate_receipt_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.stock_receipts
  set total_cost_millimes = total_cost_millimes + coalesce(new.quantity::numeric * new.unit_cost_millimes, 0)::bigint,
      lines_without_cost = lines_without_cost + case when new.unit_cost_millimes is null then 1 else 0 end
  where id = new.receipt_id;
  return null;
end;
$$;
revoke execute on function private.accumulate_receipt_total() from public;
create trigger stock_receipt_lines_accumulate_total
  after insert on public.stock_receipt_lines
  for each row execute function private.accumulate_receipt_total();

-- Receipt lines are history.
create trigger stock_receipt_lines_immutable before update or delete on public.stock_receipt_lines
  for each row execute function private.prevent_change();

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number bigint,
  status text not null default 'draft'
    check (status in ('draft', 'ordered', 'partially_received', 'received', 'closed', 'cancelled')),
  supplier_id uuid not null,
  location_id uuid not null,
  expected_date date,
  reference text check (reference is null or char_length(reference) <= 80),
  note text check (note is null or char_length(note) <= 1000),
  ordered_total_millimes bigint not null default 0 check (ordered_total_millimes between 0 and 1000000000000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ordered_by uuid references auth.users (id) on delete set null,
  ordered_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  closed_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, number),
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  -- Numbers are assigned when the order is placed; a cancelled draft has none.
  check (status <> 'draft' or number is null),
  check (status not in ('ordered', 'partially_received', 'received', 'closed') or number is not null),
  check ((status in ('closed', 'cancelled')) = (closed_at is not null))
);
create index purchase_orders_org_status_idx on public.purchase_orders (organization_id, status, created_at desc);
create index purchase_orders_org_supplier_idx on public.purchase_orders (organization_id, supplier_id);
create trigger purchase_orders_set_updated_at before update on public.purchase_orders
  for each row execute function private.set_updated_at();

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  purchase_order_id uuid not null,
  line_no integer not null check (line_no between 1 and 500),
  variant_id uuid not null,
  quantity integer not null check (quantity between 1 and 1000000),
  unit_cost_millimes bigint not null check (unit_cost_millimes between 0 and 1000000000000),
  received_quantity integer not null default 0,
  unique (purchase_order_id, line_no),
  unique (purchase_order_id, variant_id),
  foreign key (organization_id, purchase_order_id) references public.purchase_orders (organization_id, id) on delete cascade,
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id),
  check (received_quantity between 0 and quantity)
);

alter table public.stock_receipts
  add constraint stock_receipts_purchase_order_fkey
  foreign key (organization_id, purchase_order_id) references public.purchase_orders (organization_id, id);
alter table public.stock_receipt_lines
  add constraint stock_receipt_lines_po_item_fkey
  foreign key (purchase_order_item_id) references public.purchase_order_items (id);
create index stock_receipts_org_supplier_idx on public.stock_receipts (organization_id, supplier_id) where supplier_id is not null;
create index stock_receipts_po_idx on public.stock_receipts (purchase_order_id) where purchase_order_id is not null;

-- Only drafts may change lines; ordered lines may only advance received_quantity.
create function private.protect_purchase_order_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_row public.purchase_order_items := case when tg_op = 'DELETE' then old else new end;
begin
  select po.status into v_status from public.purchase_orders po where po.id = v_row.purchase_order_id;
  if v_status is null or v_status = 'draft' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op <> 'UPDATE'
     or (to_jsonb(new) - 'received_quantity') <> (to_jsonb(old) - 'received_quantity')
     or new.received_quantity < old.received_quantity then
    raise exception 'purchase_order_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.protect_purchase_order_item() from public;
create trigger purchase_order_items_protect before insert or update or delete on public.purchase_order_items
  for each row execute function private.protect_purchase_order_item();

create function private.protect_purchase_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'purchase_order_locked' using errcode = '42501';
  end if;
  if old.status <> 'draft' and (
       new.supplier_id <> old.supplier_id or new.location_id <> old.location_id
       or new.ordered_total_millimes <> old.ordered_total_millimes or new.number <> old.number
       or new.ordered_at is distinct from old.ordered_at)
  then
    raise exception 'purchase_order_locked' using errcode = '42501';
  end if;
  if old.status in ('received', 'closed', 'cancelled') and new.status <> old.status then
    raise exception 'purchase_order_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.protect_purchase_order() from public;
create trigger purchase_orders_protect before update or delete on public.purchase_orders
  for each row execute function private.protect_purchase_order();

-- ---------------------------------------------------------------------------
-- Supplier payments (kind 'refund' = money returned by the supplier)
-- ---------------------------------------------------------------------------
create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  supplier_id uuid not null,
  method_id uuid not null,
  kind text not null check (kind in ('payment', 'refund')),
  amount_millimes bigint not null check (amount_millimes between 1 and 1000000000000),
  paid_on date not null,
  reference text check (reference is null or char_length(reference) <= 80),
  note text check (note is null or char_length(note) <= 500),
  purchase_order_id uuid,
  idempotency_key uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id),
  foreign key (organization_id, method_id) references public.payment_methods (organization_id, id),
  foreign key (organization_id, purchase_order_id) references public.purchase_orders (organization_id, id)
);
create index supplier_payments_org_supplier_idx on public.supplier_payments (organization_id, supplier_id, paid_on desc);
create trigger supplier_payments_immutable before update or delete on public.supplier_payments
  for each row execute function private.prevent_change();

-- ---------------------------------------------------------------------------
-- RLS: owner/manager read; writes via functions only.
-- ---------------------------------------------------------------------------
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.supplier_payments enable row level security;

create policy purchase_orders_select_manager on public.purchase_orders for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));
create policy purchase_order_items_select_manager on public.purchase_order_items for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));
create policy supplier_payments_select_manager on public.supplier_payments for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));

revoke all on public.purchase_orders, public.purchase_order_items, public.supplier_payments from anon, authenticated;
grant select on public.purchase_orders, public.purchase_order_items, public.supplier_payments to authenticated;

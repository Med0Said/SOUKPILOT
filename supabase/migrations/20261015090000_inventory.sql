-- SoukPilot — Milestone 3: inventory.
--
-- Model (docs/DATABASE_SCHEMA.md §2c):
--   * stock_movements: APPEND-ONLY ledger, the source of truth. No API role
--     can insert, update or delete it directly.
--   * stock_levels: current balance per (location, variant), written only by
--     private.apply_stock_lines() in the same transaction as the movements,
--     under a row lock taken in a fixed order (variant_id, location_id).
--     CHECK (quantity >= 0): negative stock is impossible.
--   * Documents explain every movement: receipts, adjustments (incl. opening
--     stock), stock counts, transfers. Each has a per-organization number and
--     an idempotency key so a repeated submission never applies twice.
--   * Purchase costs appear only on receipt / opening lines, which are
--     readable by owner/manager only. Movements carry no cost.

-- ---------------------------------------------------------------------------
-- Document numbering (gap-free per organization and document type)
-- ---------------------------------------------------------------------------
create table public.document_sequences (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  doc_type text not null check (doc_type ~ '^[a-z_]+$'),
  next_value bigint not null check (next_value > 0),
  primary key (organization_id, doc_type)
);

-- Returns the next number; the row lock serializes numbering until commit,
-- and a rollback also rolls back the increment (no gaps).
create function private.next_document_number(p_organization_id uuid, p_doc_type text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.document_sequences as s (organization_id, doc_type, next_value)
  values (p_organization_id, p_doc_type, 2)
  on conflict (organization_id, doc_type) do update set next_value = s.next_value + 1
  returning s.next_value - 1;
$$;
revoke execute on function private.next_document_number(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Ledger and balances
-- ---------------------------------------------------------------------------
create type public.stock_movement_type as enum (
  'opening',
  'purchase_receipt',
  'sale',
  'customer_return',
  'supplier_return',
  'adjustment',
  'transfer_out',
  'transfer_in'
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  -- Application order. Assigned at insert time while the stock_levels row is
  -- locked, so for one (location, variant) it follows the real order of
  -- changes. (created_at is the TRANSACTION start time and can disagree under
  -- concurrency.)
  seq bigint generated always as identity unique,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  variant_id uuid not null,
  quantity_delta integer not null check (quantity_delta <> 0),
  -- Balance at this location right after the movement (audit convenience;
  -- the reconciliation check proves it against the running sum).
  quantity_after integer not null check (quantity_after >= 0),
  movement_type public.stock_movement_type not null,
  source_type text not null check (source_type in ('stock_receipt', 'stock_adjustment', 'stock_count', 'stock_transfer', 'sale', 'sale_return', 'supplier_return')),
  source_id uuid not null,
  reason text check (reason is null or char_length(reason) <= 500),
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id),
  -- A document line is applied at most once.
  unique (source_type, source_id, variant_id, location_id, movement_type),
  check (movement_type <> 'adjustment' or reason is not null)
);
create index stock_movements_org_variant_idx on public.stock_movements (organization_id, variant_id, created_at desc);
create index stock_movements_org_location_idx on public.stock_movements (organization_id, location_id, created_at desc);
create index stock_movements_org_created_idx on public.stock_movements (organization_id, created_at desc);

create function private.prevent_ledger_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'stock_ledger_immutable' using errcode = '42501';
end;
$$;
revoke execute on function private.prevent_ledger_change() from public;
create trigger stock_movements_immutable
  before update or delete on public.stock_movements
  for each row execute function private.prevent_ledger_change();

create table public.stock_levels (
  organization_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (location_id, variant_id),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id)
);
create index stock_levels_org_variant_idx on public.stock_levels (organization_id, variant_id);

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

-- Goods received (without purchase order in M3; M5 links purchase orders).
create table public.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number bigint not null,
  location_id uuid not null,
  supplier_id uuid,
  reference text check (reference is null or char_length(reference) <= 80),
  note text check (note is null or char_length(note) <= 1000),
  idempotency_key uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, number),
  unique (organization_id, idempotency_key),
  unique (organization_id, id),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id)
);

create table public.stock_receipt_lines (
  receipt_id uuid not null references public.stock_receipts (id) on delete cascade,
  organization_id uuid not null,
  variant_id uuid not null,
  quantity integer not null check (quantity between 1 and 1000000),
  unit_cost_millimes bigint check (unit_cost_millimes is null or unit_cost_millimes between 0 and 1000000000000),
  primary key (receipt_id, variant_id),
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id)
);

-- Opening stock and manual adjustments.
--   kind 'opening'   : applied immediately (initial quantities), lines > 0.
--   kind 'adjustment': created 'pending' by any member with a reason, applied
--                      only when an owner/manager approves it.
create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number bigint not null,
  kind text not null check (kind in ('opening', 'adjustment')),
  status text not null check (status in ('pending', 'approved', 'rejected')),
  location_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 500),
  idempotency_key uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  unique (organization_id, number),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  check ((status = 'pending') = (reviewed_at is null)),
  check (kind = 'adjustment' or status = 'approved')
);
create index stock_adjustments_org_status_idx on public.stock_adjustments (organization_id, status, created_at desc);

create table public.stock_adjustment_lines (
  adjustment_id uuid not null references public.stock_adjustments (id) on delete cascade,
  organization_id uuid not null,
  variant_id uuid not null,
  quantity_delta integer not null check (quantity_delta <> 0 and quantity_delta between -1000000 and 1000000),
  primary key (adjustment_id, variant_id),
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id)
);

-- Opening cost per line (owner/manager only, like receipts).
create table public.stock_opening_costs (
  adjustment_id uuid not null references public.stock_adjustments (id) on delete cascade,
  organization_id uuid not null,
  variant_id uuid not null,
  unit_cost_millimes bigint not null check (unit_cost_millimes between 0 and 1000000000000),
  primary key (adjustment_id, variant_id)
);

-- Physical stock counts.
create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number bigint not null,
  location_id uuid not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'approved', 'cancelled')),
  note text check (note is null or char_length(note) <= 500),
  idempotency_key uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  unique (organization_id, number),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, location_id) references public.locations (organization_id, id)
);
create index stock_counts_org_status_idx on public.stock_counts (organization_id, status, created_at desc);

create table public.stock_count_items (
  count_id uuid not null references public.stock_counts (id) on delete cascade,
  organization_id uuid not null,
  variant_id uuid not null,
  -- Book quantity at the moment THIS item was counted (not when the count
  -- started), so sales between counting and approval are preserved.
  expected_quantity integer check (expected_quantity is null or expected_quantity >= 0),
  counted_quantity integer check (counted_quantity is null or counted_quantity between 0 and 1000000),
  counted_by uuid references auth.users (id) on delete set null,
  counted_at timestamptz,
  primary key (count_id, variant_id),
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id),
  check ((counted_quantity is null) = (counted_at is null)),
  check ((counted_quantity is null) = (expected_quantity is null))
);

-- Transfers between two locations of the same organization.
create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number bigint not null,
  from_location_id uuid not null,
  to_location_id uuid not null,
  note text check (note is null or char_length(note) <= 500),
  idempotency_key uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, number),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, from_location_id) references public.locations (organization_id, id),
  foreign key (organization_id, to_location_id) references public.locations (organization_id, id),
  check (from_location_id <> to_location_id)
);

create table public.stock_transfer_lines (
  transfer_id uuid not null references public.stock_transfers (id) on delete cascade,
  organization_id uuid not null,
  variant_id uuid not null,
  quantity integer not null check (quantity between 1 and 1000000),
  primary key (transfer_id, variant_id),
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id)
);

-- ---------------------------------------------------------------------------
-- RLS: reads only. Every write goes through SECURITY DEFINER functions.
-- ---------------------------------------------------------------------------
alter table public.document_sequences enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_levels enable row level security;
alter table public.stock_receipts enable row level security;
alter table public.stock_receipt_lines enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.stock_adjustment_lines enable row level security;
alter table public.stock_opening_costs enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_items enable row level security;
alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_lines enable row level security;

-- Stock quantities and history: every member (cashiers check stock).
create policy stock_movements_select_member on public.stock_movements for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy stock_levels_select_member on public.stock_levels for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy stock_adjustments_select_member on public.stock_adjustments for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy stock_adjustment_lines_select_member on public.stock_adjustment_lines for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy stock_counts_select_member on public.stock_counts for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy stock_count_items_select_member on public.stock_count_items for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy stock_transfers_select_member on public.stock_transfers for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy stock_transfer_lines_select_member on public.stock_transfer_lines for select to authenticated
  using ((select private.is_org_member(organization_id)));

-- Receipts and opening costs carry purchase costs: owner/manager only.
create policy stock_receipts_select_manager on public.stock_receipts for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));
create policy stock_receipt_lines_select_manager on public.stock_receipt_lines for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));
create policy stock_opening_costs_select_manager on public.stock_opening_costs for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])));
-- document_sequences: no policy (internal).

revoke all on public.document_sequences, public.stock_movements, public.stock_levels,
  public.stock_receipts, public.stock_receipt_lines, public.stock_adjustments,
  public.stock_adjustment_lines, public.stock_opening_costs, public.stock_counts,
  public.stock_count_items, public.stock_transfers, public.stock_transfer_lines
  from anon, authenticated;

grant select on public.stock_movements, public.stock_levels, public.stock_receipts,
  public.stock_receipt_lines, public.stock_adjustments, public.stock_adjustment_lines,
  public.stock_opening_costs, public.stock_counts, public.stock_count_items,
  public.stock_transfers, public.stock_transfer_lines
  to authenticated;

-- SoukPilot — Phase C (audit finding P2): set-based RLS for SELECT policies.
--
-- Before: `using ((select private.is_org_member(organization_id)))`. Because
-- the function takes the row's column, Postgres runs it once PER ROW (≈5 µs:
-- 246 ms just to count 50 000 sales). After: the caller's organizations are
-- computed once per query and each row is a hash lookup (6 ms for the same count).
--
-- Same rule, same result: a row is visible iff its organization is one the
-- caller belongs to (with an owner/manager role where the policy required it).
-- Proven by tests/db/rls-set-based.test.ts, which compares, for every table
-- and every kind of user, the rows visible now with the rows the original
-- predicate allows. Only SELECT policies change; INSERT/UPDATE/DELETE checks
-- (single-row writes) keep the original functions. No table, data or
-- function behaviour changes.

-- Organizations of the signed-in user (SECURITY DEFINER: reads memberships
-- without RLS, exactly like private.is_org_member).
create function private.member_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id from public.organization_members m where m.user_id = (select auth.uid());
$$;

-- Organizations where the signed-in user has one of these roles.
create function private.org_ids_with_role(p_roles public.org_role[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id from public.organization_members m
  where m.user_id = (select auth.uid()) and m.role = any (p_roles);
$$;

revoke execute on function private.member_org_ids() from public;
revoke execute on function private.org_ids_with_role(public.org_role[]) from public;
grant execute on function private.member_org_ids() to authenticated;
grant execute on function private.org_ids_with_role(public.org_role[]) to authenticated;

-- Members of the organization.
alter policy categories_select_member on public.categories
  using (organization_id in (select private.member_org_ids()));
alter policy customers_select_member on public.customers
  using (organization_id in (select private.member_org_ids()));
alter policy locations_select_member on public.locations
  using (organization_id in (select private.member_org_ids()));
alter policy organization_integrations_select_member on public.organization_integrations
  using (organization_id in (select private.member_org_ids()));
alter policy organization_members_select_member on public.organization_members
  using (organization_id in (select private.member_org_ids()));
alter policy payment_methods_select_member on public.payment_methods
  using (organization_id in (select private.member_org_ids()));
alter policy product_variants_select_member on public.product_variants
  using (organization_id in (select private.member_org_ids()));
alter policy products_select_member on public.products
  using (organization_id in (select private.member_org_ids()));
alter policy sale_items_select_member on public.sale_items
  using (organization_id in (select private.member_org_ids()));
alter policy sale_payments_select_member on public.sale_payments
  using (organization_id in (select private.member_org_ids()));
alter policy sale_return_items_select_member on public.sale_return_items
  using (organization_id in (select private.member_org_ids()));
alter policy sale_returns_select_member on public.sale_returns
  using (organization_id in (select private.member_org_ids()));
alter policy sales_select_member on public.sales
  using (organization_id in (select private.member_org_ids()));
alter policy stock_adjustment_lines_select_member on public.stock_adjustment_lines
  using (organization_id in (select private.member_org_ids()));
alter policy stock_adjustments_select_member on public.stock_adjustments
  using (organization_id in (select private.member_org_ids()));
alter policy stock_count_items_select_member on public.stock_count_items
  using (organization_id in (select private.member_org_ids()));
alter policy stock_counts_select_member on public.stock_counts
  using (organization_id in (select private.member_org_ids()));
alter policy stock_levels_select_member on public.stock_levels
  using (organization_id in (select private.member_org_ids()));
alter policy stock_movements_select_member on public.stock_movements
  using (organization_id in (select private.member_org_ids()));
alter policy stock_transfer_lines_select_member on public.stock_transfer_lines
  using (organization_id in (select private.member_org_ids()));
alter policy stock_transfers_select_member on public.stock_transfers
  using (organization_id in (select private.member_org_ids()));
alter policy organizations_select_member on public.organizations
  using (id in (select private.member_org_ids()));

-- Owners and managers only (costs, suppliers, purchasing, audit, invitations, imports).
alter policy audit_logs_select_manager on public.audit_logs
  using (organization_id in (select private.org_ids_with_role(array['owner', 'manager']::public.org_role[])));
alter policy catalog_import_batches_select_manager on public.catalog_import_batches
  using (organization_id in (select private.org_ids_with_role(array['owner', 'manager']::public.org_role[])));
alter policy organization_invitations_select_manager on public.organization_invitations
  using (organization_id in (select private.org_ids_with_role(array['owner', 'manager']::public.org_role[])));
alter policy product_variant_costs_select_manager on public.product_variant_costs
  using (organization_id in (select private.org_ids_with_role(array['owner', 'manager']::public.org_role[])));
alter policy purchase_order_items_select_manager on public.purchase_order_items
  using (organization_id in (select private.org_ids_with_role(array['owner', 'manager']::public.org_role[])));
alter policy purchase_orders_select_manager on public.purchase_orders
  using (organization_id in (select private.org_ids_with_role(array['owner', 'manager']::public.org_role[])));
alter policy sale_item_costs_select_manager on public.sale_item_costs
  using (organization_id in (select private.org_ids_with_role(array['owner', 'manager']::public.org_role[])));
alter policy stock_opening_costs_select_manager on public.stock_opening_costs
  using (organization_id in (select private.org_ids_with_role(array['owner', 'manager']::public.org_role[])));
alter policy stock_receipt_lines_select_manager on public.stock_receipt_lines
  using (organization_id in (select private.org_ids_with_role(array['owner', 'manager']::public.org_role[])));
alter policy stock_receipts_select_manager on public.stock_receipts
  using (organization_id in (select private.org_ids_with_role(array['owner', 'manager']::public.org_role[])));
alter policy supplier_payments_select_manager on public.supplier_payments
  using (organization_id in (select private.org_ids_with_role(array['owner', 'manager']::public.org_role[])));
alter policy suppliers_select_manager on public.suppliers
  using (organization_id in (select private.org_ids_with_role(array['owner', 'manager']::public.org_role[])));

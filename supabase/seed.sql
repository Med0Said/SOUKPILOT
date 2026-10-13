-- SoukPilot — DEVELOPMENT SEED ONLY. Never run against production.
-- Applied automatically by `npx supabase db reset` (local stack).
--
-- Creates two demo tenants to try tenant isolation by hand:
--   Org "Boutique Démo Tunis"   : owner.demo@soukpilot.test (owner), caisse.demo@soukpilot.test (cashier)
--   Org "Cosmétiques Démo Sfax" : owner.sfax@soukpilot.test (owner)
-- All demo accounts use the development-only password: SoukPilot-dev-2026
--
-- STATUS: written against the GoTrue auth schema used by Supabase CLI 2.x but
-- NOT yet executed (no Docker on the machine where it was written). If GoTrue
-- rejects these users, create accounts through /signup instead (emails land in
-- the local Mailpit inbox at http://127.0.0.1:54324).

do $$
declare
  v_owner_tunis uuid := '11111111-1111-4111-8111-111111111111';
  v_cashier_tunis uuid := '22222222-2222-4222-8222-222222222222';
  v_owner_sfax uuid := '33333333-3333-4333-8333-333333333333';
  v_org_tunis uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_org_sfax uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_user record;
begin
  for v_user in
    select * from (values
      (v_owner_tunis, 'owner.demo@soukpilot.test', 'Amal Démo'),
      (v_cashier_tunis, 'caisse.demo@soukpilot.test', 'Chaima Démo'),
      (v_owner_sfax, 'owner.sfax@soukpilot.test', 'Bilel Démo')
    ) as t(id, email, full_name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user.id, 'authenticated', 'authenticated', v_user.email,
      extensions.crypt('SoukPilot-dev-2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_user.full_name), now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), v_user.id, v_user.id::text, 'email',
      jsonb_build_object('sub', v_user.id::text, 'email', v_user.email, 'email_verified', true),
      now(), now(), now()
    );
  end loop;

  -- Organizations are normally created with public.create_organization(),
  -- which needs a signed-in user; the seed inserts the same rows directly.
  insert into public.organizations (id, name, created_by) values
    (v_org_tunis, 'Boutique Démo Tunis', v_owner_tunis),
    (v_org_sfax, 'Cosmétiques Démo Sfax', v_owner_sfax);

  insert into public.organization_members (organization_id, user_id, role) values
    (v_org_tunis, v_owner_tunis, 'owner'),
    (v_org_tunis, v_cashier_tunis, 'cashier'),
    (v_org_sfax, v_owner_sfax, 'owner');

  insert into public.locations (organization_id, name, code) values
    (v_org_tunis, 'Boutique principale', 'MAIN'),
    (v_org_sfax, 'Boutique principale', 'MAIN');
end;
$$;

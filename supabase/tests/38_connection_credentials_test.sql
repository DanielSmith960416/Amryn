-- A customer's payment credential, and who can read it back.
--
-- The key a customer hands over for Paystack can also initialise a
-- transaction, charge a stored authorisation and take a partial debit — the
-- gateway offers no read-only scope. So the interesting assertions here are
-- not that storing works. They are:
--
--   · that the web application, which runs as the signed-in person, cannot
--     read a credential back at all,
--   · that a member without manage_integrations cannot store one,
--   · that rotating a key replaces it rather than leaving the old one live in
--     the Vault where nobody can see it and nobody deletes it,
--   · that disconnecting actually deletes it.
--
-- The Vault is shimmed for these tests (see 00_supabase_shim.sql) with the
-- hosted database's real grants, copied rather than guessed.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.check(ok boolean, what text) returns void
language plpgsql as $$
begin
  if ok then raise notice 'pass  %', what;
  else raise exception 'FAIL  %', what; end if;
end $$;

create or replace function pg_temp.refused(stmt text, needle text) returns boolean
language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  if position(lower(needle) in lower(sqlerrm)) > 0 then return true; end if;
  raise exception 'statement failed for an unrelated reason: %', sqlerrm;
end $$;

create or replace function pg_temp.act_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
end $$;

-- ── fixtures ──────────────────────────────────────────────────────────────

set local role postgres;

insert into auth.users (id, email) values
  ('c1111111-1111-1111-1111-111111111111', 'admin@alpha.test'),
  ('c2222222-2222-2222-2222-222222222222', 'exec@alpha.test');

insert into public.organisations (id, name, slug) values
  ('c0000000-0000-0000-0000-0000000000a1', 'Alpha Trading', 'alpha-trading-credentials');

insert into public.subscriptions (organisation_id, plan, status) values
  ('c0000000-0000-0000-0000-0000000000a1', 'starter', 'active');

-- manage_integrations belongs to org_admin and super_admin only. An executive
-- is the useful contrast: they hold almost everything else, so a refusal for
-- them is a refusal about this permission and not about membership.
insert into public.organisation_members (organisation_id, user_id, role, scope_kind, scope_ids) values
  ('c0000000-0000-0000-0000-0000000000a1', 'c1111111-1111-1111-1111-111111111111', 'org_admin', 'organisation', '{}'),
  ('c0000000-0000-0000-0000-0000000000a1', 'c2222222-2222-2222-2222-222222222222', 'executive', 'organisation', '{}');

insert into public.data_sources (id, organisation_id, name, category, provider) values
  ('ca000000-0000-0000-0000-0000000000a1'::uuid, 'c0000000-0000-0000-0000-0000000000a1',
   'Paystack', 'api', 'paystack');

insert into public.data_connections (id, organisation_id, data_source_id) values
  ('cc000000-0000-0000-0000-0000000000a1'::uuid, 'c0000000-0000-0000-0000-0000000000a1',
   'ca000000-0000-0000-0000-0000000000a1'::uuid);

-- ── who may store one ─────────────────────────────────────────────────────

set local role authenticated;
select pg_temp.act_as('c2222222-2222-2222-2222-222222222222');

select pg_temp.check(
  pg_temp.refused(
    $$select public.store_connection_credential(
        'cc000000-0000-0000-0000-0000000000a1'::uuid, 'sk_test_should_not_land')$$,
    'permission'),
  'an executive without manage_integrations cannot hand over a key');

select pg_temp.act_as('c1111111-1111-1111-1111-111111111111');

select pg_temp.check(
  public.store_connection_credential(
    'cc000000-0000-0000-0000-0000000000a1'::uuid, 'sk_test_first') is not null,
  'an administrator can');

-- ── what lands in the tenant database ─────────────────────────────────────
--
-- The property the whole design turns on. data_connections may hold a handle
-- and must never hold the key: a backup dump, a support query or a
-- mis-scoped select would otherwise carry a live payment credential.

set local role postgres;

select pg_temp.check(
  (select credential_ref from public.data_connections
    where id = 'cc000000-0000-0000-0000-0000000000a1'::uuid) is not null,
  'the connection carries a handle');

select pg_temp.check(
  (select credential_ref from public.data_connections
    where id = 'cc000000-0000-0000-0000-0000000000a1'::uuid) <> 'sk_test_first',
  'and the handle is not the key');

select pg_temp.check(
  not exists (
    select 1 from public.data_connections
     where id = 'cc000000-0000-0000-0000-0000000000a1'::uuid
       and (config::text like '%sk_test_first%' or coalesce(last_error, '') like '%sk_test_first%')),
  'and nothing else on the row quietly carries it either');

-- ── rotating replaces rather than accumulates ─────────────────────────────

set local role authenticated;
select pg_temp.act_as('c1111111-1111-1111-1111-111111111111');
select public.store_connection_credential(
  'cc000000-0000-0000-0000-0000000000a1'::uuid, 'sk_test_second');

set local role postgres;

select pg_temp.check(
  (select count(*) from vault.secrets
    where name = 'connection:cc000000-0000-0000-0000-0000000000a1') = 1,
  'a rotated key leaves one secret behind, not two');

select pg_temp.check(
  public.connection_credential(
    (select credential_ref from public.data_connections
      where id = 'cc000000-0000-0000-0000-0000000000a1'::uuid)) = 'sk_test_second',
  'and the one that is left is the new key');

-- ── who may read one back ─────────────────────────────────────────────────

select pg_temp.check(
  not has_function_privilege('authenticated', 'public.connection_credential(text)', 'execute'),
  'a signed-in session cannot read a credential, its own organisation''s included');

select pg_temp.check(
  not has_function_privilege('anon', 'public.connection_credential(text)', 'execute'),
  'and neither can a caller with no session');

select pg_temp.check(
  has_function_privilege('service_role', 'public.connection_credential(text)', 'execute'),
  'the worker can, which is the only thing that needs to');

-- The door is narrow only if the wall around it holds. Supabase grants the
-- Vault to service_role alone; this fails if a later migration widens it.
select pg_temp.check(
  not has_table_privilege('authenticated', 'vault.decrypted_secrets', 'select')
  and not has_table_privilege('anon', 'vault.decrypted_secrets', 'select'),
  'and no session can go round it by reading the Vault directly');

-- ── disconnecting ─────────────────────────────────────────────────────────

set local role authenticated;
select pg_temp.act_as('c1111111-1111-1111-1111-111111111111');
select public.forget_connection_credential('cc000000-0000-0000-0000-0000000000a1'::uuid);

set local role postgres;

select pg_temp.check(
  (select count(*) from vault.secrets
    where name = 'connection:cc000000-0000-0000-0000-0000000000a1') = 0,
  'disconnecting deletes the secret rather than orphaning it');

select pg_temp.check(
  (select credential_ref from public.data_connections
    where id = 'cc000000-0000-0000-0000-0000000000a1'::uuid) is null,
  'and clears the handle that pointed at it');

-- Somebody who revoked the key at Paystack first and disconnected afterwards
-- has done the right thing in the wrong order. They should not meet an error.
set local role authenticated;
select pg_temp.act_as('c1111111-1111-1111-1111-111111111111');
select public.forget_connection_credential('cc000000-0000-0000-0000-0000000000a1'::uuid);
select pg_temp.check(true, 'forgetting a credential that is already gone is quiet');

set local role postgres;

select pg_temp.check(
  (select count(*) from public.audit_logs
    where action in ('connection.credential_stored', 'connection.credential_forgotten')) = 3,
  'two stores and one deletion are on the audit log');

select pg_temp.check(
  not exists (
    select 1 from public.audit_logs
     where summary like '%sk_test%'),
  'and none of them wrote the key into it');

rollback;

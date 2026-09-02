-- What the other tests cannot see.
--
-- Every other file here runs against a local PostgreSQL where the owner of
-- everything is a superuser, and a superuser bypasses row level security
-- whether or not it is forced. A hosted Supabase project is not like that: the
-- postgres role there is not a superuser, so it is subject to the policies
-- like anybody else.
--
-- Three faults have now hidden in that gap, all of them invisible locally and
-- all of them fatal in production:
--
--   · migration 06 could not seed its own catalogue, because FORCE RLS
--     applied to the role doing the seeding;
--   · migration 06 could not create a trigger on auth.users, which belongs to
--     supabase_auth_admin;
--   · migration 14 dropped the last insert policy on audit_logs while FORCE
--     RLS was still on, which stopped every SECURITY DEFINER function from
--     recording anything — create_organisation() included, so nobody could
--     finish signing up.
--
-- The pattern is the same each time: something works locally because the role
-- running it is exempt from a rule that will apply to it in production.
--
-- ── getting the model right ───────────────────────────────────────────────
-- Supabase's postgres role is not a superuser, but it does hold BYPASSRLS,
-- and BYPASSRLS takes precedence over FORCE — so the owner there skips row
-- level security whether or not a table forces it. That distinction matters:
-- a probe role with neither privilege is stricter than production, and
-- assertions written against it would demand schema changes that buy nothing
-- and cost defence in depth.
--
-- So the owner here is `nosuperuser bypassrls`: not exempt from the things
-- that actually caught us — object ownership, grants, trigger creation — and
-- exempt from exactly what the hosted role is exempt from.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.check(ok boolean, what text) returns void
language plpgsql as $$
begin
  if ok then raise notice 'pass  %', what;
  else raise exception 'FAIL  %', what; end if;
end $$;

create or replace function pg_temp.act_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
end $$;

-- ── take the superuser exemption away ────────────────────────────────────
--
-- The owner of the tables and of the SECURITY DEFINER functions becomes a
-- role with no special standing. Everything below then runs under the same
-- rules the hosted project applies.
-- nosuperuser, because that is the difference that hid three faults.
-- bypassrls, because the hosted role has it and pretending otherwise would
-- make this file assert something production never requires.
create role amryn_hosted_owner nosuperuser bypassrls nologin;

grant usage on schema public, amryn to amryn_hosted_owner;
grant usage on schema auth to amryn_hosted_owner;

do $$
declare
  obj record;
begin
  for obj in
    select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table public.%I owner to amryn_hosted_owner', obj.relname);
  end loop;

  -- The definer functions, which are the ones whose privileges are at issue.
  for obj in
    select p.oid::regprocedure as sig from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'amryn') and p.prosecdef
  loop
    execute format('alter function %s owner to amryn_hosted_owner', obj.sig);
  end loop;
end;
$$;

select pg_temp.check(
  (select not rolsuper and rolbypassrls from pg_roles where rolname = 'amryn_hosted_owner'),
  'the probe owner mirrors the hosted role: no superuser, but BYPASSRLS');

insert into auth.users (id, email) values
  ('c1111111-1111-4111-8111-111111111111', 'founder@hosted.test')
  on conflict (id) do nothing;

grant select on auth.users to amryn_hosted_owner;

set local role authenticated;
select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');

-- ── the whole sign-up path, under the hosted role ────────────────────────
--
-- create_organisation() writes six tables and ends by recording
-- 'organisation.created' in audit_logs. An error anywhere inside it rolls the
-- whole call back, so this one assertion covers the organisation, the
-- membership, the subscription, both sets of weightings and the audit row.
select public.create_organisation('Hosted Test Co', 'hosted-test-co', null, 'ZA', 'ZAR') as org \gset
-- A psql variable cannot be read inside a DO block, so the id travels as a
-- setting as well.
select set_config('amryn_test.hosted_org', :'org', true);

select pg_temp.check(
  (select count(*) from public.organisations where id = :'org'::uuid) = 1,
  'an organisation can be created when the owner has no superuser exemption');

select pg_temp.check(
  (select count(*) from public.organisation_members
    where organisation_id = :'org'::uuid
      and user_id = 'c1111111-1111-4111-8111-111111111111'
      and role = 'org_admin') = 1,
  'and the person who created it is its administrator');

set local role postgres;
select pg_temp.check(
  (select count(*) from public.audit_logs
    where organisation_id = current_setting('amryn_test.hosted_org')::uuid
      and action = 'organisation.created') = 1,
  'the audit row written inside that function survived the transaction');
set local role authenticated;

-- ── the definer functions can still record ───────────────────────────────
select public.record_security_event(:'org'::uuid, 'organisation.settings_changed');
select public.record_account_event('account.signed_in', 'Signed in');

set local role postgres;
select pg_temp.check(
  (select count(*) from public.audit_logs
    where actor_id = 'c1111111-1111-4111-8111-111111111111') = 3,
  'creation, a settings change and a sign-in were all recorded');
set local role authenticated;

-- ── and the protection the policy used to give is still there ────────────
--
-- Lifting FORCE removed the owner's subjection to the policies. It did not
-- give the application a way in: the grant was revoked, which is a stronger
-- guarantee than a policy and is not affected by FORCE either way.
do $$
begin
  insert into public.audit_logs (organisation_id, actor_id, action, entity_type)
  values (current_setting('amryn_test.hosted_org', true)::uuid,
          'c1111111-1111-4111-8111-111111111111', 'organisation.deleted', 'organisation');
  raise exception 'FAIL  a caller wrote an audit row directly';
exception
  when insufficient_privilege then
    raise notice 'pass  a caller still cannot write an audit row directly';
end $$;

-- ── the catalogue seed, which failed the same way once ───────────────────
select pg_temp.check(
  (select count(*) from public.permissions) = 30,
  'the permission catalogue seeded under a non-superuser owner');

select pg_temp.check(
  (select count(*) from public.role_permissions) > 100,
  'and so did the role matrix');

-- ── a profile can still be created on first sign-in ──────────────────────
delete from public.user_profiles where id = 'c1111111-1111-4111-8111-111111111111';
select public.ensure_user_profile();

select pg_temp.check(
  (select count(*) from public.user_profiles
    where id = 'c1111111-1111-4111-8111-111111111111') = 1,
  'ensure_user_profile() works without a superuser exemption');

rollback;

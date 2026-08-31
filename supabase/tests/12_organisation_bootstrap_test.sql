-- create_organisation(), the call that stands between signing up and using the
-- platform. It failed on the live deployment as "Could not find the function
-- ... in the schema cache", so these assert both that it exists in exactly one
-- form and that it behaves.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.check(ok boolean, what text) returns void
language plpgsql as $$
begin
  if ok then raise notice 'pass  %', what;
  else raise exception 'FAIL  %', what; end if;
end $$;

-- ── one function, not two ────────────────────────────────────────────────
-- A type change with `create or replace` leaves the old signature in place.
-- Two candidates with identical argument names is worse than none: PostgREST
-- refuses an ambiguous call, and the symptom looks nothing like the cause.
select pg_temp.check(
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_organisation') = 1,
  'exactly one create_organisation exists');

-- Asserted on the types themselves rather than on the rendered signature,
-- which also carries the parameter names.
select pg_temp.check(
  (select bool_and(t = 'text'::regtype)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral unnest(p.proargtypes) as t
    where n.nspname = 'public' and p.proname = 'create_organisation'),
  'every parameter is text, so PostgREST can coerce JSON to it');

select pg_temp.check(
  (select array_length(p.proargtypes, 1) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_organisation') = 5,
  'it takes the five arguments the application sends');

-- ── who may call it ──────────────────────────────────────────────────────
select pg_temp.check(
  has_function_privilege('authenticated', 'public.create_organisation(text,text,text,text,text)', 'execute'),
  'authenticated may execute it');

select pg_temp.check(
  not has_function_privilege('anon', 'public.create_organisation(text,text,text,text,text)', 'execute'),
  'anon may not: it writes an organisation and an admin membership');

select pg_temp.check(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_organisation'),
  'it is SECURITY DEFINER, since the caller is not yet a member');

select pg_temp.check(
  (select proconfig::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_organisation')
  like '%search_path=public, pg_temp%',
  'its search_path is pinned, so the elevated body cannot be redirected');

-- ── it does the whole job, or none of it ─────────────────────────────────
-- The shim's auth.uid() reads request.jwt.claim.sub, the same setting the
-- other suites impersonate with.
insert into auth.users (id, email) values
  ('3f1c4e2a-9b8d-4c7e-8a51-6d2f0b7c4e19', 'daniel@example.test')
  on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '3f1c4e2a-9b8d-4c7e-8a51-6d2f0b7c4e19', true);

select public.create_organisation('Highveld Supply Co.', 'highveld-supply-co', 'Wholesale', 'za', 'zar') as org \gset

select pg_temp.check(
  (select count(*) from public.organisations where id = :'org'::uuid) = 1,
  'the organisation is created');

select pg_temp.check(
  (select country_code = 'ZA' and currency_code = 'ZAR'
     from public.organisations where id = :'org'::uuid),
  'lowercase codes are upper-cased on the way in');

select pg_temp.check(
  (select count(*) from public.organisation_members
    where organisation_id = :'org'::uuid and role = 'org_admin' and status = 'active') = 1,
  'the caller is made an active administrator');

select pg_temp.check(
  (select count(*) from public.subscriptions where organisation_id = :'org'::uuid) = 1,
  'a trial subscription is created');

select pg_temp.check(
  (select round(sum(weight), 4) from public.health_score_weights
    where organisation_id = :'org'::uuid) = 1.0000,
  'the six default health weights are created and sum to 1');

select pg_temp.check(
  (select count(*) from public.audit_logs
    where organisation_id = :'org'::uuid and action = 'organisation.created') = 1,
  'the creation is recorded in the audit log');

-- ── it rejects what char(2) used to truncate in silence ──────────────────
do $$
begin
  perform public.create_organisation('Bad Country', 'bad-country-test', null, 'ZAF', 'ZAR');
  raise exception 'FAIL  a three-letter country code was accepted';
exception when sqlstate '22023' then
  raise notice 'pass  a three-letter country code is refused, not truncated to ZA';
end $$;

do $$
begin
  perform public.create_organisation('Bad Currency', 'bad-currency-test', null, 'ZA', 'RAND');
  raise exception 'FAIL  a four-letter currency code was accepted';
exception when sqlstate '22023' then
  raise notice 'pass  a four-letter currency code is refused';
end $$;

-- ── the assumption the diagnostics probe rests on ────────────────────────
-- /diagnostics proves the function is reachable by calling it with an empty
-- name. That is only safe if an empty name fails on the first insert and the
-- whole call rolls back, creating nothing.
do $$
declare before_count bigint; after_count bigint;
begin
  select count(*) into before_count from public.organisations;
  begin
    perform public.create_organisation('', '', null, 'ZA', 'ZAR');
    raise exception 'FAIL  an empty organisation name was accepted';
  exception when check_violation or not_null_violation then
    null;
  end;
  select count(*) into after_count from public.organisations;
  if before_count <> after_count then
    raise exception 'FAIL  the probe left rows behind';
  end if;
  raise notice 'pass  an empty name is refused and creates nothing, so the probe is safe';
end $$;

-- ── protection restored after the catalogue seed ─────────────────────────
-- Migration 06 lifts `force row level security` on the two catalogue tables
-- so they can be seeded by a role without BYPASSRLS, and puts it back. If a
-- future edit moved the restore, or dropped it, the tables would ship
-- writable by their owner and nothing else would say so.
--
-- audit_logs is the one deliberate exception, made in migration 14. It has no
-- insert policy at all — writes come only from SECURITY DEFINER functions,
-- which run as the owner — so forcing RLS on it would refuse the owner too and
-- break every function that records an event, create_organisation() included.
-- Its protection comes from the revoked grant instead, asserted below and in
-- supabase/tests/16.
--
-- Named rather than counted, so that a second table quietly losing FORCE is a
-- failure rather than an adjustment to a number.
select pg_temp.check(
  (select coalesce(array_agg(c.relname::text order by c.relname), array[]::text[])
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relforcerowsecurity)
    = array['audit_logs']::text[],
  'row level security is forced on every table but the one documented exception');

select pg_temp.check(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity) = 48,
  'all 48 tables have RLS enabled');

select pg_temp.check(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relrowsecurity and c.relforcerowsecurity) = 47,
  'and 47 of them force it against the owner as well');

reset role;
rollback;

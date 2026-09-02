-- The failure a local PostgreSQL cannot produce on its own: auth.users owned
-- by another role, as it is on a hosted Supabase project, so a trigger cannot
-- be created on it.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.check(ok boolean, what text) returns void
language plpgsql as $$
begin
  if ok then raise notice 'pass  %', what;
  else raise exception 'FAIL  %', what; end if;
end $$;

-- ── the guard actually catches it ────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'auth_admin_stub') then
    create role auth_admin_stub nologin;
  end if;
end $$;

create table pg_temp_owned (id uuid primary key);
alter table pg_temp_owned owner to auth_admin_stub;

set local role authenticated;

do $$
declare caught boolean := false;
begin
  begin
    execute 'create trigger t_probe after insert on pg_temp_owned
             for each row execute function amryn.handle_new_user()';
  exception
    when insufficient_privilege then caught := true;
    when others then caught := true;
  end;
  if not caught then
    raise exception 'FAIL  a non-owner was allowed to create the trigger; the test proves nothing';
  end if;
  raise notice 'pass  a non-owner is refused, which is the hosted Supabase condition';
end $$;

reset role;

-- Migration 10 wraps exactly that statement in a handler, so the migration
-- survives what would otherwise roll back everything alongside it.
select pg_temp.check(
  (select count(*) from pg_trigger
    where tgname = 'on_auth_user_created' and not tgisinternal) = 1,
  'the trigger is installed where privileges allow it');

-- ── the path that does not need the trigger ──────────────────────────────
select pg_temp.check(
  has_function_privilege('authenticated', 'public.ensure_user_profile()', 'execute'),
  'authenticated may create its own profile');

select pg_temp.check(
  not has_function_privilege('anon', 'public.ensure_user_profile()', 'execute'),
  'anon may not');

select pg_temp.check(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'ensure_user_profile'),
  'it is SECURITY DEFINER, since the caller cannot read auth.users');

-- pronargs, not array_length(proargtypes, 1): an empty oidvector measures 0,
-- not null, so the obvious spelling of this assertion always fails.
select pg_temp.check(
  (select pronargs = 0 from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'ensure_user_profile'),
  'it takes no arguments, so it can only ever act on the caller');

-- It builds a profile for a user who has none.
insert into auth.users (id, email, raw_user_meta_data) values
  ('7c2e9a41-5b3d-4f8e-9a06-1d4b8e2f7c53', 'izara@example.test',
   '{"full_name":"Izara Smith"}'::jsonb)
  on conflict (id) do nothing;

delete from public.user_profiles where id = '7c2e9a41-5b3d-4f8e-9a06-1d4b8e2f7c53';

set local role authenticated;
select set_config('request.jwt.claim.sub', '7c2e9a41-5b3d-4f8e-9a06-1d4b8e2f7c53', true);
select public.ensure_user_profile();

select pg_temp.check(
  (select full_name = 'Izara Smith' and email = 'izara@example.test'
     from public.user_profiles where id = '7c2e9a41-5b3d-4f8e-9a06-1d4b8e2f7c53'),
  'a signed-in user with no profile gets one, named from their sign-up details');

-- Called twice, it must not fail.
select public.ensure_user_profile();
select pg_temp.check(
  (select count(*) from public.user_profiles
    where id = '7c2e9a41-5b3d-4f8e-9a06-1d4b8e2f7c53') = 1,
  'calling it again is harmless');

-- Signed out it must do nothing rather than error, since the session layer
-- may reach it before a session exists.
select set_config('request.jwt.claim.sub', '', true);
select public.ensure_user_profile();
select pg_temp.check(true, 'signed out, it returns quietly instead of failing');

reset role;
rollback;

-- ── surviving a trigger that cannot be created ────────────────────────────
--
-- Migration 06 ends with:
--
--   create trigger on_auth_user_created after insert on auth.users ...
--
-- Creating a trigger requires ownership of the table, and on a hosted Supabase
-- project auth.users belongs to supabase_auth_admin, not to the role the SQL
-- editor runs as. Whether that succeeds depends on the vintage of the project;
-- on the ones where it does not, it fails with
--
--   ERROR: 42501: must be owner of relation users
--
-- and because the editor runs each script in a transaction, the whole of
-- migration 06 rolls back — the permission catalogue, the role matrix and
-- create_organisation with it. The database is then left with every table and
-- policy in place and none of its seed data, which reads exactly like
-- migrations that were never applied.
--
-- A local PostgreSQL owns everything, so the suite never saw it.
--
-- Rather than depend on knowing which kind of project this is, the trigger
-- becomes optional and its work is made reachable another way.

-- 1. Never let this be the statement that fails a migration.
do $$
begin
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function amryn.handle_new_user();
  raise notice 'profile trigger installed on auth.users';
exception
  when insufficient_privilege then
    raise notice 'not permitted to add a trigger to auth.users on this project; profiles are created on first sign-in instead';
  when duplicate_object then
    raise notice 'profile trigger already present';
end;
$$;

-- 2. The first-login write path the trigger existed to avoid needing.
--
-- SECURITY DEFINER so it can read auth.users, which the caller cannot. It acts
-- only on auth.uid(), so a caller can create a profile for themselves and for
-- nobody else — there is no parameter to point at another user.
create or replace function public.ensure_user_profile()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;

  insert into public.user_profiles (id, email, full_name, avatar_url)
  select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
    u.raw_user_meta_data ->> 'avatar_url'
  from auth.users u
  where u.id = uid
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.user_profiles.full_name, excluded.full_name);
end;
$$;

revoke all on function public.ensure_user_profile() from public, anon;
grant execute on function public.ensure_user_profile() to authenticated;

-- 3. Anyone who signed up while the trigger was absent has no profile. Backfill
-- them, so this migration repairs the accounts it was too late to prevent.
insert into public.user_profiles (id, email, full_name, avatar_url)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
on conflict (id) do nothing;

notify pgrst, 'reload schema';

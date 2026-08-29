-- ═══════════════════════════════════════════════════════════════════════════
-- Test harness only — never applied to a real Supabase project.
--
-- Recreates the pieces of a hosted Supabase database the migrations depend on
-- (the auth schema, auth.uid(), and the three built-in roles) so the schema
-- and its RLS policies can be exercised against a plain PostgreSQL instance.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- In Supabase this reads the verified JWT claims. Here the test driver sets
-- request.jwt.claim.sub directly to impersonate a user.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to authenticated, anon, service_role;
grant select on auth.users to authenticated, service_role;

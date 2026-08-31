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

-- The whole claim set, as Supabase exposes it. Two-factor enforcement reads
-- `aal` from here — aal1 is a password, aal2 is a password and a second
-- factor — so a test that cannot set it cannot exercise the guard at all.
--
-- Supabase reads request.jwt.claims, set by PostgREST from the verified token.
-- The test driver sets the same thing, which is why every assertion about aal
-- has to state which level it is asserting for: the default of no setting at
-- all is a session that never presented a second factor.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    -- Assembled from the pieces the older tests set, so that a file which
    -- only impersonates a user still gets a coherent claim set rather than
    -- null — which would otherwise read as "no aal" and be correct, but by
    -- accident rather than by construction.
    json_build_object('sub', nullif(current_setting('request.jwt.claim.sub', true), ''))::text
  )::jsonb;
$$;

grant usage on schema auth to authenticated, anon, service_role;
grant select on auth.users to authenticated, service_role;

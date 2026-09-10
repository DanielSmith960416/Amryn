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

-- ── where the extensions live ─────────────────────────────────────────────
--
-- The one difference between this harness and the hosted database that ever
-- mattered. Supabase pre-installs pgcrypto into `extensions`; migration 01
-- asks for it with `create extension if not exists "pgcrypto"` and no schema,
-- which on a plain PostgreSQL puts it in `public` instead.
--
-- Every function that pins `search_path = public, pg_temp` and calls digest()
-- or gen_random_bytes() therefore worked here and raised 42883 in production.
-- Five did: request_subscription, activation_preview, redeem_activation,
-- invitation_preview and accept_invitation — the paid journey and the team
-- journey, both dead, both green in CI.
--
-- Installing it the way Supabase does makes `if not exists` in migration 01 a
-- no-op here too, so the suite exercises the layout that actually ships.
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;

-- Supabase grants USAGE on that schema to the three built-in roles and CREATE
-- to none of them. Both halves matter here. Without the grant the harness is
-- stricter than production and a test fails for a reason production does not
-- have; with CREATE it would be laxer, and the pin added in migration 19 would
-- be resting on a schema an untrusted role could write into.
grant usage on schema extensions to anon, authenticated, service_role;
revoke create on schema extensions from public, anon, authenticated, service_role;

-- The hosted database also puts `extensions` on the search_path of `postgres`
-- and of nobody else:
--
--   postgres        search_path = "$user", public, extensions
--   anon            (no setting)
--   authenticated   (no setting)
--
-- That asymmetry is load-bearing and is reproduced rather than smoothed over.
-- An operator or a migration can call digest() unqualified; a client cannot,
-- and must go through a SECURITY DEFINER function that pins the path itself.
-- Tests which hash a token the way the application hashes it therefore work
-- as postgres and fail as authenticated — here exactly as in production.
alter role postgres set search_path = "$user", public, extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- Storage
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Uploaded files live in Supabase Storage, and the rows describing them live
-- in storage.objects with row level security over them exactly like any other
-- table. Migration 37 writes policies against it.
--
-- Those policies are the whole of the tenant isolation for files. Leaving them
-- untested because the schema they attach to belongs to Supabase would mean
-- the one guarantee that matters — that a customer cannot fetch another
-- customer's documents — is the one nothing here checks. So enough of the
-- schema is recreated to attach the real policies and exercise them.
--
-- Deliberately minimal: the columns the policies read, and the one function
-- they call. Nothing about how bytes are stored, because no test here stores
-- any.
create schema if not exists storage;

create table if not exists storage.buckets (
  id         text primary key,
  name       text not null,
  public     boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text not null references storage.buckets (id),
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);

-- Supabase's own: the path segments of an object's name, without the last
-- one. 'abc/def.pdf' → {abc}. The policies key on its first element.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1];
$$;

alter table storage.objects enable row level security;

-- Supabase grants these; without them a signed-in caller is refused at the
-- schema before any policy is consulted, which would make the policies below
-- look like they were working when nothing had reached them.
grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;

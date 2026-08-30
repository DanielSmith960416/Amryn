-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 01 — Foundation: tenancy, identity, org structure, RBAC
--
-- Tenancy model
-- -------------
-- Every business table carries organisation_id and is protected by Row Level
-- Security. A member's reach inside their organisation is further narrowed by
-- a *scope*: org-wide, a set of regions, a set of branches, or a set of
-- departments. Scope is resolved in SQL (not in the app) so that a bug in the
-- application layer cannot widen what a user can read.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create schema if not exists amryn;
comment on schema amryn is 'Amryn internal helper functions. Not exposed through PostgREST.';

revoke all on schema amryn from public, anon, authenticated;
grant usage on schema amryn to authenticated, service_role;

-- ── enums ─────────────────────────────────────────────────────────────────

create type public.org_role as enum (
  'super_admin',
  'org_admin',
  'executive',
  'regional_manager',
  'branch_manager',
  'department_manager',
  'analyst',
  'viewer'
);

create type public.scope_kind as enum ('organisation', 'region', 'branch', 'department');

create type public.member_status as enum ('invited', 'active', 'suspended');

create type public.priority_level as enum ('critical', 'high', 'medium', 'low');

create type public.trend_direction as enum ('up', 'down', 'flat');

create type public.subscription_plan as enum ('starter', 'growth', 'professional', 'enterprise');

create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled');

-- ── organisations ─────────────────────────────────────────────────────────

create table public.organisations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(btrim(name)) between 2 and 160),
  slug              citext not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  industry          text,
  country_code      char(2) not null default 'ZA',
  currency_code     char(3) not null default 'ZAR',
  timezone          text not null default 'Africa/Johannesburg',
  fiscal_year_start smallint not null default 1 check (fiscal_year_start between 1 and 12),
  -- Strategy profile the OpportunityRadar® scores relevance against.
  strategy_profile  jsonb not null default '{}'::jsonb,
  settings          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

comment on column public.organisations.strategy_profile is
  'Declared markets, segments, capabilities and growth intents. Feeds opportunity relevance and strategic-alignment scoring.';

-- ── user profiles (mirrors auth.users) ────────────────────────────────────

create table public.user_profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        citext not null,
  full_name    text,
  job_title    text,
  avatar_url   text,
  locale       text not null default 'en-ZA',
  theme        text not null default 'system' check (theme in ('light', 'medium', 'dark', 'system')),
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── organisational structure ──────────────────────────────────────────────

create table public.regions (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name            text not null,
  code            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (organisation_id, name)
);

create table public.branches (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  region_id       uuid references public.regions (id) on delete set null,
  name            text not null,
  code            text,
  city            text,
  opened_on       date,
  headcount       integer check (headcount >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (organisation_id, name)
);

create table public.departments (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  branch_id       uuid references public.branches (id) on delete set null,
  name            text not null,
  function        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (organisation_id, branch_id, name)
);

-- A branch's region, and a department's branch, must belong to the same
-- organisation as the row itself. Two small functions rather than one with a
-- dispatch argument: PL/pgSQL resolves NEW's fields when the expression is
-- planned, so a shared body would reference columns the other table lacks.

create or replace function amryn.assert_branch_region_same_org()
returns trigger
language plpgsql
as $$
declare
  parent_org uuid;
begin
  if new.region_id is not null then
    select organisation_id into parent_org from public.regions where id = new.region_id;
    if parent_org is distinct from new.organisation_id then
      raise exception 'region % belongs to a different organisation', new.region_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function amryn.assert_department_branch_same_org()
returns trigger
language plpgsql
as $$
declare
  parent_org uuid;
begin
  if new.branch_id is not null then
    select organisation_id into parent_org from public.branches where id = new.branch_id;
    if parent_org is distinct from new.organisation_id then
      raise exception 'branch % belongs to a different organisation', new.branch_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger branches_same_org
  before insert or update on public.branches
  for each row execute function amryn.assert_branch_region_same_org();

create trigger departments_same_org
  before insert or update on public.departments
  for each row execute function amryn.assert_department_branch_same_org();

-- ── membership ────────────────────────────────────────────────────────────

create table public.organisation_members (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            public.org_role not null default 'viewer',
  status          public.member_status not null default 'active',
  scope_kind      public.scope_kind not null default 'organisation',
  -- Ids of the regions / branches / departments this member may see. Empty for
  -- scope_kind = 'organisation'.
  scope_ids       uuid[] not null default '{}',
  invited_by      uuid references auth.users (id) on delete set null,
  invited_at      timestamptz,
  joined_at       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, user_id),
  constraint scope_ids_match_kind check (
    (scope_kind = 'organisation' and cardinality(scope_ids) = 0)
    or (scope_kind <> 'organisation' and cardinality(scope_ids) > 0)
  )
);

create index organisation_members_user_idx on public.organisation_members (user_id) where status = 'active';
create index organisation_members_org_idx on public.organisation_members (organisation_id);

-- ── permissions ───────────────────────────────────────────────────────────

create table public.permissions (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  category    text not null,
  description text not null
);

create table public.role_permissions (
  role            public.org_role not null,
  permission_key  text not null references public.permissions (key) on delete cascade,
  primary key (role, permission_key)
);

-- Per-member grants and revocations layered on top of the role defaults.
create table public.member_permission_overrides (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  member_id       uuid not null references public.organisation_members (id) on delete cascade,
  permission_key  text not null references public.permissions (key) on delete cascade,
  granted         boolean not null,
  created_at      timestamptz not null default now(),
  unique (member_id, permission_key)
);

-- ── subscriptions and billing ─────────────────────────────────────────────

create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  organisation_id      uuid not null unique references public.organisations (id) on delete cascade,
  plan                 public.subscription_plan not null default 'starter',
  status               public.subscription_status not null default 'trialing',
  seats                integer not null default 3 check (seats > 0),
  data_source_limit    integer not null default 2 check (data_source_limit >= 0),
  ai_credits_monthly   integer not null default 500 check (ai_credits_monthly >= 0),
  ai_credits_used      integer not null default 0 check (ai_credits_used >= 0),
  price_cents_monthly  integer not null default 99900,
  currency_code        char(3) not null default 'ZAR',
  trial_ends_at        timestamptz,
  current_period_start timestamptz not null default date_trunc('month', now()),
  current_period_end   timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.billing_records (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  description     text not null,
  amount_cents    integer not null,
  currency_code   char(3) not null default 'ZAR',
  status          text not null default 'paid' check (status in ('draft', 'due', 'paid', 'failed', 'refunded')),
  issued_on       date not null default current_date,
  paid_at         timestamptz,
  external_ref    text,
  created_at      timestamptz not null default now()
);

create index billing_records_org_idx on public.billing_records (organisation_id, issued_on desc);

-- ── audit log ─────────────────────────────────────────────────────────────

create table public.audit_logs (
  id              bigint generated always as identity primary key,
  organisation_id uuid references public.organisations (id) on delete cascade,
  actor_id        uuid references auth.users (id) on delete set null,
  action          text not null,
  entity_type     text not null,
  entity_id       text,
  summary         text,
  metadata        jsonb not null default '{}'::jsonb,
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index audit_logs_org_idx on public.audit_logs (organisation_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

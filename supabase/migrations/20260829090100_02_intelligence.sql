-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 02 — Intelligence domain
--   · Data plane        : sources, connections, imports, normalised records
--   · AI DigitalTwin®   : metrics, health scores, events, insights
--   · AI OpportunityRadar® : market signals, competitors, opportunities
--   · Decision layer    : recommendations, goals, risks, alerts, reports
-- ═══════════════════════════════════════════════════════════════════════════

-- ── enums ─────────────────────────────────────────────────────────────────

create type public.data_source_category as enum (
  'accounting', 'crm', 'pos', 'erp', 'spreadsheet', 'database', 'api', 'manual'
);

create type public.connection_status as enum ('pending', 'connected', 'syncing', 'error', 'disabled');

create type public.import_status as enum ('uploaded', 'mapping', 'validating', 'ready', 'importing', 'complete', 'failed');

create type public.metric_kind as enum ('financial', 'sales', 'operational', 'customer', 'employee', 'growth', 'custom');

create type public.health_category as enum ('financial', 'operational', 'sales', 'growth', 'customer', 'strategic');

create type public.event_kind as enum ('anomaly', 'trend', 'threshold', 'milestone', 'ingestion', 'manual');

create type public.opportunity_kind as enum (
  'market_expansion', 'partnership', 'supplier', 'distribution',
  'customer_acquisition', 'product', 'competitive_gap', 'investment'
);

create type public.opportunity_stage as enum (
  'discovered', 'analysing', 'qualified', 'assigned', 'in_progress', 'won', 'lost', 'archived'
);

create type public.signal_kind as enum (
  'market', 'industry', 'competitor', 'company_news', 'demand', 'trend', 'risk'
);

create type public.risk_status as enum ('open', 'mitigating', 'monitoring', 'closed', 'accepted');

create type public.alert_status as enum ('new', 'acknowledged', 'assigned', 'snoozed', 'dismissed', 'resolved');

create type public.goal_status as enum ('draft', 'active', 'at_risk', 'achieved', 'missed', 'cancelled');

create type public.recommendation_status as enum ('new', 'accepted', 'in_progress', 'done', 'dismissed');

-- ═══════════════════════════════════════════════════════════════════════════
-- DATA PLANE
-- ═══════════════════════════════════════════════════════════════════════════

create table public.data_sources (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name            text not null,
  category        public.data_source_category not null,
  provider        text,
  description     text,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (organisation_id, name)
);

create table public.data_connections (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations (id) on delete cascade,
  data_source_id     uuid not null references public.data_sources (id) on delete cascade,
  status             public.connection_status not null default 'pending',
  -- Non-secret connection shape only. Credentials live in the secret manager
  -- and are referenced by handle, never stored in the tenant database.
  config             jsonb not null default '{}'::jsonb,
  credential_ref     text,
  sync_schedule      text not null default 'daily'
                       check (sync_schedule in ('manual', 'hourly', 'daily', 'weekly')),
  field_mapping      jsonb not null default '{}'::jsonb,
  last_synced_at     timestamptz,
  last_error         text,
  consecutive_errors integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index data_connections_org_idx on public.data_connections (organisation_id, status);

create table public.data_imports (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  data_source_id  uuid references public.data_sources (id) on delete set null,
  filename        text,
  status          public.import_status not null default 'uploaded',
  row_count       integer not null default 0,
  rows_imported   integer not null default 0,
  rows_rejected   integer not null default 0,
  column_mapping  jsonb not null default '{}'::jsonb,
  validation      jsonb not null default '{}'::jsonb,
  error_message   text,
  uploaded_by     uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index data_imports_org_idx on public.data_imports (organisation_id, created_at desc);

-- Rolling data-quality assessment per source, shown on the Data Health page.
create table public.data_health_checks (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations (id) on delete cascade,
  data_source_id     uuid not null references public.data_sources (id) on delete cascade,
  completeness_score numeric(5,2) not null check (completeness_score between 0 and 100),
  freshness_hours    numeric(10,2),
  error_count        integer not null default 0,
  missing_fields     text[] not null default '{}',
  checked_at         timestamptz not null default now()
);

create index data_health_checks_lookup_idx
  on public.data_health_checks (organisation_id, data_source_id, checked_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- AI DIGITALTWIN® — normalised business state
-- ═══════════════════════════════════════════════════════════════════════════

-- The metric *definition*: what is measured and how it should be read.
create table public.business_metrics (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisations (id) on delete cascade,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label             text not null,
  kind              public.metric_kind not null,
  unit              text not null default 'currency'
                      check (unit in ('currency', 'percent', 'count', 'days', 'ratio', 'score')),
  -- Which direction is good. Used by trend and anomaly detection to decide
  -- whether a move is an improvement or a deterioration.
  higher_is_better  boolean not null default true,
  target_value      numeric(18,4),
  health_category   public.health_category,
  health_weight     numeric(5,4) not null default 0 check (health_weight between 0 and 1),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organisation_id, key)
);

-- The measurements. One row per metric per period per scope slice.
create table public.metric_values (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  metric_id       uuid not null references public.business_metrics (id) on delete cascade,
  branch_id       uuid references public.branches (id) on delete cascade,
  department_id   uuid references public.departments (id) on delete cascade,
  period_start    date not null,
  period_end      date not null,
  granularity     text not null default 'month'
                    check (granularity in ('day', 'week', 'month', 'quarter', 'year')),
  value           numeric(18,4) not null,
  data_source_id  uuid references public.data_sources (id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint metric_period_ordered check (period_end >= period_start),
  unique (metric_id, branch_id, department_id, period_start, granularity)
);

create index metric_values_series_idx
  on public.metric_values (organisation_id, metric_id, period_start desc);
create index metric_values_branch_idx
  on public.metric_values (organisation_id, branch_id, period_start desc)
  where branch_id is not null;

-- Transactional detail behind the metrics, kept so the assistant can answer
-- "why" rather than only "what".
create table public.financial_records (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  branch_id       uuid references public.branches (id) on delete set null,
  department_id   uuid references public.departments (id) on delete set null,
  occurred_on     date not null,
  category        text not null,
  subcategory     text,
  amount_cents    bigint not null,
  currency_code   char(3) not null default 'ZAR',
  direction       text not null check (direction in ('income', 'expense')),
  reference       text,
  data_source_id  uuid references public.data_sources (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index financial_records_org_idx
  on public.financial_records (organisation_id, occurred_on desc);

create table public.sales_records (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  branch_id       uuid references public.branches (id) on delete set null,
  department_id   uuid references public.departments (id) on delete set null,
  occurred_on     date not null,
  customer_ref    text,
  customer_name   text,
  product_line    text,
  quantity        numeric(14,3) not null default 1,
  amount_cents    bigint not null,
  currency_code   char(3) not null default 'ZAR',
  margin_cents    bigint,
  data_source_id  uuid references public.data_sources (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index sales_records_org_idx on public.sales_records (organisation_id, occurred_on desc);
create index sales_records_customer_idx
  on public.sales_records (organisation_id, customer_ref, occurred_on desc)
  where customer_ref is not null;

create table public.operational_records (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  branch_id       uuid references public.branches (id) on delete set null,
  department_id   uuid references public.departments (id) on delete set null,
  occurred_on     date not null,
  measure         text not null,
  value           numeric(18,4) not null,
  unit            text,
  data_source_id  uuid references public.data_sources (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index operational_records_org_idx
  on public.operational_records (organisation_id, measure, occurred_on desc);

-- Health score history — the Digital Twin's headline reading over time.
create table public.business_health_scores (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisations (id) on delete cascade,
  branch_id         uuid references public.branches (id) on delete cascade,
  score             numeric(5,2) not null check (score between 0 and 100),
  classification    text not null
                      check (classification in ('excellent', 'healthy', 'attention', 'at_risk', 'critical')),
  -- { financial: 78.4, operational: 62.0, ... } plus the weights in force.
  category_scores   jsonb not null default '{}'::jsonb,
  weights           jsonb not null default '{}'::jsonb,
  contributing_metrics jsonb not null default '[]'::jsonb,
  calculated_for    date not null,
  calculated_at     timestamptz not null default now(),
  unique (organisation_id, branch_id, calculated_for)
);

create index business_health_scores_idx
  on public.business_health_scores (organisation_id, calculated_for desc);

-- Configurable weighting per organisation (spec §26).
create table public.health_score_weights (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  category        public.health_category not null,
  weight          numeric(5,4) not null check (weight between 0 and 1),
  updated_at      timestamptz not null default now(),
  primary key (organisation_id, category)
);

-- Things that happened inside the business.
create table public.business_events (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  branch_id       uuid references public.branches (id) on delete cascade,
  department_id   uuid references public.departments (id) on delete cascade,
  metric_id       uuid references public.business_metrics (id) on delete set null,
  kind            public.event_kind not null,
  severity        public.priority_level not null default 'low',
  title           text not null,
  detail          text,
  evidence        jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index business_events_feed_idx
  on public.business_events (organisation_id, occurred_at desc);

-- What the Digital Twin concluded, as opposed to what merely happened.
create table public.business_insights (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  branch_id        uuid references public.branches (id) on delete cascade,
  headline         text not null,
  narrative        text not null,
  category         public.health_category,
  direction        public.trend_direction not null default 'flat',
  impact_cents     bigint,
  confidence       numeric(4,3) not null default 0.5 check (confidence between 0 and 1),
  evidence         jsonb not null default '[]'::jsonb,
  source_event_ids uuid[] not null default '{}',
  generated_by     text not null default 'engine' check (generated_by in ('engine', 'llm', 'human')),
  valid_from       date not null default current_date,
  valid_to         date,
  created_at       timestamptz not null default now()
);

create index business_insights_org_idx
  on public.business_insights (organisation_id, created_at desc);

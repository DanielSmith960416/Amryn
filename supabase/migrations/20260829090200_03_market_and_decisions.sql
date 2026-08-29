-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 03 — AI OpportunityRadar®, decision layer and assistant
--
-- Scanning policy: Amryn is a private-sector intelligence platform. Market
-- sources carry a `sector_policy` and signals a `sector` so that public-sector
-- tenders, programmes and events can be excluded by default (spec §2). The
-- default org setting excludes them; an organisation may opt in explicitly.
-- ═══════════════════════════════════════════════════════════════════════════

create type public.market_sector as enum ('private', 'public', 'mixed', 'unknown');

-- ═══════════════════════════════════════════════════════════════════════════
-- EXTERNAL INTELLIGENCE
-- ═══════════════════════════════════════════════════════════════════════════

create table public.market_sources (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete cascade,
  name            text not null,
  kind            text not null
                    check (kind in ('news', 'industry_report', 'company_filing', 'jobs_board',
                                    'directory', 'social', 'search_trend', 'manual')),
  url             text,
  -- Which sectors this source is allowed to contribute. Defaults to private
  -- only, which is the platform's standing scanning posture.
  sector_policy   public.market_sector[] not null default '{private}',
  is_global       boolean not null default false,
  reliability     numeric(4,3) not null default 0.7 check (reliability between 0 and 1),
  last_scanned_at timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint global_sources_have_no_org check (
    (is_global and organisation_id is null) or (not is_global and organisation_id is not null)
  )
);

create table public.competitors (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name            text not null,
  website         text,
  description     text,
  markets         text[] not null default '{}',
  threat_level    public.priority_level not null default 'medium',
  is_tracked      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, name)
);

create table public.competitor_events (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  competitor_id   uuid not null references public.competitors (id) on delete cascade,
  kind            text not null
                    check (kind in ('launch', 'expansion', 'pricing', 'partnership',
                                    'hiring', 'funding', 'exit', 'other')),
  title           text not null,
  detail          text,
  impact          public.priority_level not null default 'medium',
  source_url      text,
  observed_on     date not null default current_date,
  created_at      timestamptz not null default now()
);

create index competitor_events_org_idx
  on public.competitor_events (organisation_id, observed_on desc);

create table public.market_signals (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  market_source_id uuid references public.market_sources (id) on delete set null,
  kind            public.signal_kind not null,
  sector          public.market_sector not null default 'private',
  title           text not null,
  summary         text not null,
  detail          text,
  entities        text[] not null default '{}',
  keywords        text[] not null default '{}',
  relevance       numeric(4,3) not null default 0.5 check (relevance between 0 and 1),
  confidence      numeric(4,3) not null default 0.5 check (confidence between 0 and 1),
  source_url      text,
  observed_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index market_signals_feed_idx
  on public.market_signals (organisation_id, observed_at desc);
create index market_signals_sector_idx on public.market_signals (organisation_id, sector);

-- ═══════════════════════════════════════════════════════════════════════════
-- OPPORTUNITIES
-- ═══════════════════════════════════════════════════════════════════════════

create table public.opportunities (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations (id) on delete cascade,
  branch_id           uuid references public.branches (id) on delete set null,
  title               text not null,
  kind                public.opportunity_kind not null,
  sector              public.market_sector not null default 'private',
  counterparty        text,
  summary             text not null,
  why_it_matters      text,
  recommended_action  text,
  estimated_value_cents bigint,
  currency_code       char(3) not null default 'ZAR',
  stage               public.opportunity_stage not null default 'discovered',
  score               numeric(5,2) check (score between 0 and 100),
  classification      text check (classification in ('high_priority', 'strong', 'potential', 'monitor')),
  closes_on           date,
  source_signal_ids   uuid[] not null default '{}',
  source_urls         text[] not null default '{}',
  is_saved            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index opportunities_pipeline_idx
  on public.opportunities (organisation_id, stage, score desc nulls last);
create index opportunities_saved_idx
  on public.opportunities (organisation_id) where is_saved;

-- Every scoring run is kept, so a change in ranking is explainable.
create table public.opportunity_scores (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations (id) on delete cascade,
  opportunity_id      uuid not null references public.opportunities (id) on delete cascade,
  relevance           numeric(5,2) not null check (relevance between 0 and 100),
  potential_value     numeric(5,2) not null check (potential_value between 0 and 100),
  strategic_alignment numeric(5,2) not null check (strategic_alignment between 0 and 100),
  urgency             numeric(5,2) not null check (urgency between 0 and 100),
  confidence          numeric(5,2) not null check (confidence between 0 and 100),
  competition         numeric(5,2) not null check (competition between 0 and 100),
  total               numeric(5,2) not null check (total between 0 and 100),
  weights             jsonb not null default '{}'::jsonb,
  rationale           text,
  scored_at           timestamptz not null default now()
);

create index opportunity_scores_idx
  on public.opportunity_scores (opportunity_id, scored_at desc);

-- Configurable scoring weights per organisation (spec §27).
create table public.opportunity_score_weights (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  weights         jsonb not null default
    '{"relevance":0.25,"potential_value":0.20,"strategic_alignment":0.20,"urgency":0.15,"confidence":0.10,"competition":0.10}'::jsonb,
  updated_at      timestamptz not null default now()
);

create table public.opportunity_assignments (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  opportunity_id  uuid not null references public.opportunities (id) on delete cascade,
  assignee_id     uuid not null references auth.users (id) on delete cascade,
  assigned_by     uuid references auth.users (id) on delete set null,
  due_on          date,
  note            text,
  released_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index opportunity_assignments_idx
  on public.opportunity_assignments (organisation_id, assignee_id)
  where released_at is null;

create table public.opportunity_activities (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  opportunity_id  uuid not null references public.opportunities (id) on delete cascade,
  actor_id        uuid references auth.users (id) on delete set null,
  kind            text not null
                    check (kind in ('note', 'stage_change', 'assignment', 'score_change',
                                    'ai_analysis', 'attachment')),
  body            text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index opportunity_activities_idx
  on public.opportunity_activities (opportunity_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- STRATEGY
-- ═══════════════════════════════════════════════════════════════════════════

create table public.goals (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  branch_id       uuid references public.branches (id) on delete set null,
  department_id   uuid references public.departments (id) on delete set null,
  metric_id       uuid references public.business_metrics (id) on delete set null,
  title           text not null,
  description     text,
  owner_id        uuid references auth.users (id) on delete set null,
  baseline_value  numeric(18,4),
  target_value    numeric(18,4) not null,
  current_value   numeric(18,4),
  unit            text not null default 'currency',
  status          public.goal_status not null default 'active',
  starts_on       date not null default current_date,
  due_on          date not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index goals_org_idx on public.goals (organisation_id, status, due_on);

create table public.goal_progress (
  id            uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  goal_id       uuid not null references public.goals (id) on delete cascade,
  value         numeric(18,4) not null,
  note          text,
  recorded_on   date not null default current_date,
  recorded_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (goal_id, recorded_on)
);

create table public.strategic_initiatives (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  title           text not null,
  thesis          text,
  owner_id        uuid references auth.users (id) on delete set null,
  status          text not null default 'proposed'
                    check (status in ('proposed', 'approved', 'active', 'paused', 'complete', 'cancelled')),
  goal_ids        uuid[] not null default '{}',
  opportunity_ids uuid[] not null default '{}',
  starts_on       date,
  ends_on         date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- RECOMMENDATIONS — where inside meets outside
-- ═══════════════════════════════════════════════════════════════════════════

create table public.ai_recommendations (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisations (id) on delete cascade,
  branch_id         uuid references public.branches (id) on delete set null,
  title             text not null,
  summary           text not null,
  why_it_matters    text not null,
  recommended_action text not null,
  evidence          jsonb not null default '[]'::jsonb,
  impact_cents      bigint,
  impact_note       text,
  confidence        numeric(4,3) not null default 0.5 check (confidence between 0 and 1),
  priority          public.priority_level not null default 'medium',
  status            public.recommendation_status not null default 'new',
  -- Provenance: which internal insight and which external signal produced this.
  insight_ids       uuid[] not null default '{}',
  signal_ids        uuid[] not null default '{}',
  opportunity_id    uuid references public.opportunities (id) on delete set null,
  generated_by      text not null default 'engine' check (generated_by in ('engine', 'llm', 'human')),
  owner_id          uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  expires_on        date
);

create index ai_recommendations_board_idx
  on public.ai_recommendations (organisation_id, status, priority, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- RISK AND ALERTS
-- ═══════════════════════════════════════════════════════════════════════════

create table public.risks (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  branch_id       uuid references public.branches (id) on delete set null,
  title           text not null,
  description     text,
  category        text not null default 'operational'
                    check (category in ('financial', 'operational', 'market', 'customer',
                                        'compliance', 'people', 'technology', 'supply')),
  likelihood      smallint not null default 3 check (likelihood between 1 and 5),
  impact          smallint not null default 3 check (impact between 1 and 5),
  -- Stored, not generated, so historical scores survive a scale change.
  severity        public.priority_level not null default 'medium',
  status          public.risk_status not null default 'open',
  owner_id        uuid references auth.users (id) on delete set null,
  mitigation      text,
  review_on       date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index risks_register_idx on public.risks (organisation_id, status, severity);

create table public.risk_events (
  id           uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  risk_id      uuid not null references public.risks (id) on delete cascade,
  actor_id     uuid references auth.users (id) on delete set null,
  kind         text not null
                 check (kind in ('raised', 'reassessed', 'mitigation', 'status_change', 'note', 'closed')),
  body         text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  branch_id       uuid references public.branches (id) on delete set null,
  department_id   uuid references public.departments (id) on delete set null,
  severity        public.priority_level not null default 'medium',
  status          public.alert_status not null default 'new',
  title           text not null,
  detail          text,
  -- What raised it, so the alert can be traced back to its evidence.
  source_kind     text not null default 'engine'
                    check (source_kind in ('engine', 'threshold', 'sync', 'radar', 'manual')),
  business_event_id uuid references public.business_events (id) on delete set null,
  risk_id         uuid references public.risks (id) on delete set null,
  opportunity_id  uuid references public.opportunities (id) on delete set null,
  assignee_id     uuid references auth.users (id) on delete set null,
  snoozed_until   timestamptz,
  acknowledged_at timestamptz,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index alerts_inbox_idx
  on public.alerts (organisation_id, status, severity, created_at desc);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null,
  body         text,
  href         text,
  kind         text not null default 'info'
                 check (kind in ('info', 'alert', 'opportunity', 'recommendation', 'system')),
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_user_idx
  on public.notifications (user_id, created_at desc) where read_at is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- REPORTS AND ASSISTANT
-- ═══════════════════════════════════════════════════════════════════════════

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  kind            text not null
                    check (kind in ('executive_summary', 'business_performance', 'financial',
                                    'opportunity', 'market_intelligence', 'risk', 'ai_briefing')),
  title           text not null,
  parameters      jsonb not null default '{}'::jsonb,
  content         jsonb not null default '{}'::jsonb,
  period_start    date,
  period_end      date,
  generated_by    uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index reports_org_idx on public.reports (organisation_id, created_at desc);

create table public.ai_conversations (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  title           text not null default 'New conversation',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index ai_conversations_user_idx
  on public.ai_conversations (user_id, updated_at desc);

create table public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content         text not null,
  -- Data the answer was drawn from, so every claim is traceable.
  citations       jsonb not null default '[]'::jsonb,
  visualisations  jsonb not null default '[]'::jsonb,
  suggested_actions jsonb not null default '[]'::jsonb,
  tokens_used     integer,
  model           text,
  created_at      timestamptz not null default now()
);

create index ai_messages_thread_idx
  on public.ai_messages (conversation_id, created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 06 — Permission catalogue, role matrix, triggers
-- ═══════════════════════════════════════════════════════════════════════════

-- Migration 04 applies `force row level security` to all 45 tables, and these
-- two carry a select policy and nothing else. FORCE is the part that matters:
-- ordinary RLS exempts a table's owner, FORCE does not, so these seed inserts
-- are refused for anyone lacking BYPASSRLS — including whoever is applying the
-- migration.
--
--   ERROR: new row violates row-level security policy for table "permissions"
--
-- Superusers bypass RLS unconditionally, so a local PostgreSQL never showed
-- it. Whether a hosted project does depends on whether its role happens to
-- carry BYPASSRLS, which is not a thing to build a schema on.
--
-- FORCE is lifted for the length of the seed and restored immediately. Both
-- statements are inside the migration's transaction, so there is no window in
-- which the tables are deployed unprotected.
--
-- These two are a fixed catalogue, not tenant data: every organisation reads
-- the same rows, which is why a select policy is all they ever needed.
alter table public.permissions      no force row level security;
alter table public.role_permissions no force row level security;

insert into public.permissions (key, category, description) values
  ('view_performance',        'Performance',    'View business performance dashboards and metrics'),
  ('view_financial_data',     'Performance',    'View revenue, cost, margin and cash figures'),
  ('view_sales_data',         'Performance',    'View sales records, customers and pipeline value'),
  ('view_operations_data',    'Performance',    'View operational measures such as delivery and utilisation'),
  ('view_intelligence',       'Intelligence',   'View AI DigitalTwin® findings, events and insights'),
  ('view_market_intelligence','Intelligence',   'View external market signals'),
  ('view_competitors',        'Intelligence',   'View tracked competitors and their activity'),
  ('view_opportunities',      'Opportunities',  'View the opportunity pipeline and radar'),
  ('assign_opportunities',    'Opportunities',  'Assign opportunities to colleagues'),
  ('manage_opportunities',    'Opportunities',  'Create, edit and progress opportunities'),
  ('view_recommendations',    'Strategy',       'View AI recommendations'),
  ('manage_recommendations',  'Strategy',       'Accept, dismiss and progress recommendations'),
  ('view_goals',              'Strategy',       'View goals and strategic initiatives'),
  ('manage_goals',            'Strategy',       'Create and edit goals and initiatives'),
  ('view_risks',              'Risk',           'View the risk register and risk dashboard'),
  ('manage_risks',            'Risk',           'Raise, reassess and close risks'),
  ('view_alerts',             'Risk',           'View alerts'),
  ('manage_alerts',           'Risk',           'Acknowledge, assign, snooze and dismiss alerts'),
  ('view_data_sources',       'Data',           'View connected sources, imports and data health'),
  ('import_data',             'Data',           'Upload and import business data'),
  ('manage_integrations',     'Data',           'Create and configure data connections'),
  ('manage_metrics',          'Data',           'Define metrics and health-score weighting'),
  ('manage_competitors',      'Intelligence',   'Add and edit tracked competitors'),
  ('manage_radar',            'Intelligence',   'Configure market sources and radar scoring'),
  ('generate_reports',        'Reporting',      'Generate and export reports'),
  ('use_ai_assistant',        'Intelligence',   'Ask the Amryn AI Assistant questions'),
  ('view_audit_log',          'Administration', 'Read the organisation audit trail'),
  ('manage_users',            'Administration', 'Invite, edit and remove members and permissions'),
  ('manage_organisation',     'Administration', 'Edit the organisation, regions, branches and departments'),
  ('manage_billing',          'Administration', 'View and change the subscription and billing details');

-- ── role matrix ───────────────────────────────────────────────────────────
-- Reach widens down the list; scope (which branches a member sees) is a
-- separate axis, applied by RLS on top of these grants.

do $$
declare
  everything text[] := array(select key from public.permissions order by key);

  viewer text[] := array[
    'view_performance','view_intelligence','view_market_intelligence','view_competitors',
    'view_opportunities','view_recommendations','view_goals','view_alerts','use_ai_assistant'
  ];

  department_manager text[] := viewer || array[
    'view_sales_data','view_operations_data','view_risks','view_data_sources',
    'manage_goals','manage_alerts','generate_reports'
  ];

  branch_manager text[] := department_manager || array[
    'view_financial_data','manage_opportunities','manage_recommendations','manage_risks','import_data'
  ];

  regional_manager text[] := branch_manager || array[
    'assign_opportunities','view_audit_log'
  ];

  analyst text[] := array[
    'view_performance','view_financial_data','view_sales_data','view_operations_data',
    'view_intelligence','view_market_intelligence','view_competitors','view_opportunities',
    'view_recommendations','view_goals','view_risks','view_alerts','view_data_sources',
    'import_data','manage_metrics','generate_reports','use_ai_assistant'
  ];

  -- The executive view is the whole business, minus the plumbing that
  -- administrators and analysts own.
  executive text[] := regional_manager || array[
    'manage_competitors','manage_radar','manage_users'
  ];
begin
  insert into public.role_permissions (role, permission_key)
  select 'super_admin'::public.org_role, unnest(everything)
  union all select 'org_admin', unnest(everything)
  union all select 'executive', unnest(executive)
  union all select 'regional_manager', unnest(regional_manager)
  union all select 'branch_manager', unnest(branch_manager)
  union all select 'department_manager', unnest(department_manager)
  union all select 'analyst', unnest(analyst)
  union all select 'viewer', unnest(viewer)
  on conflict do nothing;
end;
$$;

-- Protection restored before anything else runs.
alter table public.permissions      force row level security;
alter table public.role_permissions force row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- Triggers
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function amryn.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organisations','user_profiles','regions','branches','departments',
    'organisation_members','subscriptions','data_sources','data_connections',
    'business_metrics','competitors','opportunities','goals',
    'strategic_initiatives','ai_recommendations','risks','ai_conversations'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function amryn.touch_updated_at()',
      t || '_touch', t
    );
  end loop;
end;
$$;

-- Mirror new auth users into user_profiles so the app always has a profile to
-- render, without a first-login write path that could fail.
create or replace function amryn.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.user_profiles.full_name, excluded.full_name);
  return new;
end;
$$;

-- Guarded, because creating a trigger requires owning the table and on a
-- hosted Supabase project auth.users belongs to supabase_auth_admin rather
-- than the role applying this file. Unguarded, this one statement failed the
-- entire migration — taking the permission catalogue, the role matrix and
-- create_organisation down with it, and leaving a database that looked like
-- the migrations had never run.
--
-- Where the trigger cannot be installed, public.ensure_user_profile() in
-- migration 10 does the same work on first sign-in instead.
do $$
begin
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function amryn.handle_new_user();
exception
  when insufficient_privilege then
    raise notice 'not permitted to add a trigger to auth.users; profiles are created on first sign-in instead';
  when duplicate_object then
    raise notice 'profile trigger already present';
end;
$$;

-- Risk severity is derived from likelihood × impact, but stored, so that a
-- later change to the scale does not silently rewrite history.
create or replace function amryn.derive_risk_severity()
returns trigger
language plpgsql
as $$
declare
  product integer := new.likelihood * new.impact;
begin
  new.severity := case
    when product >= 20 then 'critical'::public.priority_level
    when product >= 12 then 'high'::public.priority_level
    when product >= 6  then 'medium'::public.priority_level
    else 'low'::public.priority_level
  end;
  return new;
end;
$$;

create trigger risks_derive_severity
  before insert or update of likelihood, impact on public.risks
  for each row execute function amryn.derive_risk_severity();

-- ── organisation bootstrap ────────────────────────────────────────────────
-- Creating an organisation from the app is a single call: it must also create
-- the caller's membership, the subscription and the default weighting, or none
-- of it. SECURITY DEFINER because the caller is not yet a member of the
-- organisation whose rows are being written.

create or replace function public.create_organisation(
  p_name text,
  p_slug text,
  p_industry text default null,
  p_country_code char(2) default 'ZA',
  p_currency_code char(3) default 'ZAR'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_org uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.organisations (name, slug, industry, country_code, currency_code)
  values (p_name, lower(p_slug), p_industry, upper(p_country_code), upper(p_currency_code))
  returning id into new_org;

  insert into public.organisation_members (organisation_id, user_id, role, status, scope_kind)
  values (new_org, uid, 'org_admin', 'active', 'organisation');

  insert into public.subscriptions (organisation_id, plan, status, trial_ends_at)
  values (new_org, 'starter', 'trialing', now() + interval '30 days');

  insert into public.health_score_weights (organisation_id, category, weight) values
    (new_org, 'financial',   0.25),
    (new_org, 'operational', 0.20),
    (new_org, 'sales',       0.20),
    (new_org, 'growth',      0.15),
    (new_org, 'customer',    0.10),
    (new_org, 'strategic',   0.10);

  insert into public.opportunity_score_weights (organisation_id) values (new_org);

  insert into public.audit_logs (organisation_id, actor_id, action, entity_type, entity_id, summary)
  values (new_org, uid, 'organisation.created', 'organisation', new_org::text, p_name);

  return new_org;
end;
$$;

revoke all on function public.create_organisation(text, text, text, char, char) from public, anon;
grant execute on function public.create_organisation(text, text, text, char, char) to authenticated;

-- Health-score weights must sum to 1 for the score to be a true weighted mean.
create or replace function amryn.assert_health_weights_sum()
returns trigger
language plpgsql
as $$
declare
  total numeric;
  org uuid := coalesce(new.organisation_id, old.organisation_id);
begin
  select sum(weight) into total
    from public.health_score_weights
   where organisation_id = org;

  if total is not null and abs(total - 1) > 0.001 then
    raise exception 'health score weights for organisation % sum to %, expected 1', org, total;
  end if;
  return null;
end;
$$;

create constraint trigger health_weights_sum_to_one
  after insert or update or delete on public.health_score_weights
  deferrable initially deferred
  for each row execute function amryn.assert_health_weights_sum();

-- PostgREST answers from a cached copy of the schema and is not told by
-- applying SQL. Without this, everything above exists and stays invisible to
-- the application — which reads exactly like a migration that never ran.
notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 22 — an index on every foreign key
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Seventy-four foreign keys had no index. PostgreSQL does not create one: a
-- foreign key constrains the child, and indexing it is left to whoever knows
-- how the data will be read.
--
-- Two things go wrong without them, and only one is about queries.
--
-- ── the one everybody thinks of ───────────────────────────────────────────
-- Every row-level security policy in this schema filters on organisation_id.
-- Ten tables carried that column as an unindexed foreign key, so every read
-- against them was a sequential scan filtered afterwards. That is invisible at
-- a few hundred rows and is exactly the shape of thing that becomes a support
-- ticket at a few hundred thousand.
--
-- ── the one that bites first ──────────────────────────────────────────────
-- Deleting a parent row makes PostgreSQL check every child table that
-- references it — to cascade, to null, or to refuse. Without an index that
-- check is a sequential scan of the child, per parent row deleted, whether or
-- not anybody ever queries by that column.
--
-- Most of these cascade from organisations. Deleting one customer's
-- organisation would have scanned every table in the schema, holding locks
-- throughout. The POPIA erasure path does exactly that, and it is the one
-- operation that must not time out halfway.
--
-- ── why all of them, rather than a chosen few ─────────────────────────────
-- Because the second reason applies to every foreign key regardless of query
-- patterns, and because choosing a subset means predicting which columns will
-- be filtered on later — a guess that reads as engineering judgement and is
-- not. The write cost is a few bytes per row per index on tables that are
-- currently small; the alternative is finding out which ones mattered from a
-- customer.
--
-- Single-column, and deliberately not composite. An index only serves a
-- foreign key's integrity check when the key's columns are a *prefix* of it,
-- so (organisation_id, branch_id) would serve the organisation_id key and do
-- nothing at all for the branch_id one.
--
-- `if not exists` throughout, so this is safe to re-run and safe on a database
-- where somebody has already added one by hand.

-- ── organisation_id: the column every RLS policy filters on ───────────────
--
-- These ten are the highest value in the file on both counts — the filter path
-- for every read, and the cascade path when an organisation is deleted.

create index if not exists ai_conversations_org_idx
  on public.ai_conversations (organisation_id);
create index if not exists ai_messages_org_idx
  on public.ai_messages (organisation_id);
create index if not exists goal_progress_org_idx
  on public.goal_progress (organisation_id);
create index if not exists market_sources_org_idx
  on public.market_sources (organisation_id);
create index if not exists member_permission_overrides_org_idx
  on public.member_permission_overrides (organisation_id);
create index if not exists notifications_org_idx
  on public.notifications (organisation_id);
create index if not exists opportunity_activities_org_idx
  on public.opportunity_activities (organisation_id);
create index if not exists opportunity_scores_org_idx
  on public.opportunity_scores (organisation_id);
create index if not exists risk_events_org_idx
  on public.risk_events (organisation_id);
create index if not exists strategic_initiatives_org_idx
  on public.strategic_initiatives (organisation_id);

-- ── where a record sits: region, branch, department ───────────────────────
--
-- The scoping columns. A regional manager's every query narrows by branch, and
-- closing a branch cascades through all of these.

create index if not exists ai_recommendations_branch_idx
  on public.ai_recommendations (branch_id);
create index if not exists alerts_branch_idx
  on public.alerts (branch_id);
create index if not exists alerts_department_idx
  on public.alerts (department_id);
create index if not exists branches_region_idx
  on public.branches (region_id);
create index if not exists business_events_branch_idx
  on public.business_events (branch_id);
create index if not exists business_events_department_idx
  on public.business_events (department_id);
create index if not exists business_health_scores_branch_idx
  on public.business_health_scores (branch_id);
create index if not exists business_insights_branch_idx
  on public.business_insights (branch_id);
create index if not exists departments_branch_idx
  on public.departments (branch_id);
create index if not exists financial_records_branch_idx
  on public.financial_records (branch_id);
create index if not exists financial_records_department_idx
  on public.financial_records (department_id);
create index if not exists goals_branch_idx
  on public.goals (branch_id);
create index if not exists goals_department_idx
  on public.goals (department_id);
-- Not metric_values_branch_idx: that name is taken by a partial composite,
-- (organisation_id, branch_id, period_start DESC) WHERE branch_id IS NOT NULL,
-- which serves the organisation_id key and does nothing for this one — wrong
-- leading column, and partial besides. `if not exists` matched the name and
-- skipped the index silently; test 23 is what noticed.
create index if not exists metric_values_branch_fk_idx
  on public.metric_values (branch_id);
create index if not exists metric_values_department_idx
  on public.metric_values (department_id);
create index if not exists operational_records_branch_idx
  on public.operational_records (branch_id);
create index if not exists operational_records_department_idx
  on public.operational_records (department_id);
create index if not exists opportunities_branch_idx
  on public.opportunities (branch_id);
create index if not exists risks_branch_idx
  on public.risks (branch_id);
create index if not exists sales_records_branch_idx
  on public.sales_records (branch_id);
create index if not exists sales_records_department_idx
  on public.sales_records (department_id);
create index if not exists stock_audits_branch_idx
  on public.stock_audits (branch_id);

-- ── where a number came from: data source, metric ─────────────────────────
--
-- Disconnecting a data source or retiring a metric touches every fact table
-- that referenced it.

create index if not exists business_events_metric_idx
  on public.business_events (metric_id);
create index if not exists data_connections_source_idx
  on public.data_connections (data_source_id);
create index if not exists data_health_checks_source_idx
  on public.data_health_checks (data_source_id);
create index if not exists data_imports_source_idx
  on public.data_imports (data_source_id);
create index if not exists financial_records_source_idx
  on public.financial_records (data_source_id);
create index if not exists goals_metric_idx
  on public.goals (metric_id);
create index if not exists market_signals_market_source_idx
  on public.market_signals (market_source_id);
create index if not exists metric_values_source_idx
  on public.metric_values (data_source_id);
create index if not exists operational_records_source_idx
  on public.operational_records (data_source_id);
create index if not exists sales_records_source_idx
  on public.sales_records (data_source_id);

-- ── who did it: owners, assignees, actors, and the audit trail ────────────
--
-- These reference auth.users. Deleting a user — which POPIA erasure requires —
-- checks every one of them.

create index if not exists ai_recommendations_owner_idx
  on public.ai_recommendations (owner_id);
create index if not exists alerts_assignee_idx
  on public.alerts (assignee_id);
create index if not exists data_imports_uploaded_by_idx
  on public.data_imports (uploaded_by);
create index if not exists data_sources_created_by_idx
  on public.data_sources (created_by);
create index if not exists goal_progress_recorded_by_idx
  on public.goal_progress (recorded_by);
create index if not exists goals_owner_idx
  on public.goals (owner_id);
create index if not exists opportunity_activities_actor_idx
  on public.opportunity_activities (actor_id);
create index if not exists opportunity_assignments_assigned_by_idx
  on public.opportunity_assignments (assigned_by);
create index if not exists opportunity_assignments_assignee_idx
  on public.opportunity_assignments (assignee_id);
create index if not exists organisation_invitations_accepted_by_idx
  on public.organisation_invitations (accepted_by);
create index if not exists organisation_invitations_invited_by_idx
  on public.organisation_invitations (invited_by);
create index if not exists organisation_members_invited_by_idx
  on public.organisation_members (invited_by);
create index if not exists organisations_dpa_accepted_by_idx
  on public.organisations (dpa_accepted_by);
create index if not exists reports_generated_by_idx
  on public.reports (generated_by);
create index if not exists risk_events_actor_idx
  on public.risk_events (actor_id);
create index if not exists risks_owner_idx
  on public.risks (owner_id);
create index if not exists stock_audits_created_by_idx
  on public.stock_audits (created_by);
create index if not exists strategic_initiatives_owner_idx
  on public.strategic_initiatives (owner_id);
create index if not exists subscription_activations_activated_by_idx
  on public.subscription_activations (activated_by);
create index if not exists subscription_activations_confirmed_by_idx
  on public.subscription_activations (confirmed_by);
create index if not exists subscription_activations_requested_by_idx
  on public.subscription_activations (requested_by);
create index if not exists subscriptions_activated_by_idx
  on public.subscriptions (activated_by);

-- ── record to record: alerts, activities, events ──────────────────────────

create index if not exists alerts_event_idx
  on public.alerts (business_event_id);
create index if not exists alerts_opportunity_idx
  on public.alerts (opportunity_id);
create index if not exists alerts_risk_idx
  on public.alerts (risk_id);
create index if not exists ai_recommendations_opportunity_idx
  on public.ai_recommendations (opportunity_id);
create index if not exists competitor_events_competitor_idx
  on public.competitor_events (competitor_id);
create index if not exists opportunity_assignments_opportunity_idx
  on public.opportunity_assignments (opportunity_id);
create index if not exists risk_events_risk_idx
  on public.risk_events (risk_id);

-- ── the permission and entitlement catalogues ─────────────────────────────
--
-- Small and rarely changed, so these earn their place on the cascade argument
-- rather than the query one. Included for the same reason as the rest: a
-- foreign key with no index is a sequential scan waiting for the day somebody
-- edits the catalogue.

create index if not exists member_permission_overrides_permission_idx
  on public.member_permission_overrides (permission_key);
create index if not exists plan_entitlements_entitlement_idx
  on public.plan_entitlements (entitlement_key);
create index if not exists role_permissions_permission_idx
  on public.role_permissions (permission_key);

notify pgrst, 'reload schema';

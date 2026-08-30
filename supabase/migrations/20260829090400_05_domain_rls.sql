-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 05 — Row Level Security for the intelligence domain
--
-- Most domain tables follow one of two shapes, so they are generated from a
-- single declaration list. The list is the thing to review: it states, per
-- table, which permission gates reading and writing and whether rows are
-- narrowed by branch scope.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  spec record;
  branch_clause text;
begin
  for spec in
    select *
    from (values
      -- table,                        read permission,          write permission,        branch-scoped
      ('data_sources',                 'view_data_sources',      'manage_integrations',   false),
      ('data_connections',             'view_data_sources',      'manage_integrations',   false),
      ('data_imports',                 'view_data_sources',      'import_data',           false),
      ('data_health_checks',           'view_data_sources',      'manage_integrations',   false),

      ('business_metrics',             'view_performance',       'manage_metrics',        false),
      ('metric_values',                'view_performance',       'import_data',           true),
      ('financial_records',            'view_financial_data',    'import_data',           true),
      ('sales_records',                'view_sales_data',        'import_data',           true),
      ('operational_records',          'view_operations_data',   'import_data',           true),

      ('business_health_scores',       'view_performance',       'manage_metrics',        true),
      ('health_score_weights',         'view_performance',       'manage_metrics',        false),
      ('business_events',              'view_intelligence',      'manage_metrics',        true),
      ('business_insights',            'view_intelligence',      'manage_metrics',        true),

      ('competitors',                  'view_competitors',       'manage_competitors',    false),
      ('competitor_events',            'view_competitors',       'manage_competitors',    false),
      ('market_signals',               'view_market_intelligence','manage_radar',         false),

      ('opportunities',                'view_opportunities',     'manage_opportunities',  true),
      ('opportunity_scores',           'view_opportunities',     'manage_opportunities',  false),
      ('opportunity_score_weights',    'view_opportunities',     'manage_radar',          false),
      ('opportunity_activities',       'view_opportunities',     'view_opportunities',    false),

      ('goals',                        'view_goals',             'manage_goals',          true),
      ('goal_progress',                'view_goals',             'manage_goals',          false),
      ('strategic_initiatives',        'view_goals',             'manage_goals',          false),
      ('ai_recommendations',           'view_recommendations',   'manage_recommendations',true),

      ('risks',                        'view_risks',             'manage_risks',          true),
      ('risk_events',                  'view_risks',             'manage_risks',          false),
      ('alerts',                       'view_alerts',            'manage_alerts',         true),
      ('reports',                      'generate_reports',       'generate_reports',      false)
    ) as t(tbl, read_perm, write_perm, branch_scoped)
  loop
    branch_clause := case
      when spec.branch_scoped then ' and amryn.can_see_branch(organisation_id, branch_id)'
      else ''
    end;

    execute format(
      'create policy %I on public.%I for select to authenticated using (amryn.has_permission(organisation_id, %L)%s)',
      spec.tbl || '_read', spec.tbl, spec.read_perm, branch_clause
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (amryn.has_permission(organisation_id, %L)%s)',
      spec.tbl || '_insert', spec.tbl, spec.write_perm, branch_clause
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (amryn.has_permission(organisation_id, %L)%s) with check (amryn.has_permission(organisation_id, %L)%s)',
      spec.tbl || '_update', spec.tbl, spec.write_perm, branch_clause, spec.write_perm, branch_clause
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (amryn.has_permission(organisation_id, %L)%s)',
      spec.tbl || '_delete', spec.tbl, spec.write_perm, branch_clause
    );
  end loop;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Tables that do not fit the pattern
-- ═══════════════════════════════════════════════════════════════════════════

-- Market sources: global catalogue rows are readable by every tenant; an
-- organisation's own sources are private to it.
create policy market_sources_read on public.market_sources
  for select to authenticated
  using (
    is_global
    or (organisation_id is not null and amryn.has_permission(organisation_id, 'view_market_intelligence'))
  );

create policy market_sources_manage on public.market_sources
  for all to authenticated
  using (organisation_id is not null and amryn.has_permission(organisation_id, 'manage_radar'))
  with check (organisation_id is not null and amryn.has_permission(organisation_id, 'manage_radar'));

-- Assignments: assignees always see their own, regardless of the wider
-- opportunity permission, because the work has been given to them.
create policy opportunity_assignments_read on public.opportunity_assignments
  for select to authenticated
  using (
    assignee_id = auth.uid()
    or amryn.has_permission(organisation_id, 'view_opportunities')
  );

create policy opportunity_assignments_manage on public.opportunity_assignments
  for all to authenticated
  using (amryn.has_permission(organisation_id, 'assign_opportunities'))
  with check (amryn.has_permission(organisation_id, 'assign_opportunities'));

-- Notifications are personal.
create policy notifications_read on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (amryn.is_member(organisation_id));

-- Assistant threads are private to the user who held the conversation. An
-- executive cannot read a colleague's questions.
create policy ai_conversations_own on public.ai_conversations
  for all to authenticated
  using (user_id = auth.uid() and amryn.is_member(organisation_id))
  with check (user_id = auth.uid() and amryn.is_member(organisation_id));

create policy ai_messages_own on public.ai_messages
  for all to authenticated
  using (
    amryn.is_member(organisation_id)
    and exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    amryn.is_member(organisation_id)
    and exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- ── grants ────────────────────────────────────────────────────────────────
-- RLS decides which rows; these decide which verbs are possible at all.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Reference tables are never written from a session.
revoke insert, update, delete on public.permissions from authenticated;
revoke insert, update, delete on public.role_permissions from authenticated;
revoke update, delete on public.audit_logs from authenticated;

-- Nothing in this schema is reachable without a session.
revoke all on all tables in schema public from anon;

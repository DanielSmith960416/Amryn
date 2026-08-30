-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 04 — Row Level Security
--
-- The rule this file enforces: a user reads a row only if
--   (a) they are an ACTIVE member of that row's organisation, and
--   (b) the row's branch/department falls inside their scope, and
--   (c) for sensitive tables, they hold the relevant permission.
--
-- All three are decided in SQL. The application layer re-checks permissions to
-- give good error messages, but it is not what keeps tenants apart.
--
-- The helper functions are SECURITY DEFINER on purpose: they read
-- organisation_members, which is itself RLS-protected, and a policy that
-- queried it directly would recurse.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── helpers ───────────────────────────────────────────────────────────────

create or replace function amryn.active_member(p_org uuid)
returns public.organisation_members
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.*
  from public.organisation_members m
  where m.organisation_id = p_org
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;
$$;

create or replace function amryn.is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organisation_members m
    where m.organisation_id = p_org
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function amryn.member_role(p_org uuid)
returns public.org_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.role
  from public.organisation_members m
  where m.organisation_id = p_org
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;
$$;

-- Administrative reach: may manage members, structure and connections.
create or replace function amryn.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(amryn.member_role(p_org) in ('super_admin', 'org_admin'), false);
$$;

-- Effective permission = role default, then any per-member override.
create or replace function amryn.has_permission(p_org uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with member as (
    select m.id, m.role
    from public.organisation_members m
    where m.organisation_id = p_org
      and m.user_id = auth.uid()
      and m.status = 'active'
    limit 1
  ),
  override as (
    select o.granted
    from public.member_permission_overrides o
    join member on member.id = o.member_id
    where o.permission_key = p_permission
    limit 1
  ),
  role_default as (
    select true as granted
    from public.role_permissions rp
    join member on member.role = rp.role
    where rp.permission_key = p_permission
    limit 1
  )
  select coalesce(
    (select granted from override),
    (select granted from role_default),
    false
  );
$$;

-- The branches a member may see. NULL means "the whole organisation".
create or replace function amryn.visible_branch_ids(p_org uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  m public.organisation_members;
  result uuid[];
begin
  select * into m from amryn.active_member(p_org);
  if m.id is null then
    return '{}'::uuid[];
  end if;

  case m.scope_kind
    when 'organisation' then
      return null;                                   -- unrestricted
    when 'region' then
      select coalesce(array_agg(b.id), '{}')
        into result
        from public.branches b
       where b.organisation_id = p_org
         and b.region_id = any (m.scope_ids);
    when 'branch' then
      select coalesce(array_agg(b.id), '{}')
        into result
        from public.branches b
       where b.organisation_id = p_org
         and b.id = any (m.scope_ids);
    when 'department' then
      select coalesce(array_agg(distinct d.branch_id), '{}')
        into result
        from public.departments d
       where d.organisation_id = p_org
         and d.id = any (m.scope_ids)
         and d.branch_id is not null;
  end case;

  return coalesce(result, '{}'::uuid[]);
end;
$$;

-- Can this member see a row carrying p_branch?
--   · a NULL branch is an organisation-level row, reserved for org-wide scope
--   · otherwise the branch must fall inside the member's visible set
create or replace function amryn.can_see_branch(p_org uuid, p_branch uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  visible uuid[];
begin
  if not amryn.is_member(p_org) then
    return false;
  end if;

  visible := amryn.visible_branch_ids(p_org);

  if visible is null then
    return true;                                     -- organisation-wide scope
  end if;

  if p_branch is null then
    return false;                                    -- aggregate row, scoped member
  end if;

  return p_branch = any (visible);
end;
$$;

create or replace function amryn.can_see_department(p_org uuid, p_department uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  m public.organisation_members;
  parent_branch uuid;
begin
  select * into m from amryn.active_member(p_org);
  if m.id is null then
    return false;
  end if;

  if p_department is null then
    return m.scope_kind <> 'department';
  end if;

  if m.scope_kind = 'department' then
    return p_department = any (m.scope_ids);
  end if;

  select branch_id into parent_branch
    from public.departments
   where id = p_department and organisation_id = p_org;

  return amryn.can_see_branch(p_org, parent_branch);
end;
$$;

grant execute on function
  amryn.is_member(uuid),
  amryn.member_role(uuid),
  amryn.is_org_admin(uuid),
  amryn.has_permission(uuid, text),
  amryn.visible_branch_ids(uuid),
  amryn.can_see_branch(uuid, uuid),
  amryn.can_see_department(uuid, uuid)
to authenticated;

-- active_member returns a whole member row; keep it internal.
revoke all on function amryn.active_member(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Enable RLS everywhere, then deny by default.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array[
    'organisations','user_profiles','regions','branches','departments',
    'organisation_members','permissions','role_permissions',
    'member_permission_overrides','subscriptions','billing_records','audit_logs',
    'data_sources','data_connections','data_imports','data_health_checks',
    'business_metrics','metric_values','financial_records','sales_records',
    'operational_records','business_health_scores','health_score_weights',
    'business_events','business_insights',
    'market_sources','competitors','competitor_events','market_signals',
    'opportunities','opportunity_scores','opportunity_score_weights',
    'opportunity_assignments','opportunity_activities',
    'goals','goal_progress','strategic_initiatives','ai_recommendations',
    'risks','risk_events','alerts','notifications','reports',
    'ai_conversations','ai_messages'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end;
$$;

-- ── identity and tenancy ──────────────────────────────────────────────────

create policy organisations_read on public.organisations
  for select to authenticated
  using (amryn.is_member(id) and deleted_at is null);

create policy organisations_update on public.organisations
  for update to authenticated
  using (amryn.is_org_admin(id))
  with check (amryn.is_org_admin(id));

-- A user sees their own profile, plus the profiles of people they share an
-- organisation with — needed to render owners, assignees and activity.
create policy user_profiles_read on public.user_profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.organisation_members me
      join public.organisation_members them
        on them.organisation_id = me.organisation_id
      where me.user_id = auth.uid()
        and me.status = 'active'
        and them.user_id = public.user_profiles.id
    )
  );

create policy user_profiles_write on public.user_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy user_profiles_insert on public.user_profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy members_read on public.organisation_members
  for select to authenticated
  using (user_id = auth.uid() or amryn.is_member(organisation_id));

create policy members_manage on public.organisation_members
  for all to authenticated
  using (amryn.has_permission(organisation_id, 'manage_users'))
  with check (amryn.has_permission(organisation_id, 'manage_users'));

create policy overrides_read on public.member_permission_overrides
  for select to authenticated
  using (amryn.is_member(organisation_id));

create policy overrides_manage on public.member_permission_overrides
  for all to authenticated
  using (amryn.has_permission(organisation_id, 'manage_users'))
  with check (amryn.has_permission(organisation_id, 'manage_users'));

-- The permission catalogue is reference data: readable, never writable.
create policy permissions_read on public.permissions
  for select to authenticated using (true);

create policy role_permissions_read on public.role_permissions
  for select to authenticated using (true);

-- ── organisational structure ──────────────────────────────────────────────

create policy regions_read on public.regions
  for select to authenticated
  using (amryn.is_member(organisation_id) and deleted_at is null);

create policy regions_manage on public.regions
  for all to authenticated
  using (amryn.has_permission(organisation_id, 'manage_organisation'))
  with check (amryn.has_permission(organisation_id, 'manage_organisation'));

create policy branches_read on public.branches
  for select to authenticated
  using (amryn.can_see_branch(organisation_id, id) and deleted_at is null);

create policy branches_manage on public.branches
  for all to authenticated
  using (amryn.has_permission(organisation_id, 'manage_organisation'))
  with check (amryn.has_permission(organisation_id, 'manage_organisation'));

create policy departments_read on public.departments
  for select to authenticated
  using (amryn.can_see_department(organisation_id, id) and deleted_at is null);

create policy departments_manage on public.departments
  for all to authenticated
  using (amryn.has_permission(organisation_id, 'manage_organisation'))
  with check (amryn.has_permission(organisation_id, 'manage_organisation'));

-- ── billing ───────────────────────────────────────────────────────────────

create policy subscriptions_read on public.subscriptions
  for select to authenticated
  using (amryn.is_member(organisation_id));

create policy subscriptions_manage on public.subscriptions
  for all to authenticated
  using (amryn.has_permission(organisation_id, 'manage_billing'))
  with check (amryn.has_permission(organisation_id, 'manage_billing'));

create policy billing_read on public.billing_records
  for select to authenticated
  using (amryn.has_permission(organisation_id, 'manage_billing'));

-- ── audit ─────────────────────────────────────────────────────────────────
-- Readable by administrators; append-only for everyone, and never editable.

create policy audit_read on public.audit_logs
  for select to authenticated
  using (organisation_id is not null and amryn.has_permission(organisation_id, 'view_audit_log'));

create policy audit_append on public.audit_logs
  for insert to authenticated
  with check (organisation_id is null or amryn.is_member(organisation_id));

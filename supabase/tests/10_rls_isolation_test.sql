-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ — Row Level Security proof
--
-- These assertions are the reason to trust the tenancy model. Each one
-- impersonates a real member and checks what that member can actually read.
-- Any regression fails the run rather than quietly widening access.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

-- ── fixtures ──────────────────────────────────────────────────────────────

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ceo@northwind.test'),
  ('22222222-2222-2222-2222-222222222222', 'branch@northwind.test'),
  ('33333333-3333-3333-3333-333333333333', 'viewer@northwind.test'),
  ('44444444-4444-4444-4444-444444444444', 'ceo@rival.test');

-- Two unrelated organisations.
insert into public.organisations (id, name, slug) values
  ('a0000000-0000-0000-0000-000000000001', 'Northwind Supply', 'northwind'),
  ('b0000000-0000-0000-0000-000000000002', 'Rival Holdings', 'rival');

-- Every organisation created by the platform is opened with a subscription;
-- these fixtures build organisations by hand, so they have to supply one. It
-- is not decoration: migration 16 refuses writes to an organisation whose
-- subscription is lapsed, and an organisation with no subscription row at all
-- reads as unpaid — which is the safe direction, and the reason this insert
-- is here rather than the rule being softened to let a missing row through.
insert into public.subscriptions (organisation_id, plan, status) values
  ('a0000000-0000-0000-0000-000000000001', 'professional', 'active'),
  ('b0000000-0000-0000-0000-000000000002', 'professional', 'active');

insert into public.branches (id, organisation_id, name) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'Johannesburg'),
  ('c0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001', 'Cape Town'),
  ('c0000000-0000-0000-0000-00000000000c', 'b0000000-0000-0000-0000-000000000002', 'Durban');

insert into public.organisation_members (organisation_id, user_id, role, scope_kind, scope_ids) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'executive', 'organisation', '{}'),
  ('a0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'branch_manager', 'branch', '{c0000000-0000-0000-0000-00000000000a}'),
  ('a0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer', 'organisation', '{}'),
  ('b0000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'executive', 'organisation', '{}');

insert into public.health_score_weights (organisation_id, category, weight)
select o.id, c.category, c.weight
from public.organisations o
cross join (values
  ('financial'::public.health_category, 0.25),
  ('operational', 0.20), ('sales', 0.20),
  ('growth', 0.15), ('customer', 0.10), ('strategic', 0.10)
) as c(category, weight);

-- Financial rows: one per branch of Northwind, one for Rival, one org-level.
insert into public.financial_records
  (organisation_id, branch_id, occurred_on, category, amount_cents, direction)
values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', current_date, 'Sales', 500000, 'income'),
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b', current_date, 'Sales', 700000, 'income'),
  ('a0000000-0000-0000-0000-000000000001', null, current_date, 'Group overhead', 300000, 'expense'),
  ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000c', current_date, 'Sales', 900000, 'income');

insert into public.ai_conversations (id, organisation_id, user_id, title) values
  ('d0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'Why did margin move?');

-- ── assertion helper ──────────────────────────────────────────────────────

create or replace function pg_temp.expect(label text, got bigint, want bigint)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL  %  — expected %, got %', label, want, got;
  end if;
  raise notice 'pass  %', label;
end;
$$;

create or replace function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
end;
$$;

set local role authenticated;

-- ── 1. tenant isolation ───────────────────────────────────────────────────

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.expect(
  'executive sees only their own organisation',
  (select count(*) from public.organisations), 1);
select pg_temp.expect(
  'executive cannot see the rival organisation',
  (select count(*) from public.organisations where slug = 'rival'), 0);
select pg_temp.expect(
  'executive sees all three Northwind financial rows',
  (select count(*) from public.financial_records), 3);

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select pg_temp.expect(
  'rival executive sees only rival financial rows',
  (select count(*) from public.financial_records), 1);
select pg_temp.expect(
  'rival executive cannot see Northwind branches',
  (select count(*) from public.branches where organisation_id = 'a0000000-0000-0000-0000-000000000001'), 0);

-- ── 2. branch scope narrows within an organisation ────────────────────────

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.expect(
  'branch manager sees only their own branch',
  (select count(*) from public.branches), 1);
select pg_temp.expect(
  'branch manager sees only their branch financial rows',
  (select count(*) from public.financial_records), 1);
select pg_temp.expect(
  'branch manager cannot see the group-level row',
  (select count(*) from public.financial_records where branch_id is null), 0);
select pg_temp.expect(
  'branch manager cannot see the sibling branch row',
  (select count(*) from public.financial_records
    where branch_id = 'c0000000-0000-0000-0000-00000000000b'), 0);

-- ── 3. permissions gate sensitive tables ──────────────────────────────────

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.expect(
  'viewer holds no view_financial_data permission',
  (select count(*) from public.financial_records), 0);
select pg_temp.expect(
  'viewer can still read the organisation',
  (select count(*) from public.organisations), 1);

-- A grant override lifts the viewer without changing their role.
reset role;
insert into public.member_permission_overrides (organisation_id, member_id, permission_key, granted)
select 'a0000000-0000-0000-0000-000000000001', m.id, 'view_financial_data', true
from public.organisation_members m
where m.user_id = '33333333-3333-3333-3333-333333333333';
set local role authenticated;

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.expect(
  'permission override grants the viewer financial access',
  (select count(*) from public.financial_records), 3);

-- ── 4. writes are blocked, not just reads ─────────────────────────────────

do $$
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  begin
    insert into public.financial_records
      (organisation_id, branch_id, occurred_on, category, amount_cents, direction)
    values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b',
            current_date, 'Injected', 1, 'income');
    raise exception 'FAIL  branch manager was able to write outside their scope';
  exception
    when insufficient_privilege then
      raise notice 'pass  branch manager cannot write outside their branch';
  end;
end;
$$;

do $$
begin
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  begin
    insert into public.financial_records
      (organisation_id, occurred_on, category, amount_cents, direction)
    values ('a0000000-0000-0000-0000-000000000001', current_date, 'Cross-tenant', 1, 'income');
    raise exception 'FAIL  a member of one organisation wrote into another';
  exception
    when insufficient_privilege then
      raise notice 'pass  cross-tenant write is rejected';
  end;
end;
$$;

-- ── 5. assistant threads stay private between colleagues ──────────────────

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.expect(
  'author sees their own conversation',
  (select count(*) from public.ai_conversations), 1);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.expect(
  'a colleague cannot read the executive''s conversation',
  (select count(*) from public.ai_conversations), 0);

-- ── 6. anonymous access reaches nothing ───────────────────────────────────

reset role;
set local role anon;
do $$
declare n bigint;
begin
  begin
    select count(*) into n from public.organisations;
    raise exception 'FAIL  anonymous role could query organisations (% rows)', n;
  exception
    when insufficient_privilege then
      raise notice 'pass  anonymous role has no table access';
  end;
end;
$$;

reset role;

-- ── 7. the bootstrap function is atomic and self-scoping ──────────────────

set local role authenticated;
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select public.create_organisation('Fresh Start', 'fresh-start', 'Logistics') as new_org \gset

select pg_temp.expect(
  'creator becomes an admin member of the new organisation',
  (select count(*) from public.organisation_members
    where organisation_id = :'new_org' and role = 'org_admin'), 1);
select pg_temp.expect(
  'the new organisation is on a trialing starter subscription',
  (select count(*) from public.subscriptions
    where organisation_id = :'new_org' and plan = 'starter' and status = 'trialing'), 1);
select pg_temp.expect(
  'default health weights are installed',
  (select count(*) from public.health_score_weights where organisation_id = :'new_org'), 6);
select pg_temp.expect(
  'the creator now sees two organisations',
  (select count(*) from public.organisations), 2);

reset role;
rollback;

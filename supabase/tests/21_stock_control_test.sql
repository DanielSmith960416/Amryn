-- Advanced Inventory Control: whose stock it is, and who may action it.
--
-- The assertions worth having here are the ones about the boundary rather than
-- the arithmetic — expiry status and dormancy are pure functions with their own
-- unit tests, and re-testing them in SQL would only prove the numbers were
-- typed twice. What SQL has to answer is: can another organisation see this
-- stocktake, can a viewer mark a batch destroyed, and does an audit that
-- claims to be finished carry a time.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.check(ok boolean, what text) returns void
language plpgsql as $$
begin
  if ok then raise notice 'pass  %', what;
  else raise exception 'FAIL  %', what; end if;
end $$;

create or replace function pg_temp.act_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'aal', 'aal2')::text, true);
end $$;

create or replace function pg_temp.act_as_operator() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function pg_temp.refused(stmt text, needle text) returns boolean
language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  if position(lower(needle) in lower(sqlerrm)) > 0 then return true; end if;
  raise exception 'statement failed for an unrelated reason: %', sqlerrm;
end $$;

create or replace function pg_temp.succeeds(stmt text) returns boolean
language plpgsql as $$
begin
  execute stmt;
  return true;
exception when others then
  raise notice 'statement failed: %', sqlerrm;
  return false;
end $$;

insert into auth.users (id, email) values
  ('d1111111-1111-4111-8111-111111111111', 'owner@stock.test'),
  ('d2222222-2222-4222-8222-222222222222', 'viewer@stock.test'),
  ('d3333333-3333-4333-8333-333333333333', 'rival@stock.test')
  on conflict (id) do nothing;

set local role authenticated;

select pg_temp.act_as('d1111111-1111-4111-8111-111111111111');
select public.create_organisation('Kimkem Pharmacy', 'kimkem', null, 'ZA', 'ZAR') as org \gset
select set_config('amryn_test.org', :'org', true);

select pg_temp.act_as('d3333333-3333-4333-8333-333333333333');
select public.create_organisation('Rival Chemist', 'rival-chemist', null, 'ZA', 'ZAR') as org \gset
select set_config('amryn_test.rival', :'org', true);

set local role postgres;
select pg_temp.act_as_operator();
insert into public.organisation_members (organisation_id, user_id, role, status)
values (current_setting('amryn_test.org')::uuid,
        'd2222222-2222-4222-8222-222222222222', 'viewer', 'active')
on conflict do nothing;
set local role authenticated;

-- ── the permission exists and reaches the right roles ────────────────────

select pg_temp.act_as('d1111111-1111-4111-8111-111111111111');

select pg_temp.check(
  exists (select 1 from public.permissions where key = 'manage_inventory'),
  'manage_inventory is in the catalogue');

select pg_temp.check(
  amryn.has_permission(current_setting('amryn_test.org')::uuid, 'manage_inventory'),
  'the organisation administrator holds it');

-- Deliberately not the viewer: actioning a line is a decision about stock,
-- not a way of reading about it.
select pg_temp.check(
  not exists (
    select 1 from public.role_permissions
     where role = 'viewer' and permission_key = 'manage_inventory'),
  'and a viewer does not');

-- ── recording a stocktake ────────────────────────────────────────────────

insert into public.stock_audits
  (organisation_id, site_name, auditor_name, responsible_name, shift,
   compliance_profile_id, audit_date, status)
values
  (current_setting('amryn_test.org')::uuid, 'Kimkem Kimberley', 'Staff Member',
   'Peter Du Toit', 'Full Day Audit', 'pharmacy-sahpra', current_date, 'in_progress')
returning id as audit \gset
select set_config('amryn_test.audit', :'audit', true);

-- The second line names an action, so it carries a date in the same insert.
-- Writing it without one is refused, which is asserted below — and is why the
-- importer fills the date from the audit rather than rejecting the row.
insert into public.stock_items
  (organisation_id, audit_id, product_name, sku, batch_number, department,
   qty, expiry_date, action, actioned_by, actioned_on, position)
values
  (current_setting('amryn_test.org')::uuid, current_setting('amryn_test.audit')::uuid,
   'Amoxicillin 500mg', 'AMX500', 'B-2291', 'Dispensary',
   40, current_date - 10, 'pending_review', '', null, 1),
  (current_setting('amryn_test.org')::uuid, current_setting('amryn_test.audit')::uuid,
   'Paracetamol 500mg', 'PCM500', 'B-3310', 'Front Shop',
   120, current_date + 20, 'left_on_shelf', 'Staff Member', current_date, 2);

select pg_temp.check(
  (select count(*) from public.stock_items
    where audit_id = current_setting('amryn_test.audit')::uuid) = 2,
  'a stocktake records its lines');

-- ── the constraints that keep the report evidential ──────────────────────
--
-- The disposal and insurance notes on the report depend on an actioned line
-- carrying a date. Recording one without the other is exactly how a disposal
-- ends up undocumented.
select pg_temp.check(
  pg_temp.refused($$
    insert into public.stock_items
      (organisation_id, audit_id, product_name, qty, expiry_date, action)
    values (current_setting('amryn_test.org')::uuid,
            current_setting('amryn_test.audit')::uuid,
            'Undocumented disposal', 5, current_date, 'destroyed')
  $$, 'actioned_lines_carry_a_date'),
  'a line cannot be actioned without recording when');

select pg_temp.check(
  pg_temp.refused($$
    update public.stock_audits set status = 'complete'
     where id = current_setting('amryn_test.audit')::uuid
  $$, 'complete_carries_a_time'),
  'and an audit cannot claim to be finished without a completion time');

select pg_temp.check(
  pg_temp.succeeds($$
    update public.stock_audits set status = 'complete', completed_at = now()
     where id = current_setting('amryn_test.audit')::uuid
  $$),
  'finishing one properly is accepted');

-- ── tenancy ──────────────────────────────────────────────────────────────

select pg_temp.act_as('d3333333-3333-4333-8333-333333333333');

select pg_temp.check(
  (select count(*) from public.stock_items) = 0
  and (select count(*) from public.stock_audits) = 0,
  'another organisation sees none of it');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.stock_items
      (organisation_id, audit_id, product_name, qty, expiry_date)
    values (current_setting('amryn_test.org')::uuid,
            current_setting('amryn_test.audit')::uuid,
            'Injected line', 1, current_date + 100)
  $$, 'row-level security'),
  'nor can it add a line to somebody else''s stocktake');

-- ── reading without being able to action ─────────────────────────────────
--
-- No role has one and not the other: everybody granted view_operations_data is
-- also granted manage_inventory, and a viewer has neither. The read-only
-- stocktaker is made by a per-member override, which is what that mechanism is
-- for — so this exercises the policy split and the override together.
set local role postgres;
select pg_temp.act_as_operator();
insert into public.member_permission_overrides
  (organisation_id, member_id, permission_key, granted)
select current_setting('amryn_test.org')::uuid, m.id, 'view_operations_data', true
  from public.organisation_members m
 where m.organisation_id = current_setting('amryn_test.org')::uuid
   and m.user_id = 'd2222222-2222-4222-8222-222222222222'
on conflict do nothing;
set local role authenticated;

select pg_temp.act_as('d2222222-2222-4222-8222-222222222222');

select pg_temp.check(
  amryn.has_permission(current_setting('amryn_test.org')::uuid, 'view_operations_data')
  and not amryn.has_permission(current_setting('amryn_test.org')::uuid, 'manage_inventory'),
  'the override grants sight of operational data and nothing more');

select pg_temp.check(
  (select count(*) from public.stock_items
    where organisation_id = current_setting('amryn_test.org')::uuid) = 2,
  'a colleague who may see operational data reads the stocktake');

-- Row Level Security does not raise on an update: it matches no rows and
-- reports success. So the assertion is that nothing moved.
update public.stock_items set action = 'destroyed', actioned_on = current_date
 where organisation_id = current_setting('amryn_test.org')::uuid;

select pg_temp.check(
  (select count(*) from public.stock_items
    where organisation_id = current_setting('amryn_test.org')::uuid
      and action = 'destroyed') = 0,
  'and cannot mark a batch destroyed');

-- ── a lapsed subscription stops new stocktakes, not the record of old ones ──
--
-- Migration 16 attaches its guard by iterating the catalogue at the moment it
-- runs, so these two tables carry it only because migration 18 attached it by
-- hand. This is the assertion that the hand-attachment happened.
set local role postgres;
select pg_temp.act_as_operator();
update public.subscriptions set status = 'cancelled', cancelled_at = now()
 where organisation_id = current_setting('amryn_test.org')::uuid;
set local role authenticated;

select pg_temp.act_as('d1111111-1111-4111-8111-111111111111');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.stock_audits (organisation_id, site_name)
    values (current_setting('amryn_test.org')::uuid, 'Second site')
  $$, 'subscription is not active'),
  'a lapsed organisation cannot record a new stocktake');

select pg_temp.check(
  (select count(*) from public.stock_items
    where organisation_id = current_setting('amryn_test.org')::uuid) = 2,
  'and still reads the stocktakes it has — the report is evidence it may need');

reset role;
rollback;

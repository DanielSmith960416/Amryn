-- The audit log, and whether anything in it can be trusted.
--
-- Before migration 14 a member could insert any row: an action of their
-- choosing, with somebody else's id in actor_id. These assertions are about
-- the two things that make an entry evidence — that the actor is the session,
-- and that there is no other way in.
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
end $$;

insert into auth.users (id, email) values
  ('b1111111-1111-4111-8111-111111111111', 'admin@audit.test'),
  ('b2222222-2222-4222-8222-222222222222', 'member@audit.test'),
  ('b3333333-3333-4333-8333-333333333333', 'stranger@audit.test')
  on conflict (id) do nothing;

set local role authenticated;
select pg_temp.act_as('b1111111-1111-4111-8111-111111111111');
select public.create_organisation('Audit Test Co', 'audit-test-co', null, 'ZA', 'ZAR') as org \gset
select set_config('amryn_test.audit_org', :'org', true);

-- ── the direct insert is gone ────────────────────────────────────────────
do $$
begin
  insert into public.audit_logs (organisation_id, actor_id, action, entity_type, summary)
  values (current_setting('amryn_test.audit_org')::uuid,
          'b3333333-3333-4333-8333-333333333333',
          'organisation.deleted', 'organisation', 'Signed off by the stranger');
  raise exception 'FAIL  an audit row was written directly, with a forged actor';
exception when insufficient_privilege then
  raise notice 'pass  an audit row cannot be written directly';
end $$;

-- ── the function decides the actor ───────────────────────────────────────
select public.record_security_event(
  :'org'::uuid, 'organisation.settings_changed', 'organisation', :'org', 'Currency changed');

select pg_temp.check(
  (select count(*) from public.audit_logs
    where organisation_id = :'org'::uuid
      and action = 'organisation.settings_changed'
      and actor_id = 'b1111111-1111-4111-8111-111111111111') = 1,
  'the function records the caller as the actor');

-- There is no parameter to point at somebody else, which is the point: the
-- only actor a caller can write is themselves. Confirmed by writing as a
-- different session and checking whose name lands on the row.
select pg_temp.act_as('b2222222-2222-4222-8222-222222222222');

do $$
begin
  -- Not a member of that organisation, so the write is refused outright.
  perform public.record_security_event(
    current_setting('amryn_test.audit_org')::uuid, 'organisation.deleted');
  raise exception 'FAIL  a non-member wrote into another organisation''s audit log';
exception when insufficient_privilege then
  raise notice 'pass  a non-member cannot write into another organisation''s log';
end $$;

-- ── account events carry no organisation, and no organisation reads them ──
select public.record_account_event('account.signed_in', 'Signed in');

select pg_temp.check(
  (select count(*) from public.audit_logs where organisation_id is null) = 0,
  'an account-level entry is invisible through the API, even to its own subject');

-- It is nonetheless there: this is a record we hold as responsible party, not
-- one an employer may read out of somebody's workspace.
set local role postgres;
select pg_temp.check(
  (select count(*) from public.audit_logs
    where organisation_id is null
      and action = 'account.signed_in'
      and actor_id = 'b2222222-2222-4222-8222-222222222222') = 1,
  'and it was written, with the right actor on it');
set local role authenticated;

-- ── an ordinary member cannot read the organisation log ──────────────────
--
-- Reading needs view_audit_log. Making the member a real member first, so the
-- assertion is about the permission rather than about not belonging.
set local role postgres;
insert into public.organisation_members (organisation_id, user_id, role, status)
values (current_setting('amryn_test.audit_org')::uuid,
        'b2222222-2222-4222-8222-222222222222', 'viewer', 'active')
on conflict do nothing;
set local role authenticated;

select pg_temp.check(
  (select count(*) from public.organisation_members
    where organisation_id = current_setting('amryn_test.audit_org')::uuid
      and user_id = 'b2222222-2222-4222-8222-222222222222') = 1,
  'the viewer really is a member of that organisation');

select pg_temp.check(
  (select count(*) from public.audit_logs
    where organisation_id = current_setting('amryn_test.audit_org')::uuid) = 0,
  'a member without view_audit_log reads none of it');

-- ── and the administrator does ───────────────────────────────────────────
select pg_temp.act_as('b1111111-1111-4111-8111-111111111111');

-- Two entries, not one: create_organisation() writes 'organisation.created'
-- itself. Asserted on the actions rather than on a count, because a count is
-- satisfied by the wrong rows as easily as by the right ones.
select pg_temp.check(
  (select array_agg(action order by action) from public.audit_logs
    where organisation_id = current_setting('amryn_test.audit_org')::uuid)
    = array['organisation.created', 'organisation.settings_changed'],
  'an administrator reads their own organisation''s entries');

rollback;

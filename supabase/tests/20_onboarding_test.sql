-- Onboarding: resumable, skippable, and closed to everyone else's.
--
-- The interesting assertions are about the states that a wizard held in the
-- browser could not have: a step skipped and later answered, a step answered
-- and later skipped, and a second organisation whose progress must be
-- invisible from the first.
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

create or replace function pg_temp.refused(stmt text, needle text) returns boolean
language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  if position(lower(needle) in lower(sqlerrm)) > 0 then return true; end if;
  raise exception 'statement failed for an unrelated reason: %', sqlerrm;
end $$;

insert into auth.users (id, email) values
  ('a1111111-1111-4111-8111-111111111111', 'founder@setup.test'),
  ('a2222222-2222-4222-8222-222222222222', 'analyst@setup.test'),
  ('a3333333-3333-4333-8333-333333333333', 'other@setup.test')
  on conflict (id) do nothing;

set local role authenticated;

select pg_temp.act_as('a1111111-1111-4111-8111-111111111111');
select public.create_organisation('Setup Co', 'setup-co', null, 'ZA', 'ZAR') as org \gset
select set_config('amryn_test.org', :'org', true);

select pg_temp.act_as('a3333333-3333-4333-8333-333333333333');
select public.create_organisation('Other Co', 'other-co', null, 'ZA', 'ZAR') as org \gset
select set_config('amryn_test.other', :'org', true);

set local role postgres;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
insert into public.organisation_members (organisation_id, user_id, role, status)
values (current_setting('amryn_test.org')::uuid,
        'a2222222-2222-4222-8222-222222222222', 'analyst', 'active')
on conflict do nothing;
set local role authenticated;

-- ── opening the record ───────────────────────────────────────────────────

select pg_temp.act_as('a1111111-1111-4111-8111-111111111111');

select pg_temp.check(
  (select current_step from public.ensure_onboarding(current_setting('amryn_test.org')::uuid))
    = 'identity',
  'setting up starts at the first question');

-- Called on every page load, so this is the assertion that stops a refresh
-- resetting somebody to the beginning.
select pg_temp.check(
  (select completed_at is null
     from public.ensure_onboarding(current_setting('amryn_test.org')::uuid)) ,
  'and calling it again is harmless');

select pg_temp.check(
  (select count(*) from public.onboarding_progress
    where organisation_id = current_setting('amryn_test.org')::uuid) = 1,
  'exactly one record per organisation, however many times it is asked for');

-- ── answering, skipping, and changing your mind ──────────────────────────

update public.onboarding_progress
   set completed_steps = array['identity'], current_step = 'structure'
 where organisation_id = current_setting('amryn_test.org')::uuid;

update public.onboarding_progress
   set skipped_steps = array['structure'], current_step = 'objectives'
 where organisation_id = current_setting('amryn_test.org')::uuid;

select pg_temp.check(
  (select completed_steps = array['identity'] and skipped_steps = array['structure']
     from public.onboarding_progress
    where organisation_id = current_setting('amryn_test.org')::uuid),
  'a step can be answered and the next one skipped');

-- The state that matters most, because the review page reads both arrays and
-- would otherwise have two contradictory answers for one question.
select pg_temp.check(
  pg_temp.refused($$
    update public.onboarding_progress
       set completed_steps = array['identity','structure'],
           skipped_steps   = array['structure']
     where organisation_id = current_setting('amryn_test.org')::uuid
  $$, 'not_both_done_and_skipped'),
  'and cannot be both at once');

-- Answering something previously skipped is an edit, not a contradiction.
update public.onboarding_progress
   set completed_steps = array['identity','structure'], skipped_steps = array[]::text[]
 where organisation_id = current_setting('amryn_test.org')::uuid;

select pg_temp.check(
  (select skipped_steps = array[]::text[] and 'structure' = any(completed_steps)
     from public.onboarding_progress
    where organisation_id = current_setting('amryn_test.org')::uuid),
  'a skipped step can be answered later');

-- A misspelling here would sit in the array for ever, matching nothing, and
-- the customer would be asked the same question at every sitting.
select pg_temp.check(
  pg_temp.refused($$
    update public.onboarding_progress
       set completed_steps = array['identity','strucutre']
     where organisation_id = current_setting('amryn_test.org')::uuid
  $$, 'steps_are_known'),
  'a step name that is not one of the seven is refused');

select pg_temp.check(
  pg_temp.refused($$
    update public.onboarding_progress set current_step = 'pricing'
     where organisation_id = current_setting('amryn_test.org')::uuid
  $$, 'steps_are_known'),
  'and so is resuming at one');

-- ── who may see it and change it ─────────────────────────────────────────

select pg_temp.act_as('a2222222-2222-4222-8222-222222222222');

select pg_temp.check(
  (select count(*) from public.onboarding_progress
    where organisation_id = current_setting('amryn_test.org')::uuid) = 1,
  'a colleague can see how far setting up has got');

-- Row Level Security does not raise on an update: it matches no rows and
-- reports success. So the assertion is that nothing moved, not that anything
-- threw — a test written the other way would pass against a table with no
-- policies at all.
update public.onboarding_progress set current_step = 'review'
 where organisation_id = current_setting('amryn_test.org')::uuid;

select pg_temp.check(
  (select current_step from public.onboarding_progress
    where organisation_id = current_setting('amryn_test.org')::uuid) <> 'review',
  'but cannot answer for the organisation without the permission');

select pg_temp.check(
  pg_temp.refused($$
    select public.complete_onboarding(current_setting('amryn_test.org')::uuid)
  $$, 'only an administrator'),
  'nor declare it finished');

-- Another organisation entirely.
select pg_temp.act_as('a3333333-3333-4333-8333-333333333333');
select public.ensure_onboarding(current_setting('amryn_test.other')::uuid);

select pg_temp.check(
  (select count(*) from public.onboarding_progress) = 1,
  'and sees only their own organisation''s progress');

select pg_temp.check(
  pg_temp.refused($$
    select public.ensure_onboarding(current_setting('amryn_test.org')::uuid)
  $$, 'not a member'),
  'and cannot open a record against somebody else''s');

-- ── finishing ────────────────────────────────────────────────────────────

select pg_temp.act_as('a1111111-1111-4111-8111-111111111111');
select public.complete_onboarding(current_setting('amryn_test.org')::uuid);

select pg_temp.check(
  (select completed_at is not null and initialised_at is not null
     from public.onboarding_progress
    where organisation_id = current_setting('amryn_test.org')::uuid),
  'finishing records both the answers being done and the twin being built');

select pg_temp.check(
  (select count(*) from public.audit_logs
    where organisation_id = current_setting('amryn_test.org')::uuid
      and action = 'onboarding.completed') = 1,
  'and says so in the audit log');

-- Pressing the button twice must not restart the clock on a subscription, a
-- report period, or anything else measured from initialisation.
select set_config('amryn_test.first',
  (select initialised_at::text from public.onboarding_progress
    where organisation_id = current_setting('amryn_test.org')::uuid), true);

select public.complete_onboarding(current_setting('amryn_test.org')::uuid);

select pg_temp.check(
  (select initialised_at::text from public.onboarding_progress
    where organisation_id = current_setting('amryn_test.org')::uuid)
  = current_setting('amryn_test.first'),
  'and finishing twice does not move the date it was first finished');

reset role;
rollback;

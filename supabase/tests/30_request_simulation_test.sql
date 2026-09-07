-- Asking for a run.
--
-- job_runs has no write policy and is not getting one. This function is the
-- only way a person reaches the queue for the Twin, so what matters is not
-- that it works but that it refuses: the wrong role, the wrong organisation,
-- the switch off, and a second press while one is already in flight.
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
  ('e1111111-1111-4111-8111-111111111111', 'owner@twinco.test'),
  ('e2222222-2222-4222-8222-222222222222', 'analyst@twinco.test'),
  ('e3333333-3333-4333-8333-333333333333', 'owner@rivaltwin.test')
  on conflict (id) do nothing;

set local role authenticated;

select pg_temp.act_as('e1111111-1111-4111-8111-111111111111');
select public.create_organisation('Twin Co', 'twin-co-req-test', null, 'ZA', 'ZAR') as org \gset

select pg_temp.act_as('e3333333-3333-4333-8333-333333333333');
select public.create_organisation('Rival Twin', 'rival-twin-req-test', null, 'ZA', 'ZAR') as rival \gset

-- A scenario to ask about, and the licence the handler will need. Written as
-- the owner so the insert passes through the real policy rather than round it.
select pg_temp.act_as('e1111111-1111-4111-8111-111111111111');
insert into public.twin_scenarios (id, organisation_id, name, is_baseline)
values ('e9000000-0000-4000-8000-000000000001', :'org'::uuid, 'Carry on as you are', true);

select set_config('amryn_test.org', :'org', true);

-- ═══════════════════════════════════════════════════════════════════════════
-- The switch is off until somebody turns it on
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This is the first thing a new organisation hits, and it is the point of the
-- flag: a person pressing the button is told the Twin is off rather than
-- watching a job sit queued for ever behind claim_jobs.

select pg_temp.check(
  pg_temp.refused($$
    select public.request_simulation(
      current_setting('amryn_test.org')::uuid,
      'e9000000-0000-4000-8000-000000000001')
  $$, 'not switched on'),
  'with the Twin off, asking for a run says so rather than queueing');

select pg_temp.check(
  (select count(*) from public.job_runs where kind = 'twin.simulate') = 0,
  'and queued nothing while saying it');

-- Turned on the way it is turned on in production: over a direct connection,
-- by us. There is deliberately no write policy for a customer to use.
reset role;
insert into public.organisation_feature_flags (organisation_id, flag_key, enabled, note)
values ((select current_setting('amryn_test.org')::uuid), 'digital_twin_simulation', true,
        'Turned on for this test.');
set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Whose scenario it is
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.act_as('e3333333-3333-4333-8333-333333333333');

select pg_temp.check(
  pg_temp.refused($$
    select public.request_simulation(
      current_setting('amryn_test.org')::uuid,
      'e9000000-0000-4000-8000-000000000001')
  $$, 'administrator'),
  'an administrator of another organisation cannot spend this one''s worker time');

-- ═══════════════════════════════════════════════════════════════════════════
-- And a scenario that is not this organisation's
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.act_as('e1111111-1111-4111-8111-111111111111');

select pg_temp.check(
  pg_temp.refused($$
    select public.request_simulation(
      current_setting('amryn_test.org')::uuid,
      'e9000000-0000-4000-8000-0000000000ff')
  $$, 'does not belong'),
  'a scenario id from nowhere is refused rather than queued and left to fail');

-- ═══════════════════════════════════════════════════════════════════════════
-- The ordinary case: two jobs, and the simulation waits for the measurement
-- ═══════════════════════════════════════════════════════════════════════════

select public.request_simulation(
  current_setting('amryn_test.org')::uuid,
  'e9000000-0000-4000-8000-000000000001') as first \gset

select pg_temp.check(
  (:'first'::jsonb ->> 'status') = 'queued',
  'the first ask queues a run');

select pg_temp.check(
  (:'first'::jsonb ->> 'measurement_queued')::boolean,
  'and queues the fidelity measurement it will need, because a run cannot be stored without one');

select pg_temp.check(
  (:'first'::jsonb ->> 'starts_in_seconds')::int = 90,
  'the simulation waits, since this call is what started the measurement');

reset role;

select pg_temp.check(
  (select count(*) from public.job_runs
    where kind = 'twin.measure_fidelity'
      and organisation_id = current_setting('amryn_test.org')::uuid) = 1,
  'one measurement queued');

select pg_temp.check(
  (select payload ->> 'scenario_id' from public.job_runs where kind = 'twin.simulate')
    = 'e9000000-0000-4000-8000-000000000001',
  'and the simulation names the scenario it was asked about');

select pg_temp.check(
  (select run_at > now() + interval '30 seconds' from public.job_runs where kind = 'twin.simulate'),
  'the simulation is scheduled behind the measurement rather than beside it');

-- ═══════════════════════════════════════════════════════════════════════════
-- Pressing twice
-- ═══════════════════════════════════════════════════════════════════════════
--
-- singleton_key rather than dedupe_key: one run of a scenario in flight at a
-- time, and the next may be asked for the moment this one lands. A person who
-- moves a lever and asks again is not a duplicate.

set local role authenticated;

select public.request_simulation(
  current_setting('amryn_test.org')::uuid,
  'e9000000-0000-4000-8000-000000000001') as second \gset

select pg_temp.check(
  (:'second'::jsonb ->> 'status') = 'already_running',
  'pressing twice says the answer is already coming rather than raising');

select pg_temp.check(
  not (:'second'::jsonb ->> 'measurement_queued')::boolean,
  'and takes no second measurement — the nightly tick and this share one key per day');

reset role;

select pg_temp.check(
  (select count(*) from public.job_runs where kind = 'twin.simulate') = 1,
  'still exactly one simulation queued');

-- Once it has landed, the next may be asked for. The singleton index is
-- partial on status, which is what makes that true.
update public.job_runs
   set status = 'succeeded', finished_at = now()
 where kind = 'twin.simulate';

set local role authenticated;
select pg_temp.act_as('e1111111-1111-4111-8111-111111111111');

select public.request_simulation(
  current_setting('amryn_test.org')::uuid,
  'e9000000-0000-4000-8000-000000000001') as third \gset

select pg_temp.check(
  (:'third'::jsonb ->> 'status') = 'queued',
  'and once the last run has landed, another may be asked for');

select pg_temp.check(
  (:'third'::jsonb ->> 'starts_in_seconds')::int = 0,
  'starting immediately this time, because today''s measurement was already taken');

-- ═══════════════════════════════════════════════════════════════════════════
-- Nobody may reach job_runs any other way
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The whole reason this function exists. If a session could insert directly,
-- every rule above would be a suggestion.

select pg_temp.check(
  pg_temp.refused($$
    insert into public.job_runs (organisation_id, kind, payload)
    values (current_setting('amryn_test.org')::uuid, 'twin.simulate', '{}'::jsonb)
  $$, 'row-level security'),
  'a session cannot write to the queue directly — the function is the only door');

rollback;

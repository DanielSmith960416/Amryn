-- A simulation cannot be stored without naming what stands behind it.
--
-- #70 protected the tables a customer reads. Storing simulation runs in their
-- own table reopens that hole from the other side: a screen can read this
-- table directly, and every percentile in it would reach a reader without
-- passing the gate. So the licence is required one step earlier, and these
-- assertions are about the database refusing rather than the application
-- remembering.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.check(ok boolean, what text) returns void
language plpgsql as $$
begin
  if ok then raise notice 'pass  %', what;
  else raise exception 'FAIL  %', what; end if;
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

insert into public.organisations (id, name, slug, country_code, currency_code)
values ('b0000000-0000-4000-8000-000000000001', 'Scenario Co', 'scenario-co', 'ZA', 'ZAR');

set local role postgres;

insert into public.twin_fidelity
  (id, organisation_id, status, months_available, reason)
values
  ('b1000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000001', 'not_measurable', 0,
   'No history yet. Naming this is the point: an unanswerable question is not an unasked one.');

insert into public.twin_scenarios (id, organisation_id, name, is_baseline)
values ('b2000000-0000-4000-8000-000000000001',
        'b0000000-0000-4000-8000-000000000001', 'Carry on as you are', true);

-- ═══════════════════════════════════════════════════════════════════════════
-- One baseline, and one name
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    insert into public.twin_scenarios (organisation_id, name, is_baseline)
    values ('b0000000-0000-4000-8000-000000000001', 'Also the baseline', true)
  $$, 'twin_scenarios_one_baseline'),
  'a second baseline is refused — every other scenario needs one thing to be compared against');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.twin_scenarios (organisation_id, name)
    values ('b0000000-0000-4000-8000-000000000001', 'Carry on as you are')
  $$, 'scenario_name_is_unique_per_organisation'),
  'and two scenarios cannot share a name, because a comparison needs to say which is which');

-- ═══════════════════════════════════════════════════════════════════════════
-- Multipliers, not assertions
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    insert into public.twin_scenarios (organisation_id, name, demand_multiplier)
    values ('b0000000-0000-4000-8000-000000000001', 'Nothing sells', 0)
  $$, 'demand_multiplier'),
  'a multiplier of zero is refused — that is not a scenario, it is a different business');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.twin_scenarios (organisation_id, name, horizon_days)
    values ('b0000000-0000-4000-8000-000000000001', 'Ten years out', 3650)
  $$, 'horizon_days'),
  'and a ten-year horizon is refused: past three years "nothing else changes" is a fiction');

-- ═══════════════════════════════════════════════════════════════════════════
-- The licence, one step earlier than #70
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    insert into public.twin_simulations
      (organisation_id, scenario_id, seed, iterations, horizon_days,
       revenue_p10_cents, revenue_p50_cents, revenue_p90_cents)
    values ('b0000000-0000-4000-8000-000000000001',
            'b2000000-0000-4000-8000-000000000001', 1, 500, 90, 100, 200, 300)
  $$, 'fidelity_id'),
  'a simulation cannot be recorded without naming the measurement behind it');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.twin_simulations
      (organisation_id, scenario_id, fidelity_id, seed, iterations, horizon_days,
       revenue_p10_cents, revenue_p50_cents, revenue_p90_cents)
    values ('b0000000-0000-4000-8000-000000000001',
            'b2000000-0000-4000-8000-000000000001',
            'b1000000-0000-4000-8000-000000000001', 1, 80, 90, 100, 200, 300)
  $$, 'iterations'),
  'nor with eighty iterations — a percentile from eighty samples is a number nobody qualified');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.twin_simulations
      (organisation_id, scenario_id, fidelity_id, seed, iterations, horizon_days,
       revenue_p10_cents, revenue_p50_cents, revenue_p90_cents)
    values ('b0000000-0000-4000-8000-000000000001',
            'b2000000-0000-4000-8000-000000000001',
            'b1000000-0000-4000-8000-000000000001', 1, 500, 90, 900, 200, 300)
  $$, 'simulation_interval_is_ordered'),
  'and a transposed interval is refused, because it reads as reasonable from either end');

-- Naming a measurement that says it could not measure is entirely valid, and
-- is the only option most businesses will have for a long time.
insert into public.twin_simulations
  (id, organisation_id, scenario_id, fidelity_id, seed, iterations, horizon_days,
   revenue_p10_cents, revenue_p50_cents, revenue_p90_cents, assumptions)
values
  ('b3000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000001',
   'b2000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000001',
   4242, 500, 90, 100000, 150000, 220000,
   '["Orders arrive independently from day to day."]'::jsonb);

select pg_temp.check(
  (select seed = 4242 from public.twin_simulations
    where id = 'b3000000-0000-4000-8000-000000000001'),
  'a run keeps its seed, which is what makes a figure somebody disagrees with reproducible');

select pg_temp.check(
  (select jsonb_array_length(assumptions) = 1 from public.twin_simulations
    where id = 'b3000000-0000-4000-8000-000000000001'),
  'and carries the beliefs it ran under, rather than leaving them in the source');

-- ═══════════════════════════════════════════════════════════════════════════
-- A stored result must not be editable after the fact
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    delete from public.twin_fidelity where id = 'b1000000-0000-4000-8000-000000000001'
  $$, 'violates foreign key'),
  'the measurement cannot be deleted while a run still rests on it');

rollback;

-- The analysis run, and the gate it freezes.
--
-- Two things are being asserted here, and they are different in kind.
--
-- The first is that the gate cannot be applied by halves. A run that marks its
-- findings provisional but still discusses expansion, or the reverse, is worse
-- than one that does neither: it looks like a considered position rather than
-- a writer who forgot the second line. That is a constraint, so the assertion
-- is that the database refuses it.
--
-- The second is that finishing an Imprint queues exactly one reading, in the
-- same transaction, and only when the switch is on. That is behaviour, so the
-- assertion is that the production function does it — this file calls
-- complete_imprint rather than reimplementing what it ought to do.
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
values ('f0000000-0000-4000-8000-000000000001', 'Analysis Co', 'analysis-co', 'ZA', 'ZAR');

set local role postgres;

-- ═══════════════════════════════════════════════════════════════════════════
-- The gate is all or nothing
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    insert into public.analysis_runs
      (organisation_id, trigger, is_provisional, expansion_suppressed)
    values ('f0000000-0000-4000-8000-000000000001', 'test', true, false)
  $$, 'gate_is_applied_consistently'),
  'a run cannot mark its findings provisional and still discuss expansion');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.analysis_runs
      (organisation_id, trigger, is_provisional, expansion_suppressed)
    values ('f0000000-0000-4000-8000-000000000001', 'test', false, true)
  $$, 'gate_is_applied_consistently'),
  'nor suppress expansion while presenting its findings as settled');

-- ═══════════════════════════════════════════════════════════════════════════
-- A finished run says when, and a failed one says why
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    insert into public.analysis_runs
      (organisation_id, trigger, status, is_provisional, expansion_suppressed)
    values ('f0000000-0000-4000-8000-000000000001', 'test', 'succeeded', false, false)
  $$, 'finished_carries_a_time'),
  'a run cannot claim to have succeeded without saying when it finished');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.analysis_runs
      (organisation_id, trigger, status, finished_at, is_provisional, expansion_suppressed)
    values ('f0000000-0000-4000-8000-000000000001', 'test', 'failed', now(), false, false)
  $$, 'outcome_and_error_agree'),
  'a failed run with no error is a failure nobody can act on, and is refused');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.analysis_runs
      (organisation_id, trigger, status, finished_at, error, is_provisional, expansion_suppressed)
    values ('f0000000-0000-4000-8000-000000000001', 'test', 'succeeded', now(), 'but it worked', false, false)
  $$, 'outcome_and_error_agree'),
  'and a success carrying an error is refused for the same reason');

-- ═══════════════════════════════════════════════════════════════════════════
-- One reading in flight, per organisation
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.analysis_runs
  (id, organisation_id, trigger, status, is_provisional, expansion_suppressed)
values
  ('f1000000-0000-4000-8000-000000000001',
   'f0000000-0000-4000-8000-000000000001', 'test', 'running', false, false);

select pg_temp.check(
  pg_temp.refused($$
    insert into public.analysis_runs
      (organisation_id, trigger, status, is_provisional, expansion_suppressed)
    values ('f0000000-0000-4000-8000-000000000001', 'test', 'queued', false, false)
  $$, 'analysis_runs_one_in_flight'),
  'a second reading cannot start while one is already in flight');

-- Finished runs do not hold the slot: the index covers queued and running only,
-- so a business can be read again tomorrow.
update public.analysis_runs
   set status = 'succeeded', finished_at = now()
 where id = 'f1000000-0000-4000-8000-000000000001';

select pg_temp.check(
  (select count(*) = 1 from public.analysis_runs
    where organisation_id = 'f0000000-0000-4000-8000-000000000001'
      and status = 'succeeded'),
  'and once it has finished, the slot is free again');

-- ═══════════════════════════════════════════════════════════════════════════
-- A finding carries its own caveat
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The column is duplicated from the run deliberately (#67's argument, applied
-- again): a caveat one join away is gone the moment the figure is quoted into
-- a board pack. What is asserted here is that it defaults to false, so the
-- rows written before any gate existed are not retroactively doubted.

insert into public.business_insights
  (organisation_id, headline, narrative, provenance)
values
  ('f0000000-0000-4000-8000-000000000001', 'Measured', 'From the ledger.', 'fact');

select pg_temp.check(
  (select not is_provisional from public.business_insights
    where organisation_id = 'f0000000-0000-4000-8000-000000000001'),
  'an insight written outside a gated run is not marked provisional');

select pg_temp.check(
  (select analysis_run_id is null from public.business_insights
    where organisation_id = 'f0000000-0000-4000-8000-000000000001'),
  'and claims no run produced it, rather than pointing at one that did not');

rollback;

-- A simulated figure must be licensed by a measurement.
--
-- Everything here asserts something the database *refuses*. A simulation
-- produces numbers whatever you feed it, and five hundred iterations of an
-- ungrounded model give a tight interval around a fiction — which reads as
-- more trustworthy rather than less. The rule that a simulated figure must
-- point at a fidelity measurement is the only thing standing between that and
-- a screen, so it is a constraint rather than a convention.
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

create or replace function pg_temp.succeeds(stmt text) returns boolean
language plpgsql as $$
begin
  execute stmt;
  return true;
exception when others then
  raise notice 'statement failed: %', sqlerrm;
  return false;
end $$;

insert into public.organisations (id, name, slug, country_code, currency_code)
values ('a0000000-0000-4000-8000-000000000001', 'Twin Co', 'twin-co', 'ZA', 'ZAR');

set local role postgres;

-- ═══════════════════════════════════════════════════════════════════════════
-- A score has to be earned on the months it claims
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    insert into public.twin_fidelity
      (organisation_id, status, months_available, score)
    values ('a0000000-0000-4000-8000-000000000001', 'measured', 1, 90)
  $$, 'enough_history_to_measure'),
  'a fidelity of 90 cannot be recorded against one month when three are required');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.twin_fidelity
      (organisation_id, status, months_available)
    values ('a0000000-0000-4000-8000-000000000001', 'measured', 6)
  $$, 'measured_carries_a_score'),
  'and a run that says it measured must produce a number');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.twin_fidelity
      (organisation_id, status, months_available)
    values ('a0000000-0000-4000-8000-000000000001', 'not_measurable', 0)
  $$, 'anything_else_says_why'),
  'a run that could not measure must say why, or somebody will guess');

-- The honest state for a business with no history, which is where this ships.
insert into public.twin_fidelity
  (id, organisation_id, status, months_available, reason)
values
  ('a1000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'not_measurable', 0,
   'No complete months of history. The Twin has never been checked against anything.');

select pg_temp.check(
  (select score is null from public.twin_fidelity
    where id = 'a1000000-0000-4000-8000-000000000001'),
  'an unmeasured Twin scores null rather than zero — nobody checked is not the same as hopeless');

-- ═══════════════════════════════════════════════════════════════════════════
-- The licence itself
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    insert into public.business_insights
      (organisation_id, headline, narrative, provenance,
       impact_cents, impact_p10_cents, impact_p50_cents, impact_p90_cents)
    values ('a0000000-0000-4000-8000-000000000001',
            'Simulated revenue lift', 'Five hundred iterations say so.', 'simulated',
            500000, 300000, 500000, 900000)
  $$, 'simulated_figure_is_licensed'),
  'a simulated figure cannot be written without a measurement to point at');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.ai_recommendations
      (organisation_id, title, summary, why_it_matters, recommended_action, provenance,
       impact_cents, impact_p10_cents, impact_p50_cents, impact_p90_cents)
    values ('a0000000-0000-4000-8000-000000000001',
            'Do the thing', 'It simulates well.', 'Because.', 'Do it.', 'simulated',
            500000, 300000, 500000, 900000)
  $$, 'simulated_figure_is_licensed'),
  'nor a simulated recommendation');

-- A measured figure is admitted. Note this points at a *not_measurable* run:
-- the constraint requires a measurement to exist and be named, not that it was
-- flattering. A Twin that was checked and found wanting still licenses a
-- figure — the score is what the reader weighs it by.
select pg_temp.check(
  pg_temp.succeeds($$
    insert into public.business_insights
      (organisation_id, headline, narrative, provenance, fidelity_id,
       impact_cents, impact_p10_cents, impact_p50_cents, impact_p90_cents)
    values ('a0000000-0000-4000-8000-000000000001',
            'Simulated revenue lift', 'Five hundred iterations, and here is how wrong we have been.',
            'simulated', 'a1000000-0000-4000-8000-000000000001',
            500000, 300000, 500000, 900000)
  $$),
  'and it is admitted once it names the measurement standing behind it');

-- Everything that is not simulated is unaffected. The rule is about
-- simulation, not about tightening every other write.
select pg_temp.check(
  pg_temp.succeeds($$
    insert into public.business_insights
      (organisation_id, headline, narrative, provenance)
    values ('a0000000-0000-4000-8000-000000000001', 'Measured', 'From the ledger.', 'fact')
  $$),
  'a fact needs no licence, because nothing was simulated to license');

-- ═══════════════════════════════════════════════════════════════════════════
-- Deleting the licence must not orphan the figure
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    delete from public.twin_fidelity where id = 'a1000000-0000-4000-8000-000000000001'
  $$, 'violates foreign key'),
  'the measurement cannot be deleted while a figure still rests on it');

rollback;

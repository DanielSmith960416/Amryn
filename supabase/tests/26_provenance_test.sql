-- Provenance: an estimate cannot be stored without saying how uncertain it is.
--
-- Every assertion here is about something the database *refuses*. That is the
-- point of putting the rule in a constraint rather than in the application: a
-- rule the writer has to remember is a rule that holds until the evening
-- somebody is in a hurry, and the row that gets through then is indistinguishable
-- from all the others afterwards.
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
values ('e0000000-0000-4000-8000-000000000001', 'Provenance Co', 'provenance-co', 'ZA', 'ZAR');

-- The owner writes these rows: the engines hold a direct connection, not a
-- session. Constraints apply to it exactly as they do to anybody.
set local role postgres;

-- Migration 28 requires a simulated figure to name the fidelity measurement
-- licensing it. That rule is asserted in its own file; here it would only
-- obscure what these cases are about, so the licence exists up front and every
-- simulated row below points at it.
insert into public.twin_fidelity
  (id, organisation_id, status, months_available, reason)
values
  ('e1000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000001', 'not_measurable', 0,
   'Fixture. This file is about uncertainty ranges, not about fidelity.');

-- ═══════════════════════════════════════════════════════════════════════════
-- Saying nothing is not an option
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    insert into public.business_insights (organisation_id, headline, narrative)
    values ('e0000000-0000-4000-8000-000000000001', 'A finding', 'Some narrative.')
  $$, 'provenance'),
  'an insight cannot be written without saying where its figure came from');

-- No default on the column, deliberately. A default is a way of not deciding
-- that still fills the field in, and the whole value of this column is that
-- somebody decided.
select pg_temp.check(
  (select count(*) from information_schema.columns
    where table_name = 'business_insights' and column_name = 'provenance'
      and column_default is null) = 1,
  'and there is no default to fall back on, so the decision cannot be skipped');

-- ═══════════════════════════════════════════════════════════════════════════
-- An estimate with a figure must carry a range
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    insert into public.business_insights
      (organisation_id, headline, narrative, impact_cents, provenance)
    values ('e0000000-0000-4000-8000-000000000001', 'Worth about this much',
            'A number with no working behind it.', 5000000, 'estimated')
  $$, 'uncertainty_carries_a_range'),
  'an estimated figure cannot be stored as a bare number');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.business_insights
      (organisation_id, headline, narrative, impact_cents, provenance, fidelity_id)
    values ('e0000000-0000-4000-8000-000000000001', 'The simulation says',
            'Produced by a model run.', 5000000, 'simulated',
            'e1000000-0000-4000-8000-000000000001')
  $$, 'uncertainty_carries_a_range'),
  'and neither can a simulated one — a model run is not a measurement');

select pg_temp.check(
  pg_temp.succeeds($$
    insert into public.business_insights
      (organisation_id, headline, narrative, impact_cents, provenance,
       impact_p10_cents, impact_p50_cents, impact_p90_cents)
    values ('e0000000-0000-4000-8000-000000000001', 'Worth about this much',
            'With the range it is honest.', 5000000, 'estimated', 2000000, 5000000, 9000000)
  $$),
  'with a range, the same estimate stores');

-- Facts and derivations are exempt, and that is the whole distinction. A
-- figure added up from invoices has no confidence interval to give.
select pg_temp.check(
  pg_temp.succeeds($$
    insert into public.business_insights
      (organisation_id, headline, narrative, impact_cents, provenance)
    values ('e0000000-0000-4000-8000-000000000001', 'Margin fell',
            'Arithmetic on figures the business reported.', -3000000, 'derived')
  $$),
  'a derived figure needs no range, because running it again gives the same number');

-- ═══════════════════════════════════════════════════════════════════════════
-- The shapes a range can be wrong in
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    insert into public.business_insights
      (organisation_id, headline, narrative, impact_cents, provenance,
       impact_p10_cents, impact_p50_cents)
    values ('e0000000-0000-4000-8000-000000000001', 'Half a range',
            'Two of three percentiles.', 5000000, 'estimated', 2000000, 5000000)
  $$, 'interval_is_whole'),
  'two percentiles out of three is refused — every reader completes a half-drawn range differently');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.business_insights
      (organisation_id, headline, narrative, impact_cents, provenance,
       impact_p10_cents, impact_p50_cents, impact_p90_cents)
    values ('e0000000-0000-4000-8000-000000000001', 'Backwards',
            'P10 above P90.', 5000000, 'estimated', 9000000, 5000000, 2000000)
  $$, 'interval_is_ordered'),
  'a range that runs backwards is refused — a transposition where both numbers look reasonable');

-- The constraint that stops a row carrying two numbers that both claim to be
-- the estimate. Without it a screen and a report can disagree and neither is
-- wrong.
select pg_temp.check(
  pg_temp.refused($$
    insert into public.business_insights
      (organisation_id, headline, narrative, impact_cents, provenance,
       impact_p10_cents, impact_p50_cents, impact_p90_cents)
    values ('e0000000-0000-4000-8000-000000000001', 'Two answers',
            'Headline disagrees with the median.', 7000000, 'estimated', 2000000, 5000000, 9000000)
  $$, 'headline_is_the_median'),
  'the headline figure has to be the P50, so a row cannot hold two estimates of the same thing');

-- A range with all three equal is a claim of certainty, and it is allowed:
-- sometimes a simulation genuinely converges. What is not allowed is silence.
select pg_temp.check(
  pg_temp.succeeds($$
    insert into public.business_insights
      (organisation_id, headline, narrative, impact_cents, provenance,
       impact_p10_cents, impact_p50_cents, impact_p90_cents, fidelity_id)
    values ('e0000000-0000-4000-8000-000000000001', 'Converged',
            'Every percentile the same.', 4000000, 'simulated', 4000000, 4000000, 4000000,
            'e1000000-0000-4000-8000-000000000001')
  $$),
  'a range with no width is allowed — a simulation may converge, and saying so is not the same as saying nothing');

-- ═══════════════════════════════════════════════════════════════════════════
-- The same rule, on the other two tables
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    insert into public.ai_recommendations
      (organisation_id, title, summary, why_it_matters, recommended_action, impact_cents, provenance)
    values ('e0000000-0000-4000-8000-000000000001', 'Do this', 'Because.', 'It matters.',
            'Act.', 5000000, 'estimated')
  $$, 'uncertainty_carries_a_range'),
  'a recommendation cannot promise an uncosted saving either');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.opportunities
      (organisation_id, title, kind, summary, estimated_value_cents, provenance)
    values ('e0000000-0000-4000-8000-000000000001', 'Might be big', 'market_expansion',
            'A guess.', 5000000, 'estimated')
  $$, 'uncertainty_carries_a_range'),
  'nor an opportunity name a value without saying how firm it is');

-- A published tender value is a fact. That is the distinction the column
-- exists to carry: the same field, two entirely different kinds of number.
select pg_temp.check(
  pg_temp.succeeds($$
    insert into public.opportunities
      (organisation_id, title, kind, summary, estimated_value_cents, provenance)
    values ('e0000000-0000-4000-8000-000000000001', 'Schools supply tender', 'tender',
            'Contract value as published.', 5000000, 'fact')
  $$),
  'a published tender value is a fact and needs no range, in the same column');

-- ═══════════════════════════════════════════════════════════════════════════
-- An external claim has to say where it came from
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    insert into public.market_signals (organisation_id, kind, title, summary)
    values ('e0000000-0000-4000-8000-000000000001', 'demand', 'Everyone wants this',
            'A claim about the world with nothing behind it.')
  $$, 'says_where_it_came_from'),
  'a signal about the outside world cannot be stored with no attribution at all');

select pg_temp.check(
  pg_temp.succeeds($$
    insert into public.market_signals (organisation_id, kind, title, summary, source_url)
    values ('e0000000-0000-4000-8000-000000000001', 'demand', 'Demand rose',
            'With somewhere to check.', 'https://example.test/report')
  $$),
  'a URL is enough');

-- Not every real source has a URL, and demanding one would push the honest
-- cases into inventing links.
select pg_temp.check(
  pg_temp.succeeds($$
    insert into public.market_signals (organisation_id, kind, title, summary, sourced_from)
    values ('e0000000-0000-4000-8000-000000000001', 'industry', 'A supplier said',
            'From a conversation, and recorded as such.', 'Supplier call, 4 September')
  $$),
  'and so is naming a source that has no URL — a phone call is attribution, an empty field is not');

rollback;

-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 25 — Where a number came from, and how sure it is
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This platform's entire claim is that it explains rather than describes. That
-- claim survives exactly as long as a reader can tell a figure the business
-- actually reported from a figure something inferred — and until now nothing
-- in the schema could tell them apart. `impact_cents` on an insight and
-- `impact_cents` on a recommendation are the same column type whether the
-- number was added up from invoices or produced by a model with a plausible
-- manner.
--
-- ── why a column and not a sentence ───────────────────────────────────────
-- The tempting version writes "estimated" into the narrative. That fails three
-- ways: it cannot be filtered on, it cannot be enforced, and it is the first
-- thing lost when a figure is quoted onward into a board pack. A column is
-- none of those. It travels with the number, a query can exclude everything
-- uncertain, and — the part that matters most — the database can refuse to
-- store an estimate that does not say how uncertain it is.
--
-- ── the four kinds ───────────────────────────────────────────────────────
--   fact       the business reported it, or stated it about itself. A revenue
--              figure from an import. The only kind that needs no defence.
--   derived    arithmetic on facts, by an engine, deterministically. Gross
--              margin from revenue and cost. Reproducible: run it again and it
--              is the same number.
--   estimated  inferred. Nobody measured it and it might be wrong. Requires a
--              range, always.
--   simulated  produced by a model run rather than observed. A Monte Carlo
--              percentile. Requires a range for the same reason, and is kept
--              distinct from `estimated` because a simulation can be re-run
--              and an estimate cannot.
--
-- ── which tables ─────────────────────────────────────────────────────────
-- The three that assert a money figure the business did not give us. Measured
-- tables — financial_records, metric_values — are facts by construction and
-- adding a column that would read 'fact' on every row would be noise pretending
-- to be rigour.
--
-- All three are empty in production, so the constraints below are strict from
-- the first row rather than accommodating a legacy nobody has to live with.

create type public.provenance as enum ('fact', 'derived', 'estimated', 'simulated');

comment on type public.provenance is
  'Where a number came from: reported, computed, inferred, or simulated. Mirrored in src/lib/provenance.ts.';

-- ═══════════════════════════════════════════════════════════════════════════
-- The rule, applied three times
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Four constraints per table, and each one closes a way of being misleading
-- while appearing rigorous:
--
--   whole      three percentiles or none. Two is a half-drawn range that every
--              reader completes differently.
--   ordered    P10 ≤ P50 ≤ P90. A range that runs backwards is a transposition
--              nobody notices because both numbers look reasonable.
--   median     the headline figure *is* the P50. Otherwise a row carries two
--              numbers both claiming to be the estimate, and a screen showing
--              one beside a report showing the other is unexplainable.
--   ranged     an estimate or a simulation with a figure must carry the range.
--              This is the brief's rule, and it is here rather than in the
--              application because a rule enforced by whoever remembers is not
--              a rule.

alter table public.business_insights
  -- No default. The writer has to decide, which is the entire point of the
  -- column — a default is a way of not deciding that still fills the field in.
  add column provenance         public.provenance not null,
  add column impact_p10_cents   bigint,
  add column impact_p50_cents   bigint,
  add column impact_p90_cents   bigint,
  add constraint insight_interval_is_whole check (
    (impact_p10_cents is null) = (impact_p50_cents is null)
    and (impact_p50_cents is null) = (impact_p90_cents is null)
  ),
  add constraint insight_interval_is_ordered check (
    impact_p10_cents is null
    or (impact_p10_cents <= impact_p50_cents and impact_p50_cents <= impact_p90_cents)
  ),
  add constraint insight_headline_is_the_median check (
    impact_p50_cents is null or impact_cents = impact_p50_cents
  ),
  add constraint insight_uncertainty_carries_a_range check (
    provenance in ('fact', 'derived')
    or impact_cents is null
    or impact_p50_cents is not null
  );

comment on column public.business_insights.provenance is
  'Where the impact figure came from. An estimate or a simulation cannot be stored without a P10/P50/P90 range.';

alter table public.ai_recommendations
  add column provenance         public.provenance not null,
  add column impact_p10_cents   bigint,
  add column impact_p50_cents   bigint,
  add column impact_p90_cents   bigint,
  add constraint recommendation_interval_is_whole check (
    (impact_p10_cents is null) = (impact_p50_cents is null)
    and (impact_p50_cents is null) = (impact_p90_cents is null)
  ),
  add constraint recommendation_interval_is_ordered check (
    impact_p10_cents is null
    or (impact_p10_cents <= impact_p50_cents and impact_p50_cents <= impact_p90_cents)
  ),
  add constraint recommendation_headline_is_the_median check (
    impact_p50_cents is null or impact_cents = impact_p50_cents
  ),
  add constraint recommendation_uncertainty_carries_a_range check (
    provenance in ('fact', 'derived')
    or impact_cents is null
    or impact_p50_cents is not null
  );

comment on column public.ai_recommendations.provenance is
  'Where the impact figure came from. An estimate or a simulation cannot be stored without a P10/P50/P90 range.';

-- Opportunities are the sharpest case. `estimated_value_cents` has the word in
-- its name and could still be stored as a bare number with nothing saying how
-- firm it was — a tender with a published contract value and a guess at what a
-- new market might be worth were indistinguishable once written down.
alter table public.opportunities
  add column provenance       public.provenance not null,
  add column value_p10_cents  bigint,
  add column value_p50_cents  bigint,
  add column value_p90_cents  bigint,
  add constraint opportunity_interval_is_whole check (
    (value_p10_cents is null) = (value_p50_cents is null)
    and (value_p50_cents is null) = (value_p90_cents is null)
  ),
  add constraint opportunity_interval_is_ordered check (
    value_p10_cents is null
    or (value_p10_cents <= value_p50_cents and value_p50_cents <= value_p90_cents)
  ),
  add constraint opportunity_headline_is_the_median check (
    value_p50_cents is null or estimated_value_cents = value_p50_cents
  ),
  add constraint opportunity_uncertainty_carries_a_range check (
    provenance in ('fact', 'derived')
    or estimated_value_cents is null
    or value_p50_cents is not null
  );

comment on column public.opportunities.provenance is
  'Where the value came from. A published tender value is a fact; what a new market might be worth is an estimate, and cannot be stored without a range.';

-- ═══════════════════════════════════════════════════════════════════════════
-- An external claim has to say where it came from
-- ═══════════════════════════════════════════════════════════════════════════
--
-- market_signals is the only table holding assertions about the world outside
-- the business, and `source_url` has always been nullable — so a signal could
-- be stored saying anything at all, with no way to check it and nothing to show
-- a reader who asks "says who?".
--
-- Not a check constraint, because a legitimate signal can come from somewhere
-- with no URL: a phone call, a trade publication, something a customer
-- mentioned. What cannot happen is a signal with no attribution of any kind.
-- So the requirement is that *something* identifies the origin, and a new
-- column carries the case a URL cannot.
alter table public.market_signals
  add column sourced_from text,
  add constraint signal_says_where_it_came_from check (
    source_url is not null or sourced_from is not null
  );

comment on column public.market_signals.sourced_from is
  'Where this came from when there is no URL to point at — a publication, a conversation, a filing. One of this and source_url must be present: an external claim nobody can attribute is a rumour.';

notify pgrst, 'reload schema';

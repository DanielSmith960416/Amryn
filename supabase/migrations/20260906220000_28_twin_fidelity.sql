-- ═══════════════════════════════════════════════════════════════════════════
-- 28. How wrong the Twin has been
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Phase 5 is the Digital Twin simulation: an agent-based daily model, Monte
-- Carlo over five hundred iterations, P10/P50/P90 on every output. This
-- migration is not that. It is the thing that decides whether any of it may be
-- shown, and it comes first for the same reason provenance came before the
-- analysis in #65 and the Quality Score gate came before the findings in #68.
--
-- A simulation produces numbers whatever you feed it. Five hundred iterations
-- of a model with no grounding produce a beautifully tight confidence interval
-- around a fiction, and the interval makes it look *more* trustworthy rather
-- than less. The only thing that distinguishes a simulation worth reading from
-- one worth ignoring is a measurement of how wrong it has been, and that
-- measurement has to exist before the first simulated figure reaches a screen
-- — because afterwards there is no moment at which anybody goes back to ask.
--
-- ── the rule ──────────────────────────────────────────────────────────────
--
-- A figure whose provenance is 'simulated' must point at the fidelity
-- measurement that licenses it. Not a flag somebody sets; a foreign key the
-- database requires. Without a measurement there is no row to point at, so a
-- simulated figure cannot be written at all.
--
-- This is the third time this shape has been used here, and deliberately so:
-- provenance made "where did this come from" unforgeable, is_provisional made
-- "how much do we believe it" unforgeable, and this makes "has this model ever
-- been right" unforgeable. Each was a sentence somebody could have written in
-- a narrative and each is a column instead.
--
-- ── measured against what ─────────────────────────────────────────────────
--
-- Three held-out months, per the brief: the model is fitted without them and
-- then asked to predict them, and the error is what it scores on. Held out
-- rather than in-sample, because a model scored on the data it was fitted to
-- is scored on its memory.
--
-- The organisation this ships to has one financial record and no business
-- events. So the honest first answer is 'not_measurable', and the constraint
-- below makes that the *only* answer available: a run cannot record a score
-- without having had the months to earn it.
--
-- Additive: one enum, one table, one nullable column and one check on each of
-- three tables, one flag. No existing row is touched — verified first: there
-- are no rows with provenance 'simulated' anywhere.
-- ═══════════════════════════════════════════════════════════════════════════

create type public.fidelity_status as enum (
  'not_measurable',  -- not enough history to hold three months out
  'measured',        -- fitted, predicted, scored
  'failed'           -- the measurement itself broke
);

comment on type public.fidelity_status is
  'Whether a Twin has ever been checked against reality. ''not_measurable'' is a real answer and the common one early on — it is not a failure.';

create table public.twin_fidelity (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,

  status           public.fidelity_status not null,

  -- Complete months of history that existed when this was attempted, and how
  -- many the method needs. Stored rather than recomputed: a score is a claim
  -- about a moment, and the history behind it grows.
  months_available smallint not null check (months_available >= 0),
  months_required  smallint not null default 3 check (months_required > 0),

  /*
   * 0 to 100, and null unless it was actually measured.
   *
   * Null is not zero. Zero would mean "we checked and it was hopeless", which
   * is a finding; null means "nobody has checked", which is a different thing
   * entirely and the one a reader must not mistake for the other.
   */
  score            smallint check (score is null or score between 0 and 100),

  -- What was compared, and how it was scored. Text rather than enums: the
  -- method will change more often than a migration is worth, and a score whose
  -- method is not recorded beside it cannot be compared with a later one.
  metric           text,
  method           text,
  error_pct        numeric(6,3) check (error_pct is null or error_pct >= 0),
  sample_size      integer check (sample_size is null or sample_size >= 0),

  -- Why there is no score, in words a person can act on.
  reason           text,

  measured_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- A score exists exactly when the status says it was measured.
  constraint measured_carries_a_score
    check ((status = 'measured') = (score is not null)),
  -- And anything else says why not. A run that could not measure and does not
  -- say why leaves somebody to guess, and they will guess "no data" whether or
  -- not that was it.
  constraint anything_else_says_why
    check ((status = 'measured') = (reason is null)),
  /*
   * The one that carries the weight.
   *
   * A score cannot be recorded without the months it was earned on. Without
   * this, a well-meaning backfill or an eager handler could write a fidelity
   * of 90 against one month of data, and every simulated figure in the product
   * would then be licensed by a measurement that measured almost nothing.
   */
  constraint enough_history_to_measure
    check (status <> 'measured' or months_available >= months_required)
);

comment on table public.twin_fidelity is
  'How wrong this business''s Digital Twin has been, measured on months held out of its fitting. A simulated figure must point at one of these rows, so a Twin that has never been checked cannot publish a number.';
comment on column public.twin_fidelity.score is
  'Null means nobody has checked. Zero means somebody checked and it was hopeless. A reader must never mistake the first for the second.';

create index twin_fidelity_org_idx
  on public.twin_fidelity (organisation_id, measured_at desc);

create trigger twin_fidelity_touch
  before update on public.twin_fidelity
  for each row execute function amryn.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- The licence a simulated figure has to carry
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `on delete restrict`, not `set null`. Deleting the measurement that licenses
-- a figure must fail loudly rather than quietly leaving the figure behind with
-- nothing standing behind it — which is the exact state this table exists to
-- make impossible.
alter table public.business_insights
  add column fidelity_id uuid references public.twin_fidelity (id) on delete restrict,
  add constraint simulated_figure_is_licensed
    check (provenance <> 'simulated' or fidelity_id is not null);

alter table public.ai_recommendations
  add column fidelity_id uuid references public.twin_fidelity (id) on delete restrict,
  add constraint simulated_figure_is_licensed
    check (provenance <> 'simulated' or fidelity_id is not null);

alter table public.opportunities
  add column fidelity_id uuid references public.twin_fidelity (id) on delete restrict,
  add constraint simulated_figure_is_licensed
    check (provenance <> 'simulated' or fidelity_id is not null);

comment on column public.business_insights.fidelity_id is
  'The fidelity measurement licensing this figure. Required when provenance is ''simulated'': a simulation nobody has checked may not put a number on a screen.';

create index business_insights_fidelity_idx  on public.business_insights  (fidelity_id) where fidelity_id is not null;
create index ai_recommendations_fidelity_idx on public.ai_recommendations (fidelity_id) where fidelity_id is not null;
create index opportunities_fidelity_idx      on public.opportunities      (fidelity_id) where fidelity_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- Who may see it, and the switch
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.twin_fidelity enable row level security;
alter table public.twin_fidelity force row level security;

create policy twin_fidelity_read on public.twin_fidelity
  for select using (amryn.is_member(organisation_id));

grant select on public.twin_fidelity to authenticated;

create trigger twin_fidelity_refuse_lapsed
  before insert or update on public.twin_fidelity
  for each row execute function amryn.refuse_lapsed_write();

insert into public.feature_flags (key, name, description) values
  ('digital_twin_simulation',
   'Digital Twin simulation',
   'Whether the Twin runs simulations for this organisation. Off until its fidelity has been measured against held-out months — and a simulated figure cannot be written without a measurement to point at regardless, so this switch decides when to try rather than whether the result may be trusted.')
on conflict (key) do nothing;

notify pgrst, 'reload schema';

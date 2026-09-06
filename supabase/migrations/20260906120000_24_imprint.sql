-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 24 — The Amryn™ Imprint®
-- ═══════════════════════════════════════════════════════════════════════════
--
-- What migration 17 called onboarding is now the Imprint: the record of what a
-- business is, taken once and revised for ever after. The rename is not
-- cosmetic. "Onboarding" describes something done *to* a customer that is
-- finished and forgotten; an Imprint is a thing they own, come back to, and
-- which everything the platform says about them is derived from. The word
-- shapes how it gets built.
--
-- ── why a new table rather than a rename ──────────────────────────────────
-- `alter table ... rename to` is one statement and would be wrong. The
-- application is deployed by starting new containers alongside the old ones
-- and retiring the old ones as the new pass their health checks, so for a
-- minute or so both are serving. A rename breaks every request the old
-- containers handle in that window — not with a redirect or a stale page, but
-- with "relation does not exist" on the setup flow, for real customers, with
-- no way to retry until the rollout finishes.
--
-- So this is additive: new tables beside the old, a backfill, and the old ones
-- left in place and untouched. Once every container is serving the new code
-- and the backfill has been confirmed, a later migration removes them — as its
-- own decision, with a backup, rather than as a side effect of this one.
--
-- That does mean the word survives in the database until then. It is worth
-- being exact about that rather than claiming otherwise: `onboarding_progress`
-- and its two functions still exist after this migration and nothing reads
-- them.
--
-- ── the shape, and why it is not the old one ──────────────────────────────
-- Migration 17 kept progress as three text arrays on one row: which steps were
-- completed, which were skipped, and a bag of answers. That works for a wizard
-- and stops working the moment anything needs to ask a question of one layer —
-- which is now everything. A Quality Score has to know what was answered
-- *within* a layer; the analysis has to know which fields are missing and act
-- differently; a screen has to show a person where the gaps are.
--
-- A row per layer answers all three. Arrays of names answer none of them.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The eight Layers
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The order is not arbitrary: each is answerable from what the one before
-- established. You cannot say which site sells which product before the sites
-- exist, and you cannot say what you are trying to achieve before you have
-- said what you sell and to whom. Reordering them produces questions nobody in
-- the room can answer yet, which is how a setup flow gets abandoned halfway.
create type public.imprint_layer as enum (
  'identity',
  'location',
  'offer',
  'customers',
  'operations',
  'commercial',
  'digital',
  'intent'
);

comment on type public.imprint_layer is
  'The eight layers of an Imprint, in the order they are answerable. Mirrored in src/features/imprint/layers.ts.';

-- Answered, deliberately passed over, or not yet reached. Three states rather
-- than a boolean, because "not applicable to us" and "not got to it yet" need
-- different sentences on the review screen and are treated differently by the
-- Quality Score.
create type public.imprint_layer_state as enum ('unanswered', 'answered', 'skipped');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The record
-- ═══════════════════════════════════════════════════════════════════════════

create table public.imprint_records (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,

  -- Where "continue" goes. Advisory: the layer actually resumed at is computed
  -- from what has been answered, so going back to correct one thing does not
  -- rewind the whole Imprint.
  current_layer   public.imprint_layer not null default 'identity',

  /*
   * How complete and how trustworthy this Imprint is, 0 to 100.
   *
   * Null means not yet computed, which is the honest state for an Imprint
   * backfilled from the old record: the score is defined over fields that
   * record did not track, and inventing a number for it would be inventing
   * exactly the kind of figure this platform exists not to invent.
   *
   * Computed in one place — src/features/imprint/quality.ts — and stored here
   * rather than derived in SQL. Two implementations of a score that gates what
   * the platform is willing to say would eventually disagree, and the one that
   * disagreed silently would be this one.
   */
  quality_score   smallint check (quality_score is null or quality_score between 0 and 100),
  scored_at       timestamptz,

  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  -- When the model was first built from the Imprint. Separate from completion:
  -- somebody can answer everything and not press the button.
  initialised_at  timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A score with no time on it cannot be told from a stale one.
  constraint scored_carries_a_time check ((quality_score is null) = (scored_at is null))
);

comment on table public.imprint_records is
  'One Imprint per organisation: where it is up to, how complete it is, and when it was last built into the model. The answers themselves are in imprint_layers.';
comment on column public.imprint_records.quality_score is
  'Zero to a hundred, computed by src/features/imprint/quality.ts and stored. Null means not yet scored — never zero, which would read as a bad Imprint rather than an unmeasured one.';

create trigger imprint_records_touch
  before update on public.imprint_records
  for each row execute function amryn.touch_updated_at();

create table public.imprint_layers (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  layer           public.imprint_layer not null,

  state           public.imprint_layer_state not null default 'unanswered',

  -- What was said that has no table of its own. Kept as a document because the
  -- questions will change and a column per question would mean a migration
  -- every time somebody rewords one.
  answers         jsonb not null default '{}'::jsonb,

  /*
   * Which fields in this layer were left blank.
   *
   * "Gaps, not blocks" is the rule this column exists for. A person who does
   * not know their gross margin should be able to move on and be asked again
   * later — not stopped, and not silently recorded as having answered. Without
   * somewhere to put the gap, the only two options are a required field or a
   * missing answer indistinguishable from an answered one.
   *
   * It is also what the Quality Score reads, and what the analysis will use to
   * say which figure it could not obtain rather than estimating one.
   */
  gaps            text[] not null default '{}',

  answered_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  primary key (organisation_id, layer),

  -- A layer that says it is answered and carries nothing is a layer that will
  -- be scored as complete and read as empty.
  constraint answered_carries_a_time check ((state = 'answered') = (answered_at is not null))
);

comment on table public.imprint_layers is
  'One row per layer per organisation: what was said, what was left blank, and whether the layer was answered, skipped or not yet reached.';
comment on column public.imprint_layers.gaps is
  'Field names left blank in this layer. What makes a gap different from an unanswered layer, and what stops the analysis estimating a figure the customer simply has not given.';

create trigger imprint_layers_touch
  before update on public.imprint_layers
  for each row execute function amryn.touch_updated_at();

-- The primary key leads with organisation_id, so the foreign key is served by
-- it and needs no index of its own. Test 23 checks exactly that.
create index imprint_layers_state_idx
  on public.imprint_layers (organisation_id, state);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Who may read and write it
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.imprint_records enable row level security;
alter table public.imprint_records force row level security;
alter table public.imprint_layers  enable row level security;
alter table public.imprint_layers  force row level security;

-- Every member can see how far the Imprint has got. A colleague who lands on a
-- half-empty Command Centre deserves to know why rather than assume it is
-- broken.
create policy imprint_records_read on public.imprint_records
  for select to authenticated
  using (amryn.is_member(organisation_id));

create policy imprint_records_write on public.imprint_records
  for all to authenticated
  using (amryn.has_permission(organisation_id, 'manage_organisation'))
  with check (amryn.has_permission(organisation_id, 'manage_organisation'));

create policy imprint_layers_read on public.imprint_layers
  for select to authenticated
  using (amryn.is_member(organisation_id));

create policy imprint_layers_write on public.imprint_layers
  for all to authenticated
  using (amryn.has_permission(organisation_id, 'manage_organisation'))
  with check (amryn.has_permission(organisation_id, 'manage_organisation'));

-- ── the lapsed-subscription guard does not reach these, on purpose ────────
--
-- Migration 16 refuses writes to business records while a subscription is
-- lapsed. Both tables here are deliberately exempt, for the reason migration
-- 17 gave for the record it replaced: taking an Imprint is how a trial becomes
-- a customer, and an organisation whose trial ran out midway must be able to
-- finish and then pay. Test 19 asserts the exemption is deliberate by naming
-- them, so the next table added is a failing test rather than a silent gap.

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Opening one, and finishing it
-- ═══════════════════════════════════════════════════════════════════════════

-- Definer, because the first caller is the person who has just created the
-- organisation and the row has to exist before anything can be saved against
-- it. Idempotent, so a refresh or a second tab costs nothing.
create or replace function public.ensure_imprint(p_organisation uuid)
returns public.imprint_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.imprint_records;
begin
  if not amryn.is_member(p_organisation) then
    raise exception 'not a member of that organisation' using errcode = '42501';
  end if;

  insert into public.imprint_records (organisation_id)
  values (p_organisation)
  on conflict (organisation_id) do nothing;

  -- Recorded here rather than by the application, because here is the only
  -- place that knows an Imprint was actually opened rather than merely looked
  -- at. This function is called on every page load; `found` is what tells the
  -- first call from the several thousand after it.
  if found then
    insert into public.audit_logs
      (organisation_id, actor_id, action, entity_type, entity_id, summary)
    values
      (p_organisation, auth.uid(), 'imprint.started', 'organisation',
       p_organisation::text, 'Imprint opened');
  end if;

  -- Every layer gets a row immediately, in the 'unanswered' state. The
  -- alternative — creating rows as layers are answered — means "not started"
  -- and "does not exist" are the same absence, and every reader has to know
  -- the list of layers to tell them apart.
  insert into public.imprint_layers (organisation_id, layer)
  select p_organisation, l
    from unnest(enum_range(null::public.imprint_layer)) as l
  on conflict (organisation_id, layer) do nothing;

  select * into result from public.imprint_records
   where organisation_id = p_organisation;

  return result;
end $$;

comment on function public.ensure_imprint is
  'Opens an Imprint and its eight layer rows. Idempotent, so calling it on every page load costs nothing.';

-- One statement, so that "the layers are answered" and "the model has been
-- built" cannot disagree, and so the audit entry is written in the same
-- transaction as the thing it records.
create or replace function public.complete_imprint(p_organisation uuid)
returns public.imprint_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.imprint_records;
begin
  if not amryn.has_permission(p_organisation, 'manage_organisation') then
    raise exception 'only an administrator can finish the Imprint' using errcode = '42501';
  end if;

  update public.imprint_records
     set completed_at   = coalesce(completed_at, now()),
         initialised_at = coalesce(initialised_at, now()),
         current_layer  = 'intent'
   where organisation_id = p_organisation
  returning * into result;

  if not found then
    raise exception 'that organisation has not started an Imprint' using errcode = 'P0002';
  end if;

  insert into public.audit_logs
    (organisation_id, actor_id, action, entity_type, entity_id, summary)
  values
    (p_organisation, auth.uid(), 'imprint.completed', 'organisation',
     p_organisation::text, 'Imprint completed and the model initialised');

  return result;
end $$;

comment on function public.complete_imprint is
  'Closes an Imprint and records it. One statement, so completion and the audit row cannot disagree.';

-- Same reach as the record they replace: signed-in callers only.
revoke all on function public.ensure_imprint(uuid)   from public, anon;
revoke all on function public.complete_imprint(uuid) from public, anon;
grant execute on function public.ensure_imprint(uuid)   to authenticated;
grant execute on function public.complete_imprint(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Bringing the old record across
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Nobody who has already answered the seven steps should be asked again.
--
-- Six of the old steps map onto a layer. Two of them — objectives and market —
-- map onto the same one, Intent, so it counts as answered only if both were
-- answered and skipped only if both were skipped; anything else is left
-- unanswered, which is the truthful reading of "half of it was done".
--
-- Offer, Customers and Digital are new questions that were never asked, so
-- they start unanswered for everybody. That is not a gap in the backfill; it
-- is the reason the Imprint exists.
--
-- No score is written. The Quality Score is defined over fields the old record
-- did not track, so any number here would be invented — and a made-up
-- completeness figure is precisely the kind of thing that later gets quoted as
-- a measurement.
--
-- ── why this is a function and not eight statements ───────────────────────
-- A backfill is the part of a migration most likely to be wrong and least
-- likely to be noticed, because it runs exactly once, against data the person
-- writing it cannot see, and leaves no failure behind when it silently matches
-- nothing. Written inline it is also untestable by construction: by the time
-- any test runs, the migration has been applied and there is no old record
-- left to bring across.
--
-- As a function it can be called again with fixtures in front of it, which is
-- what supabase/tests/25 does. Every statement is guarded on the layer still
-- being 'unanswered', so calling it a second time — after a customer has
-- answered more — cannot overwrite what they said with what they used to say.
create or replace function amryn.backfill_imprint_from_onboarding()
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $backfill$
declare
  brought integer;
begin
  insert into public.imprint_records (organisation_id, started_at, completed_at, initialised_at, current_layer)
  select
    p.organisation_id,
    p.started_at,
    p.completed_at,
    p.initialised_at,
    'identity'::public.imprint_layer
  from public.onboarding_progress p
  on conflict (organisation_id) do nothing;

  get diagnostics brought = row_count;

  insert into public.imprint_layers (organisation_id, layer)
  select p.organisation_id, l
    from public.onboarding_progress p
   cross join unnest(enum_range(null::public.imprint_layer)) as l
  on conflict (organisation_id, layer) do nothing;

  -- The straightforward four, each old step onto one layer.
  update public.imprint_layers t
     set state       = 'answered',
         answered_at = coalesce(p.completed_at, p.updated_at, now()),
         answers     = coalesce(p.answers -> m.old_step, '{}'::jsonb)
    from public.onboarding_progress p
    join (values
      ('identity',   'identity'),
      ('structure',  'location'),
      ('systems',    'operations'),
      ('data',       'commercial')
    ) as m(old_step, new_layer) on true
   where t.organisation_id = p.organisation_id
     and t.layer = m.new_layer::public.imprint_layer
     and t.state = 'unanswered'
     and m.old_step = any (p.completed_steps);

  update public.imprint_layers t
     set state = 'skipped'
    from public.onboarding_progress p
    join (values
      ('structure',  'location'),
      ('systems',    'operations'),
      ('data',       'commercial')
    ) as m(old_step, new_layer) on true
   where t.organisation_id = p.organisation_id
     and t.layer = m.new_layer::public.imprint_layer
     and t.state = 'unanswered'
     and m.old_step = any (p.skipped_steps);

  -- Intent, which two old steps feed. Answered only if both were answered,
  -- skipped only if both were skipped: "half of it was done" is not either.
  update public.imprint_layers t
     set state       = 'answered',
         answered_at = coalesce(p.completed_at, p.updated_at, now())
    from public.onboarding_progress p
   where t.organisation_id = p.organisation_id
     and t.layer = 'intent'
     and t.state = 'unanswered'
     and 'objectives' = any (p.completed_steps)
     and 'market'     = any (p.completed_steps);

  update public.imprint_layers t
     set state = 'skipped'
    from public.onboarding_progress p
   where t.organisation_id = p.organisation_id
     and t.layer = 'intent'
     and t.state = 'unanswered'
     and 'objectives' = any (p.skipped_steps)
     and 'market'     = any (p.skipped_steps);

  return brought;
end $backfill$;

comment on function amryn.backfill_imprint_from_onboarding is
  'Brings an organisation''s old seven-step record across to its Imprint. Idempotent and non-destructive: only layers still unanswered are touched, so a second call cannot overwrite what a customer has since said.';

revoke all on function amryn.backfill_imprint_from_onboarding() from public, anon, authenticated;

select amryn.backfill_imprint_from_onboarding();

notify pgrst, 'reload schema';

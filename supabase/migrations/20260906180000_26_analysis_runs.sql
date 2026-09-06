-- ═══════════════════════════════════════════════════════════════════════════
-- 26. The analysis run
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Finishing an Imprint has, until now, recorded an audit row and done nothing
-- else. The screens a customer then opens compute what they show inside the
-- request that renders them: a health score over twelve rows, a trend over a
-- year of orders. That is the right shape for a number a page can produce in
-- forty milliseconds and the wrong shape for the thing this platform is
-- actually selling — reading a whole business once, properly, and saying what
-- it found.
--
-- That reading takes minutes rather than milliseconds, so it belongs in the
-- queue built in #61. This migration is the record of one such reading.
--
-- ── why a run is a row and not just a job ─────────────────────────────────
--
-- job_runs already tracks attempts, leases and failures, and none of that is
-- what a customer needs to know. They need to know that their business is
-- being read, roughly how far along it is, what it concluded, and — the part
-- that matters most — how much the platform is willing to stand behind what
-- it concluded. A job row cannot answer the last of those without becoming a
-- domain object in disguise.
--
-- So: job_runs stays infrastructure, analysis_runs is the domain object, and
-- they point at each other. An operator debugging a stuck worker reads one; a
-- customer asking "what happened to my analysis" reads the other.
--
-- ── the gate is stored, not recomputed ────────────────────────────────────
--
-- Below a Quality Score of 70 the analysis marks everything provisional and
-- refuses to discuss expansion. That threshold is a judgement about what the
-- platform may claim, and the score it reads moves — somebody answers three
-- more fields the next morning and it crosses 70.
--
-- Recomputing the gate at read time would therefore change the standing of
-- findings that were produced under the old score, retroactively, with nothing
-- recording that it happened. So the score at the moment of the run, and both
-- decisions taken from it, are frozen onto the row. A finding's caveat is a
-- fact about how it was produced, not a fact about the business today.
--
-- Additive throughout: one enum, one table, three nullable columns and one
-- boolean with a default on each output table, and a function replaced. No
-- data is rewritten, so this needs no backup.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. What state a reading is in
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Deliberately not public.job_status. That enum has 'cancelled', which is a
-- thing an operator does to a queue entry, and no 'superseded', which is what
-- happens to a reading when a newer one lands. The two lifecycles look alike
-- today and would drift the first time either grew a state the other did not
-- want.
create type public.analysis_status as enum (
  'queued',      -- accepted, waiting for a worker
  'running',     -- a worker holds it
  'succeeded',   -- finished, findings written
  'failed',      -- finished, nothing written
  'superseded'   -- a later run for this organisation replaced it
);

comment on type public.analysis_status is
  'The lifecycle of one reading of a business. Separate from job_status: that describes a queue entry, this describes a thing a customer is waiting for.';

create table public.analysis_runs (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,

  -- The queue entry doing the work. Null until enqueued, and null forever for
  -- a run recorded by something other than the worker.
  job_id           uuid references public.job_runs (id) on delete set null,

  -- What asked for this reading. Text rather than an enum because the set will
  -- grow with every trigger added, and a migration per trigger is a tax on
  -- exactly the experiments this is for.
  trigger          text not null check (trigger <> ''),

  status           public.analysis_status not null default 'queued',

  /*
   * The Quality Score as it stood when the run started, and the two decisions
   * taken from it.
   *
   * Null score means the Imprint had never been scored — which is its own
   * answer, and is treated as failing the gate rather than passing it. An
   * unscored Imprint is one the platform cannot see into, and the safe reading
   * of "I do not know how complete this is" is not "complete enough".
   */
  quality_score        smallint check (quality_score is null or quality_score between 0 and 100),
  is_provisional       boolean not null,
  expansion_suppressed boolean not null,

  started_at       timestamptz,
  finished_at      timestamptz,
  duration_ms      integer check (duration_ms is null or duration_ms >= 0),

  -- What it produced. Counts rather than a join, so a list of past runs costs
  -- one query.
  insight_count        integer not null default 0 check (insight_count        >= 0),
  recommendation_count integer not null default 0 check (recommendation_count >= 0),
  opportunity_count    integer not null default 0 check (opportunity_count    >= 0),

  /*
   * What the analysis wanted and did not have.
   *
   * The brief's rule is that the model may never fill a numeric gap from
   * memory. Somewhere has to hold what was missing, or "we did not have it"
   * and "it did not matter" become the same silence — and the second is what a
   * reader assumes.
   */
  gaps             jsonb not null default '[]'::jsonb,

  error            text,

  requested_by     uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- A run that has finished says when, and one that has not says nothing.
  constraint finished_carries_a_time
    check ((status in ('succeeded','failed','superseded')) = (finished_at is not null)),
  -- Succeeding without an error, failing with one. A failed run whose error is
  -- null is a run nobody can act on.
  constraint outcome_and_error_agree
    check ((status = 'failed') = (error is not null)),
  -- Below the threshold, both consequences follow. Above it, neither does.
  -- Written as a constraint because the alternative is trusting that every
  -- writer applied the same rule, and the one that did not would be silent.
  constraint gate_is_applied_consistently
    check (is_provisional = expansion_suppressed)
);

comment on table public.analysis_runs is
  'One reading of a business, from a completed Imprint. Holds the Quality Score gate as it stood at the time, because a finding''s caveat is a fact about how it was produced rather than about the business today.';
comment on column public.analysis_runs.gaps is
  'What the analysis needed and did not have, so that "missing" and "irrelevant" stay distinguishable.';

create index analysis_runs_org_idx
  on public.analysis_runs (organisation_id, created_at desc);

-- Both other foreign keys get one too. Migration 22 covered every key in the
-- schema for the same reason: without an index, deleting a parent scans this
-- table to find the children, and the scan is invisible until the table is
-- large. Partial, because both columns are usually null — a run recorded
-- outside the worker has no job, and a scheduled one has no requester.
create index analysis_runs_job_idx
  on public.analysis_runs (job_id) where job_id is not null;
create index analysis_runs_requested_by_idx
  on public.analysis_runs (requested_by) where requested_by is not null;

-- At most one reading in flight per organisation. A second is not an error —
-- it waits, or supersedes — but two running at once would write two sets of
-- findings over each other and leave whichever finished last.
create unique index analysis_runs_one_in_flight
  on public.analysis_runs (organisation_id)
  where status in ('queued','running');

create trigger analysis_runs_touch
  before update on public.analysis_runs
  for each row execute function amryn.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Which reading produced a finding, and whether to trust it yet
-- ═══════════════════════════════════════════════════════════════════════════
--
-- analysis_run_id is the join. is_provisional is the same fact copied onto the
-- row, and the duplication is deliberate — it is the argument from #65,
-- applied again.
--
-- A caveat that lives only on a parent row survives exactly as long as nobody
-- quotes the child. The moment a figure is lifted into a board pack, an email
-- or a screenshot, the join is gone and the number reads as settled. The
-- provenance column exists because a sentence in the narrative could not be
-- filtered on; this exists because a caveat one join away cannot be either.
--
-- Existing rows are not provisional, which is true: they were produced before
-- any gate existed, by engines running inside a request, and were never
-- claimed to be the output of a gated reading.
alter table public.business_insights
  add column analysis_run_id uuid references public.analysis_runs (id) on delete set null,
  add column is_provisional  boolean not null default false;

alter table public.ai_recommendations
  add column analysis_run_id uuid references public.analysis_runs (id) on delete set null,
  add column is_provisional  boolean not null default false;

alter table public.opportunities
  add column analysis_run_id uuid references public.analysis_runs (id) on delete set null,
  add column is_provisional  boolean not null default false;

comment on column public.business_insights.is_provisional is
  'Produced by a run whose Imprint scored below 70. Copied from the run rather than joined, because a caveat one join away is lost the moment the figure is quoted onward.';

create index business_insights_run_idx   on public.business_insights   (analysis_run_id) where analysis_run_id is not null;
create index ai_recommendations_run_idx  on public.ai_recommendations  (analysis_run_id) where analysis_run_id is not null;
create index opportunities_run_idx       on public.opportunities       (analysis_run_id) where analysis_run_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Who may see a run
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Readable by the organisation, writable by nobody through PostgREST. The
-- worker holds a direct connection as the owner and does not pass through
-- these policies; a browser has no business creating or editing a reading.
alter table public.analysis_runs enable row level security;
alter table public.analysis_runs force row level security;

create policy analysis_runs_read on public.analysis_runs
  for select using (amryn.is_member(organisation_id));

grant select on public.analysis_runs to authenticated;

-- The lapsed-account guard, attached the same way as every other org-scoped
-- table. Test 19 iterates the catalogue and fails on anything unguarded, so
-- omitting this would be caught — but being caught by a test is not the same
-- as being right, and a lapsed account should not accumulate readings.
create trigger analysis_runs_refuse_lapsed
  before insert or update on public.analysis_runs
  for each row execute function amryn.refuse_lapsed_write();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The switch
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.feature_flags (key, name, description) values
  ('imprint_analysis',
   'Analysis on Imprint completion',
   'Whether finishing an Imprint queues a full reading of the business. Off means completion is recorded and nothing is queued, so no backlog accumulates for an organisation the analysis has never been tried on.')
on conflict (key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Completion queues the reading
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Replaced rather than added beside, because the enqueue has to happen in the
-- same transaction as the completion. Two statements from the application
-- would leave a window where an Imprint is complete and nothing was queued —
-- and that window is invisible, because the symptom is an analysis that never
-- starts for a customer who did everything right.
--
-- The flag is read here rather than at claim time. claim_jobs already gates on
-- background_jobs and would refuse the work anyway, but a queue filling with
-- jobs nobody intends to run is a queue whose depth stops meaning anything.
create or replace function public.complete_imprint(p_organisation uuid)
returns public.imprint_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result     public.imprint_records;
  -- Prefixed, because `job_id` is also a column on the table this updates and
  -- plpgsql resolves the column first: `set job_id = job_id` would have been a
  -- no-op that looked exactly like a link being written.
  v_run_id   uuid;
  v_job_id   uuid;
  gate       boolean;
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

  if amryn.feature_enabled(p_organisation, 'imprint_analysis') then
    -- An unscored Imprint fails the gate. See the column comment: not knowing
    -- how complete something is cannot be treated as complete enough.
    gate := coalesce(result.quality_score, 0) < 70;

    -- A reading already in flight keeps its place. The partial unique index
    -- would refuse a second one, and refusing here with a clear outcome beats
    -- raising a constraint violation at somebody pressing "finish" twice.
    if not exists (
      select 1 from public.analysis_runs
       where organisation_id = p_organisation
         and status in ('queued','running')
    ) then
      insert into public.analysis_runs
        (organisation_id, trigger, status, quality_score,
         is_provisional, expansion_suppressed, requested_by)
      values
        (p_organisation, 'imprint.completed', 'queued', result.quality_score,
         gate, gate, auth.uid())
      returning id into v_run_id;

      insert into public.job_runs
        (organisation_id, kind, payload, singleton_key, max_attempts, requested_by)
      values
        (p_organisation, 'analysis.run',
         jsonb_build_object('analysis_run_id', v_run_id),
         'analysis:' || p_organisation::text,
         2,
         auth.uid())
      returning id into v_job_id;

      update public.analysis_runs set job_id = v_job_id where id = v_run_id;
    end if;
  end if;

  return result;
end $$;

comment on function public.complete_imprint is
  'Closes an Imprint, records it, and queues the reading — one transaction, so a completed Imprint with nothing queued is not a state that can exist.';

revoke all on function public.complete_imprint(uuid) from public, anon;
grant execute on function public.complete_imprint(uuid) to authenticated;

notify pgrst, 'reload schema';

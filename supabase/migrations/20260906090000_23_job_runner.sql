-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 23 — The job runner, and feature flags
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Everything this platform computes, it computes inside the request that
-- renders it. That is the right answer for a health score over twelve rows and
-- the wrong answer for everything coming next: an analysis measured in minutes,
-- a simulation run five hundred times, a brief that has to be written at six in
-- the morning whether or not anybody has opened a page. None of those fit in an
-- HTTP request, and a server action that tried would be killed by a proxy long
-- before it finished.
--
-- So: a queue in the database, and a worker that drains it. This migration is
-- the queue. The worker is src/worker/main.ts.
--
-- ── why the database and not a queue service ──────────────────────────────
-- A separate broker would mean a second store that can disagree with this one.
-- The thing a job is *about* lives in PostgreSQL — the organisation, the
-- figures, the row it will write — and a job that has been acknowledged by a
-- broker but whose transaction rolled back is a job that ran against a state
-- that never existed. Keeping the queue in the same database makes enqueueing
-- and the change that justified it one transaction, which is the only version
-- of this that is correct rather than usually correct.
--
-- `for update skip locked` is what makes that safe with more than one worker.
-- It has been in PostgreSQL since 9.5 and is exactly the primitive a broker
-- would be reimplementing.
--
-- ── what is deliberately not here ─────────────────────────────────────────
-- There is no customer-facing way to enqueue a job. Nothing in the application
-- creates one yet, and an entry point with no caller is an entry point whose
-- permission check nobody has ever exercised. The first thing that genuinely
-- needs to enqueue from a page brings its own function, with the permission
-- that job actually requires. Until then the only writer is the worker, over a
-- direct connection, as the owner.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The queue
-- ═══════════════════════════════════════════════════════════════════════════

create type public.job_status as enum (
  'queued', 'running', 'succeeded', 'failed', 'cancelled'
);

create table public.job_runs (
  id               uuid primary key default gen_random_uuid(),

  -- Null is a platform job: pruning, sweeping, anything that belongs to the
  -- installation rather than to a customer. Everything else is a tenant's, and
  -- is subject to that tenant's feature flag below.
  organisation_id  uuid references public.organisations (id) on delete cascade,

  -- Which handler runs it. Matched against the registry in
  -- src/lib/jobs/registry.ts; a kind with no handler fails loudly rather than
  -- sitting in the queue looking healthy.
  kind             text not null check (kind <> ''),
  payload          jsonb not null default '{}'::jsonb,

  status           public.job_status not null default 'queued',
  -- Lower runs first. A default rather than a scale, so that "ahead of the
  -- ordinary work" is expressible without deciding today what the scale means.
  priority         integer not null default 100,
  -- The earliest it may run. Backoff sets this forward; a schedule sets it to
  -- the top of the hour it belongs to.
  run_at           timestamptz not null default now(),

  -- Counted on *claim*, not on completion. A job that reliably kills the
  -- worker process would otherwise never record an attempt and would be picked
  -- up for ever by whichever worker started next.
  attempts         integer not null default 0 check (attempts >= 0),
  max_attempts     integer not null default 3 check (max_attempts >= 1),

  -- ── the two ways of saying "not twice" ─────────────────────────────────
  -- They are different questions and one column cannot answer both.
  --
  -- dedupe_key is once, ever: the nightly tick for the 6th of September is one
  -- job whether four workers noticed it was due or one did. Unique across
  -- every row regardless of status, so a succeeded slot is never re-enqueued.
  --
  -- singleton_key is once, at a time: one analysis per organisation in flight,
  -- and another may be queued the moment that one finishes. Unique only while
  -- the job is queued or running.
  dedupe_key       text,
  singleton_key    text,

  -- ── the lease ──────────────────────────────────────────────────────────
  -- A worker that dies mid-job cannot tell anybody. Without a lease its job
  -- stays 'running' for ever and the work is simply lost. With one, the job
  -- becomes claimable again the moment the lease lapses, and the attempt it
  -- consumed is already recorded.
  worker_id        text,
  lease_until      timestamptz,

  started_at       timestamptz,
  finished_at      timestamptz,
  duration_ms      integer check (duration_ms is null or duration_ms >= 0),

  result           jsonb,
  error            text,

  -- Who asked for it, where a person did. Null for a schedule.
  requested_by     uuid references auth.users (id) on delete set null,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- One-directional on purpose: worker_id and lease_until are kept after the
  -- job ends, because "which worker was holding this when it failed" is the
  -- first question anybody asks and clearing it destroys the answer.
  constraint running_holds_a_lease check (
    status <> 'running' or (worker_id is not null and lease_until is not null)
  ),
  constraint finished_has_a_time check (
    (status in ('succeeded', 'failed', 'cancelled')) = (finished_at is not null)
  ),
  constraint succeeded_carries_no_error check (
    status <> 'succeeded' or error is null
  )
);

comment on table public.job_runs is
  'Work that does not fit in a request. One row per attempt to run something; the worker in src/worker/main.ts claims, runs and closes them.';
comment on column public.job_runs.organisation_id is
  'Null for platform housekeeping. Where set, the job runs only if that organisation has the background_jobs flag enabled.';
comment on column public.job_runs.dedupe_key is
  'Once, ever. A scheduled slot uses it so four workers noticing the same due time create one job.';
comment on column public.job_runs.singleton_key is
  'Once, at a time. Unique only while queued or running, so the next one may be queued as soon as this finishes.';
comment on column public.job_runs.attempts is
  'Counted on claim, not on completion, so a job that kills the worker still consumes an attempt.';

create trigger job_runs_touch
  before update on public.job_runs
  for each row execute function amryn.touch_updated_at();

-- ── indexes ───────────────────────────────────────────────────────────────
--
-- The two uniques are the deduplication rules above, expressed where they
-- cannot be got round.
create unique index job_runs_dedupe_key
  on public.job_runs (dedupe_key)
  where dedupe_key is not null;

create unique index job_runs_singleton_key
  on public.job_runs (singleton_key)
  where singleton_key is not null and status in ('queued', 'running');

-- What the claim query reads, in the order it reads it. Partial, because the
-- rows it must never look at are the overwhelming majority once the table has
-- any history.
create index job_runs_claimable_idx
  on public.job_runs (priority, run_at)
  where status = 'queued';

-- Expired leases, for the same reason.
create index job_runs_lease_idx
  on public.job_runs (lease_until)
  where status = 'running';

-- Both foreign keys, prefix-first, as test 23 requires. The organisation index
-- carries created_at as well because every reading of this table by hand is
-- "what has this customer been running lately".
create index job_runs_org_idx on public.job_runs (organisation_id, created_at desc);
create index job_runs_requested_by_idx on public.job_runs (requested_by);

-- ── row level security ────────────────────────────────────────────────────
--
-- Read only, and only your own. The worker does not come through here: it
-- holds a direct connection as the owner, which is also why there is no write
-- policy for anybody. Nothing that reaches PostgREST may change this table.
alter table public.job_runs enable row level security;
alter table public.job_runs force row level security;

create policy job_runs_read on public.job_runs
  for select to authenticated
  using (organisation_id is not null and amryn.is_member(organisation_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Feature flags
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Not a second entitlement system. An entitlement answers "has this company
-- bought it?" and is a property of the tier; a flag answers "is this finished
-- enough to be switched on for this company?" and is a property of the
-- rollout. Conflating them means either selling something unfinished or
-- shipping a rollout control that a plan change silently rewrites.
--
-- Off is the absence of a row, so a flag is off for every organisation the
-- moment it is registered, including ones created afterwards. There is no way
-- to write a default of true, which is the point.

create table public.feature_flags (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name        text not null,
  description text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.feature_flags is
  'The catalogue of rollout switches. Registering one turns it on for nobody; organisation_feature_flags is what enables it, one organisation at a time.';

create trigger feature_flags_touch
  before update on public.feature_flags
  for each row execute function amryn.touch_updated_at();

create table public.organisation_feature_flags (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  flag_key        text not null references public.feature_flags (key) on delete cascade,
  enabled         boolean not null default false,
  -- Why it was turned on, for the person reading this in six months wondering
  -- whether it is safe to turn on everywhere.
  note            text,
  enabled_by      uuid references auth.users (id) on delete set null,
  enabled_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (organisation_id, flag_key)
);

comment on table public.organisation_feature_flags is
  'Which organisations have which rollout switch on. Absent means off, which is why new behaviour reaches nobody until somebody names an organisation.';

create trigger organisation_feature_flags_touch
  before update on public.organisation_feature_flags
  for each row execute function amryn.touch_updated_at();

-- flag_key is the second column of the primary key, so the key's own foreign
-- constraint has no index serving it. Test 23 catches exactly this.
create index organisation_feature_flags_flag_idx
  on public.organisation_feature_flags (flag_key);
create index organisation_feature_flags_enabled_by_idx
  on public.organisation_feature_flags (enabled_by);

alter table public.feature_flags enable row level security;
alter table public.feature_flags force row level security;

-- The catalogue is readable by anybody signed in: naming the switches is not a
-- disclosure, and a support conversation goes badly when neither side can see
-- the list.
create policy feature_flags_read on public.feature_flags
  for select to authenticated using (true);

alter table public.organisation_feature_flags enable row level security;
alter table public.organisation_feature_flags force row level security;

-- Read your own. No write policy: a rollout switch a customer can set is not a
-- rollout switch. It is turned on over a direct connection, by us.
create policy organisation_feature_flags_read on public.organisation_feature_flags
  for select to authenticated
  using (amryn.is_member(organisation_id));

-- ── resolving one ─────────────────────────────────────────────────────────
--
-- Definer so that a caller who cannot read the tables still gets an answer,
-- and stable so a policy or a query calling it repeatedly evaluates it once.
create or replace function amryn.feature_enabled(org uuid, key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select f.enabled
       from public.organisation_feature_flags f
      where f.organisation_id = org and f.flag_key = key),
    false)
$$;

comment on function amryn.feature_enabled is
  'Whether a rollout switch is on for one organisation. False for an unregistered flag, an organisation with no row, and null input — off is always the answer that needs no explanation.';

-- What the application reads, shaped like organisation_entitlements so the two
-- are read the same way. The tenant filter is the underlying policy's, not
-- restated here.
create view public.organisation_features
with (security_invoker = true)
as
select
  o.organisation_id,
  c.key      as flag_key,
  c.name,
  c.description,
  coalesce(o.enabled, false) as enabled,
  o.enabled_at
from public.organisation_feature_flags o
join public.feature_flags c on c.key = o.flag_key;

comment on view public.organisation_features is
  'The rollout switches an organisation has a row for, resolved against the catalogue. A flag absent from this view is off.';

grant select on public.organisation_features to authenticated;

-- ── the one flag this migration ships ─────────────────────────────────────
--
-- Registered because it is used, immediately, by the claim function below —
-- not because a later phase might want it. A flag nothing reads is a comment
-- with a table behind it.
insert into public.feature_flags (key, name, description) values
  ('background_jobs',
   'Background processing',
   'Whether work queued for this organisation is picked up by the worker. Off means jobs are recorded and wait, so switching it on drains the backlog rather than losing it.');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. What the worker calls
-- ═══════════════════════════════════════════════════════════════════════════
--
-- All in `amryn`, which PostgREST does not expose, and revoked from every
-- browser-reachable role besides. The worker holds a direct connection as the
-- owner, so it needs no grant at all — these are definer functions only so
-- that the day something else is allowed to call one, the decision is a grant
-- rather than a rewrite.

-- ── claiming ──────────────────────────────────────────────────────────────
--
-- One statement. Selecting a batch and then updating it would let two workers
-- select the same rows in the gap between the two, which is the entire failure
-- this exists to prevent: `for update skip locked` inside the same statement
-- means the second worker steps over rows the first has taken rather than
-- waiting for them or duplicating them.
--
-- A job whose lease has lapsed is claimable again on the same terms as a new
-- one. That is the whole recovery story for a worker that was killed: no
-- reaper, no timeout thread, no separate process that has to be running for
-- the system to heal.
create or replace function amryn.claim_jobs(
  p_worker text,
  p_limit  integer  default 1,
  p_lease  interval default interval '5 minutes'
)
returns setof public.job_runs
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(trim(p_worker), '') = '' then
    raise exception 'a worker must identify itself' using errcode = '22023';
  end if;

  return query
  with claimable as (
    select j.id
      from public.job_runs j
     where j.attempts < j.max_attempts
       and (
         (j.status = 'queued'  and j.run_at <= now())
         or
         -- Abandoned by a worker that stopped saying it was alive.
         (j.status = 'running' and j.lease_until < now())
       )
       -- A tenant's work waits until that tenant is switched on. It is not
       -- discarded: the row stays queued, so enabling the flag later runs the
       -- backlog rather than losing it.
       and (
         j.organisation_id is null
         or amryn.feature_enabled(j.organisation_id, 'background_jobs')
       )
     order by j.priority, j.run_at
     limit greatest(coalesce(p_limit, 1), 0)
     for update skip locked
  )
  update public.job_runs j
     set status      = 'running',
         attempts    = j.attempts + 1,
         worker_id   = p_worker,
         lease_until = now() + p_lease,
         started_at  = coalesce(j.started_at, now())
    from claimable c
   where j.id = c.id
  returning j.*;
end $$;

comment on function amryn.claim_jobs is
  'Takes up to p_limit runnable jobs for one worker and marks them running under a lease. Skips rows another worker holds; reclaims rows whose lease lapsed.';

-- ── staying alive ─────────────────────────────────────────────────────────
--
-- Returns false when the job is no longer this worker's — the lease lapsed and
-- somebody else took it. The worker is expected to stop rather than finish and
-- write over the other one's result, which is the only way two workers running
-- the same job produces a wrong answer rather than a wasted one.
create or replace function amryn.heartbeat_job(
  p_id     uuid,
  p_worker text,
  p_lease  interval default interval '5 minutes'
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  held boolean;
begin
  update public.job_runs
     set lease_until = now() + p_lease
   where id = p_id
     and status = 'running'
     and worker_id = p_worker
     and lease_until >= now();

  get diagnostics held = row_count;
  return held;
end $$;

comment on function amryn.heartbeat_job is
  'Extends a running job''s lease. False means the job was reclaimed by another worker and this one should abandon it.';

-- ── finishing ─────────────────────────────────────────────────────────────
create or replace function amryn.complete_job(
  p_id     uuid,
  p_result jsonb default '{}'::jsonb
)
returns public.job_runs
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  finished public.job_runs;
begin
  update public.job_runs
     set status      = 'succeeded',
         finished_at = now(),
         duration_ms = greatest(
           0,
           (extract(epoch from (now() - coalesce(started_at, now()))) * 1000)::integer),
         result      = coalesce(p_result, '{}'::jsonb),
         error       = null
   where id = p_id
     and status = 'running'
  returning * into finished;

  if not found then
    raise exception 'job % is not running and cannot be completed', p_id
      using errcode = 'P0002';
  end if;

  return finished;
end $$;

comment on function amryn.complete_job is
  'Closes a running job as succeeded. Refuses a job that is not running, so a worker whose lease lapsed cannot overwrite the outcome of the worker that took over.';

-- ── failing, and deciding whether to try again ────────────────────────────
--
-- The delay is the worker's to choose and the decision is not. A worker that
-- has just crashed on a poison payload is the last thing that should be
-- deciding whether to run it again — attempts and max_attempts are columns
-- precisely so that answer is the database's.
--
-- A null p_retry_in means the worker has established there is no point: an
-- unknown kind, a payload that will never parse. Those fail terminally on the
-- first attempt rather than three times.
create or replace function amryn.fail_job(
  p_id       uuid,
  p_error    text,
  p_retry_in interval default null
)
returns public.job_runs
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.job_runs;
  finished public.job_runs;
begin
  select * into existing from public.job_runs where id = p_id and status = 'running';
  if not found then
    raise exception 'job % is not running and cannot be failed', p_id
      using errcode = 'P0002';
  end if;

  if p_retry_in is not null and existing.attempts < existing.max_attempts then
    update public.job_runs
       set status      = 'queued',
           run_at      = now() + p_retry_in,
           error       = p_error,
           finished_at = null
     where id = p_id
    returning * into finished;
  else
    update public.job_runs
       set status      = 'failed',
           finished_at = now(),
           duration_ms = greatest(
             0,
             (extract(epoch from (now() - coalesce(started_at, now()))) * 1000)::integer),
           error       = p_error
     where id = p_id
    returning * into finished;
  end if;

  return finished;
end $$;

comment on function amryn.fail_job is
  'Records a failure and either requeues with the delay the worker asked for or gives up, depending on attempts against max_attempts. A null delay gives up immediately.';

-- ── housekeeping ──────────────────────────────────────────────────────────
--
-- Two jobs the queue has to do for itself.
--
-- The first is the case the lease alone does not cover: a job that has used
-- every attempt and was abandoned mid-run is not claimable and never will be,
-- so without this it stays 'running' for ever and reads as work in progress.
--
-- The second is that a queue nobody empties becomes the largest table in the
-- database. Failures are kept whatever their age — they are the only record of
-- something having gone wrong, and the retention that matters is the one on
-- the things that went right.
create or replace function amryn.sweep_jobs(p_retain interval default interval '30 days')
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  abandoned integer;
  removed   integer;
begin
  update public.job_runs
     set status      = 'failed',
         finished_at = now(),
         error       = coalesce(error, 'abandoned: the worker holding this stopped and no attempts remained')
   where status = 'running'
     and lease_until < now()
     and attempts >= max_attempts;
  get diagnostics abandoned = row_count;

  delete from public.job_runs
   where status in ('succeeded', 'cancelled')
     and finished_at < now() - p_retain;
  get diagnostics removed = row_count;

  return jsonb_build_object('abandoned', abandoned, 'removed', removed);
end $$;

comment on function amryn.sweep_jobs is
  'Closes runs abandoned with no attempts left, and deletes succeeded runs past the retention window. Failures are never deleted.';

-- Nothing browser-reachable calls any of these.
revoke all on function amryn.claim_jobs(text, integer, interval)     from public, anon, authenticated;
revoke all on function amryn.heartbeat_job(uuid, text, interval)     from public, anon, authenticated;
revoke all on function amryn.complete_job(uuid, jsonb)               from public, anon, authenticated;
revoke all on function amryn.fail_job(uuid, text, interval)          from public, anon, authenticated;
revoke all on function amryn.sweep_jobs(interval)                    from public, anon, authenticated;
revoke all on function amryn.feature_enabled(uuid, text)             from public, anon;
grant execute on function amryn.feature_enabled(uuid, text)          to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The lapsed-subscription guard
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Migration 16 attached its guard by iterating the catalogue as it stood at
-- that moment, so every table added since carries it only if somebody says so.
-- Test 19 asserts that every table with an organisation_id is either guarded
-- or named on its exemption list, which is what turns "somebody remembered"
-- into a failing test.
--
-- Both of these are guarded rather than exempt. Neither is reachable from a
-- browser today — job_runs has no write policy and the flag table has none
-- either — so the trigger fires for nobody, and that is exactly why it should
-- be there before something is allowed to write to them. The worker is
-- unaffected: it holds no JWT, and the guard lets an unclaimed caller through
-- precisely so that scheduled work and payments keep running.
create trigger zz_subscription_job_runs
  before insert or update or delete on public.job_runs
  for each row execute function amryn.refuse_lapsed_write();

create trigger zz_subscription_organisation_feature_flags
  before insert or update or delete on public.organisation_feature_flags
  for each row execute function amryn.refuse_lapsed_write();

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 33. The worker says it is alive
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Phase 7 is production: monitoring, error tracking, backups, rate limits,
-- cost controls. This is the monitoring gap that cost an evening.
--
-- The worker was down twice for a combined thirty-five minutes and the only
-- reason anybody knew was that somebody happened to open the deployment
-- dashboard. /api/health answered "ok" throughout, because it checks the web
-- service and the database and has never had anything to say about the worker.
-- Every schedule stopped — the nightly Twin run, the morning brief, the sweep,
-- the rate-limit prune — and the product reported itself healthy.
--
-- ── why a heartbeat rather than reading job_runs ──────────────────────────
--
-- The obvious check is "when did a job last finish?", and it is wrong. This
-- queue is quiet by design: the prune is hourly, the sweep and both nightly
-- ticks are daily. Between 03:31 and 20:00 a perfectly healthy worker touches
-- nothing, so a silence-based check either alerts every night or is set so
-- loose it would have missed tonight entirely.
--
-- A heartbeat separates "nothing to do" from "nobody to do it". The worker
-- writes on every poll whether or not it claimed anything, so the reading is
-- unambiguous: fresh means alive, stale means gone, and the threshold can be
-- tight because the poll is five seconds.
--
-- ── one row per worker, not one per beat ──────────────────────────────────
--
-- Upserted on the worker's own id. A row per beat would be seventeen thousand
-- rows a day per worker to answer a question about the newest one, and the
-- pruning job would then need pruning.
--
-- Dead workers are left rather than deleted. A row saying a worker was last
-- seen at 19:31 is the record of an outage, and the check reads the freshest
-- one — so an old row is evidence, not noise.
--
-- Additive: one table. Nothing existing is altered.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.worker_heartbeats (
  -- The worker's own id: host, pid and a random suffix. Not a uuid, because
  -- it has to be readable in a log line beside the beat it explains.
  worker_id       text primary key check (worker_id <> ''),

  last_seen_at    timestamptz not null default now(),
  started_at      timestamptz not null default now(),

  -- What it believes it can run. A worker beating happily with a stale handler
  -- list is a deploy that did not take, which looks identical to a healthy one
  -- from every other angle.
  handlers        text[] not null default '{}',

  -- How many jobs it had in flight when it last beat. Zero is the usual and
  -- correct answer on this queue; it is here so a worker wedged on one job
  -- looks different from an idle one.
  in_flight       integer not null default 0 check (in_flight >= 0),

  /*
   * The commit the worker is running.
   *
   * Two services deploy from one image, and they can end up on different
   * commits when one build fails — which is invisible until a handler the web
   * service expects is not there. Null when the deployment does not say.
   */
  revision        text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint started_before_seen check (started_at <= last_seen_at)
);

comment on column public.worker_heartbeats.handlers is
  'What the worker believes it can run. A fresh beat carrying a stale handler list is a deploy that did not take, which looks healthy from every other angle.';

create index worker_heartbeats_freshest
  on public.worker_heartbeats (last_seen_at desc);

create trigger worker_heartbeats_touch
  before update on public.worker_heartbeats
  for each row execute function amryn.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- Who may see one
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Nobody, through PostgREST. This is not a tenant's data — it is the
-- platform's own plumbing, and it names hosts and process ids. The worker
-- writes it over a direct connection as the owner; the diagnostics page reads
-- it the same way, which is how every other operator-only check here works.
--
-- RLS is enabled with no policy at all, which is the strongest available
-- statement: not "members only", but "no session, ever".

alter table public.worker_heartbeats enable row level security;
alter table public.worker_heartbeats force  row level security;

comment on table public.worker_heartbeats is
  'One row per worker process, upserted on every poll. Separates "nothing to do" from "nobody to do it". RLS is on with no policy: this is platform plumbing naming hosts and pids, readable only over a direct connection.';

-- Revoked explicitly, rather than relied on being absent.
--
-- Migration 09 sets default privileges that grant select, insert, update and
-- delete to `authenticated` on every new table in this schema — so "we simply
-- did not grant anything" is not true here and never was. Without this revoke
-- the only thing standing between a signed-in caller and this table is the
-- absence of a policy, which protects it but for a reason nobody reading this
-- file would see.
--
-- With both, a session is refused at the privilege check and again at the
-- policy check, and neither depends on somebody remembering migration 09.
revoke all on public.worker_heartbeats from authenticated, anon;

notify pgrst, 'reload schema';

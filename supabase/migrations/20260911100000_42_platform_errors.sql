-- ═══════════════════════════════════════════════════════════════════════════
-- 42. Errors, somewhere somebody will see them
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Phase 7's last open item. Thirty-one places in this codebase call
-- console.error, thirty-nine go through ourFault(), and every one of them
-- writes to a stream nobody reads — which this project has already learned the
-- cost of twice. The worker was down for thirty-five minutes and the evidence
-- was in a log; mail stopped sending and the evidence was in a log. Both were
-- found by somebody happening to look.
--
-- ── deduplicated, which is what makes it readable and what bounds it ─────
--
-- One row per distinct problem, not per occurrence. A handler failing in a
-- loop would otherwise write thousands of rows to say one thing, and the
-- pruning job would then need pruning.
--
-- The fingerprint is the scope plus the *shape* of the message — identifiers,
-- addresses and numbers replaced — so "could not reach 10.0.0.4" and "could
-- not reach 10.0.0.9" are one problem seen twice. That is what makes the
-- occurrence count mean something: without it the count never rises above one
-- and the only number that distinguishes a blip from a flood is always 1.
--
-- It also bounds the table without a retention job. Rows can only appear as
-- fast as *distinct* failures do, which is dozens over a lifetime rather than
-- millions.
--
-- ── why not an external service ──────────────────────────────────────────
--
-- Sentry and its neighbours would do this well, and would mean every error
-- message this platform produces — which is where connection strings, tokens
-- and customers' addresses end up — leaving for a third party. That is a
-- processor to declare, a jurisdiction to name, and a bill. The same trade as
-- character recognition, decided the same way.
--
-- What it costs to keep it here, stated plainly: if the database is unreachable
-- or the process dies before the write lands, nothing is recorded. An external
-- collector is outside the failure it is reporting on and this is not. That is
-- a real limitation and the right one to accept first.
--
-- ── nobody reads this through a session ─────────────────────────────────
--
-- Same treatment as worker_heartbeats and backups: row level security on with
-- no policy at all, plus the explicit revoke migration 09's default grants
-- make necessary. These messages name hosts, file paths and the internals of
-- other tenants' failures.
--
-- Additive: one table.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.platform_errors (
  -- The scope and the shape of the message. Not a surrogate key: the identity
  -- of a problem *is* what makes two occurrences the same one.
  fingerprint     text primary key check (fingerprint <> ''),

  scope           text not null check (scope <> ''),

  /*
   * The most recent message, scrubbed.
   *
   * Scrubbed before it arrives, by src/lib/errors/fingerprint.ts — connection
   * strings reduced to their host, tokens removed, addresses removed. An error
   * message is the single most reliable place a secret ends up, and this table
   * is read by an operator.
   */
  message         text not null,

  occurrences     integer not null default 1 check (occurrences > 0),
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),

  -- 'web' or 'worker'. The same failure in both is two different problems to
  -- go and look at, and knowing which halves the search.
  service         text not null default '' check (service in ('', 'web', 'worker')),

  -- The build it happened on, so "is this still happening after the fix?" has
  -- an answer that is not a guess.
  revision        text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.platform_errors is
  'One row per distinct failure, not per occurrence. Messages are scrubbed before they arrive. RLS on with no policy: platform plumbing, readable only over a direct connection.';

comment on column public.platform_errors.fingerprint is
  'Scope plus the shape of the message, with identifiers and numbers replaced — so one failing loop is one row with a count rather than a thousand rows.';

create index platform_errors_recent on public.platform_errors (last_seen_at desc);

create trigger platform_errors_touch
  before update on public.platform_errors
  for each row execute function amryn.touch_updated_at();

alter table public.platform_errors enable row level security;
alter table public.platform_errors force  row level security;

revoke all on public.platform_errors from authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- Recording one
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A function rather than an insert, because the write is an upsert that has to
-- *increment*: seeing a problem for the hundredth time must raise a count, not
-- add a row or fail on the primary key. That is not expressible as a plain
-- insert through PostgREST, and expressing it as a read-then-write in the
-- application would race with itself the moment two requests fail at once.
--
-- first_seen_at is never touched on conflict. When a problem started is the
-- fact that says whether it arrived with the last deploy, and overwriting it
-- on every recurrence would erase exactly that.
create or replace function public.record_platform_error(
  p_fingerprint text,
  p_scope       text,
  p_message     text,
  p_service     text default '',
  p_revision    text default null
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.platform_errors
    (fingerprint, scope, message, service, revision)
  values
    (p_fingerprint, p_scope, p_message, coalesce(p_service, ''), p_revision)
  on conflict (fingerprint) do update
    set occurrences  = public.platform_errors.occurrences + 1,
        last_seen_at = now(),
        -- The newest wording, the newest build. The old ones are not kept:
        -- what is wanted here is "what is it saying now", and the shape that
        -- groups them is already in the fingerprint.
        message      = excluded.message,
        service      = excluded.service,
        revision     = excluded.revision;
$$;

comment on function public.record_platform_error is
  'Records one failure, incrementing the count when it has been seen before. first_seen_at is never overwritten — when a problem started is what says whether it arrived with the last deploy.';

-- Only the platform writes here. A signed-in caller has no business filing an
-- error against the platform, and giving them one would make this table a
-- place to put claims rather than a record of what happened — the same
-- argument migration 06 makes about the audit log.
revoke all on function public.record_platform_error(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_platform_error(text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';

-- The worker says it is alive, and nobody with a session can read it.
--
-- This table exists because the worker went down twice for a combined
-- thirty-five minutes while /api/health reported "ok". It is the platform's
-- own plumbing rather than a tenant's data — it names hosts and process ids —
-- so the interesting assertions are about who cannot see it.
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

set local role postgres;

insert into public.worker_heartbeats (worker_id, handlers, in_flight, revision)
values ('host-a/1/deadbeef', array['jobs.sweep','brief.nightly'], 0, '86aec28');

select pg_temp.check(
  (select count(*) from public.worker_heartbeats) = 1,
  'the worker can write a beat over a direct connection');

-- ═══════════════════════════════════════════════════════════════════════════
-- One row per worker, not one per beat
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Seventeen thousand rows a day per worker to answer a question about the
-- newest one, and the pruning job would then need pruning.

insert into public.worker_heartbeats (worker_id, handlers, in_flight)
values ('host-a/1/deadbeef', array['jobs.sweep','brief.nightly','twin.nightly'], 1)
on conflict (worker_id) do update
  set last_seen_at = now(),
      handlers     = excluded.handlers,
      in_flight    = excluded.in_flight;

select pg_temp.check(
  (select count(*) from public.worker_heartbeats) = 1,
  'a second beat updates the row rather than adding one');

select pg_temp.check(
  (select in_flight from public.worker_heartbeats where worker_id = 'host-a/1/deadbeef') = 1
  and (select array_length(handlers, 1) from public.worker_heartbeats
        where worker_id = 'host-a/1/deadbeef') = 3,
  'and carries the newer in-flight count and handler list');

-- ═══════════════════════════════════════════════════════════════════════════
-- A dead worker's row is evidence, not noise
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The check reads the freshest beat, so an old row from a replaced worker is
-- the record of when it stopped rather than something to clean up.

insert into public.worker_heartbeats (worker_id, last_seen_at, started_at, handlers)
values ('host-b/1/00000000', now() - interval '2 hours', now() - interval '3 hours',
        array['jobs.sweep']);

select pg_temp.check(
  (select worker_id from public.worker_heartbeats
    order by last_seen_at desc limit 1) = 'host-a/1/deadbeef',
  'the freshest beat wins, so a replaced worker does not mask a live one');

-- ═══════════════════════════════════════════════════════════════════════════
-- What a beat must be internally consistent about
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    insert into public.worker_heartbeats (worker_id, last_seen_at, started_at)
    values ('host-c/1/11111111', now() - interval '1 hour', now())
  $$, 'started_before_seen'),
  'a worker cannot have been seen before it started');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.worker_heartbeats (worker_id, in_flight)
    values ('host-d/1/22222222', -1)
  $$, 'worker_heartbeats_in_flight_check'),
  'nor hold a negative number of jobs');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.worker_heartbeats (worker_id) values ('')
  $$, 'worker_heartbeats_worker_id_check'),
  'a beat with no worker id is refused — it would be a beat from nobody');

-- ═══════════════════════════════════════════════════════════════════════════
-- No session may read it, ever
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Row-level security is on with no policy at all, which is a stronger
-- statement than "members only": there is no organisation this belongs to, and
-- the rows name hosts and process ids.

select pg_temp.check(
  (select relrowsecurity and relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'worker_heartbeats'),
  'row-level security is on and forced');

select pg_temp.check(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'worker_heartbeats') = 0,
  'and there is no policy at all — not "members only", but "no session, ever"');

reset role;
set local role authenticated;

-- Migration 09 grants select/insert/update/delete to `authenticated` on every
-- new table in this schema by default, so the absence of a policy was doing
-- all the work here. The migration revokes explicitly as well, and these two
-- assert both halves rather than the outcome alone.

select pg_temp.check(
  pg_temp.refused($$ select count(*) from public.worker_heartbeats $$,
                  'permission denied'),
  'a signed-in caller is refused at the privilege check, before RLS is even reached');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.worker_heartbeats (worker_id) values ('forged/1/33333333')
  $$, 'permission denied'),
  'and cannot forge a beat to make a dead worker look alive');

rollback;

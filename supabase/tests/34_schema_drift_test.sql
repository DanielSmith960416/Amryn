-- A worker that can say the database is behind it.
--
-- The column is the record of a decision the worker has already taken: while
-- it is non-empty the worker is claiming nothing, on purpose. So the
-- assertions here are about the two things that decision depends on — that the
-- healthy answer is the default (a worker on an older build must not read as
-- an outage), and that nobody with a session can write into it (a forged empty
-- list would hide exactly the fault this exists to surface).
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

-- ── the default is the healthy answer ─────────────────────────────────────
--
-- A worker built before migration 34 never writes this column. If its absence
-- read as anything other than "no drift", the first deploy carrying the column
-- would report an outage caused by the deploy itself.

insert into public.worker_heartbeats (worker_id, handlers)
values ('host-a/1/deadbeef', array['jobs.sweep']);

select pg_temp.check(
  (select pending_migrations from public.worker_heartbeats
    where worker_id = 'host-a/1/deadbeef') = '{}',
  'a beat that says nothing about migrations reads as no drift, not as unknown');

select pg_temp.check(
  (select pending_migrations is not null from public.worker_heartbeats
    where worker_id = 'host-a/1/deadbeef'),
  'and it is never null, so a reader never has to decide what null would mean');

-- ── it holds what the worker found ────────────────────────────────────────

update public.worker_heartbeats
   set pending_migrations = array['20260909220000_34_schema_drift.sql']
 where worker_id = 'host-a/1/deadbeef';

select pg_temp.check(
  (select array_length(pending_migrations, 1) from public.worker_heartbeats
    where worker_id = 'host-a/1/deadbeef') = 1,
  'a worker ahead of the schema records which file the database is missing');

-- The names matter, not just the count: /diagnostics prints them so somebody
-- knows which migration to go and apply.
select pg_temp.check(
  (select pending_migrations[1] from public.worker_heartbeats
    where worker_id = 'host-a/1/deadbeef') = '20260909220000_34_schema_drift.sql',
  'and records the filename itself rather than a count');

-- ── nobody with a session can touch it ────────────────────────────────────
--
-- The same guarantee as the rest of the table, asserted again on this column
-- because it is the one worth forging: writing '{}' over a real drift report
-- would silence the alarm while leaving the queue stopped.

reset role;
set local role authenticated;

select pg_temp.check(
  pg_temp.refused($$ select pending_migrations from public.worker_heartbeats $$,
                  'permission denied'),
  'a signed-in caller cannot read what the worker reported about the schema');

select pg_temp.check(
  pg_temp.refused($$ update public.worker_heartbeats set pending_migrations = '{}' $$,
                  'permission denied'),
  'and cannot clear a drift report to make a stopped queue look healthy');

rollback;

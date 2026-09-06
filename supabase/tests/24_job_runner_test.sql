-- The job runner: claiming, leasing, retrying, and who may see any of it.
--
-- The assertions worth having here are about the states a naive queue gets
-- wrong. Two workers must not take the same row. A worker that dies must not
-- take its job to the grave. A job that reliably kills the worker must stop
-- being retried. A tenant that has not been switched on must not have its work
-- run, and must not have it thrown away either.
--
-- Concurrency is asserted through its consequences rather than by opening two
-- sessions: a row that is 'running' is no longer 'queued', so a second claim
-- in the same transaction returns something else or nothing. That is the same
-- guarantee `skip locked` provides between two connections, and it is the one
-- a single-session test can actually observe.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.check(ok boolean, what text) returns void
language plpgsql as $$
begin
  if ok then raise notice 'pass  %', what;
  else raise exception 'FAIL  %', what; end if;
end $$;

create or replace function pg_temp.act_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'aal', 'aal2')::text, true);
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

-- Did it run at all? Not the same as `not refused(...)`, which is true both
-- when a statement succeeded and when it failed for some other reason.
create or replace function pg_temp.succeeds(stmt text) returns boolean
language plpgsql as $$
begin
  execute stmt;
  return true;
exception when others then
  raise notice 'statement failed: %', sqlerrm;
  return false;
end $$;

insert into auth.users (id, email) values
  ('b1111111-1111-4111-8111-111111111111', 'founder@jobs.test'),
  ('b2222222-2222-4222-8222-222222222222', 'outsider@jobs.test')
  on conflict (id) do nothing;

set local role authenticated;

select pg_temp.act_as('b1111111-1111-4111-8111-111111111111');
select public.create_organisation('Jobs Co', 'jobs-co', null, 'ZA', 'ZAR') as org \gset
select set_config('amryn_test.org', :'org', true);

select pg_temp.act_as('b2222222-2222-4222-8222-222222222222');
select public.create_organisation('Elsewhere Co', 'elsewhere-co', null, 'ZA', 'ZAR') as org \gset
select set_config('amryn_test.other', :'org', true);

-- The worker is not a browser. Everything below that stands in for it runs as
-- the owner with no JWT, which is exactly what a direct connection is.
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

-- ═══════════════════════════════════════════════════════════════════════════
-- Flags decide whose work runs
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  amryn.feature_enabled(current_setting('amryn_test.org')::uuid, 'background_jobs') = false,
  'a flag is off for an organisation that has no row for it');

select pg_temp.check(
  amryn.feature_enabled(current_setting('amryn_test.org')::uuid, 'no_such_flag') = false,
  'and off for a flag nobody has registered');

select pg_temp.check(
  amryn.feature_enabled(null, 'background_jobs') = false,
  'and off rather than null for an organisation that is not one');

insert into public.organisation_feature_flags (organisation_id, flag_key, enabled)
values (current_setting('amryn_test.org')::uuid, 'background_jobs', false);

select pg_temp.check(
  amryn.feature_enabled(current_setting('amryn_test.org')::uuid, 'background_jobs') = false,
  'a row that says false is off, which is not the same as absent but reads the same');

-- ═══════════════════════════════════════════════════════════════════════════
-- Claiming
-- ═══════════════════════════════════════════════════════════════════════════

-- Platform work: no organisation, so no flag to satisfy.
insert into public.job_runs (kind, priority) values ('rate_limits.prune', 10)
returning id as platform_job \gset

-- A tenant's work, for an organisation that is switched off.
insert into public.job_runs (organisation_id, kind)
values (current_setting('amryn_test.org')::uuid, 'imprint.analyse')
returning id as tenant_job \gset

select pg_temp.check(
  (select count(*) from amryn.claim_jobs('worker-a', 10)) = 1,
  'a worker claims the platform job and leaves the switched-off tenant alone');

select pg_temp.check(
  (select status from public.job_runs where id = :'tenant_job') = 'queued',
  'and that tenant''s job is still queued rather than discarded');

select pg_temp.check(
  (select status = 'running' and attempts = 1 and worker_id = 'worker-a'
      and lease_until > now() and started_at is not null
     from public.job_runs where id = :'platform_job'),
  'the claimed job is running, leased, and has spent an attempt');

-- The second claim is the one that matters: the row the first worker took is
-- no longer queued, so nothing is handed out twice.
select pg_temp.check(
  (select count(*) from amryn.claim_jobs('worker-b', 10)) = 0,
  'a second worker finds nothing, because a running job is not a queued one');

-- Switching the tenant on releases the work that was waiting, rather than
-- requiring it to be queued again.
update public.organisation_feature_flags
   set enabled = true, enabled_at = now()
 where organisation_id = current_setting('amryn_test.org')::uuid
   and flag_key = 'background_jobs';

select pg_temp.check(
  (select count(*) from amryn.claim_jobs('worker-b', 10)) = 1,
  'switching the flag on drains the backlog that was already waiting');

-- ═══════════════════════════════════════════════════════════════════════════
-- Not twice: the two deduplication rules
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.job_runs (kind, dedupe_key) values ('twin.tick', 'twin.tick:2026-09-06');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.job_runs (kind, dedupe_key) values ('twin.tick', 'twin.tick:2026-09-06')
  $$, 'job_runs_dedupe_key'),
  'a scheduled slot cannot be enqueued twice, however many workers noticed it was due');

insert into public.job_runs (kind, singleton_key) values ('imprint.analyse', 'analyse:org-1');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.job_runs (kind, singleton_key) values ('imprint.analyse', 'analyse:org-1')
  $$, 'job_runs_singleton_key'),
  'and only one of a singleton may be in flight');

-- The difference between the two: a singleton is released by finishing, a
-- dedupe key never is.
update public.job_runs
   set status = 'succeeded', finished_at = now(), worker_id = 'worker-a', lease_until = now()
 where singleton_key = 'analyse:org-1';

select pg_temp.check(
  pg_temp.succeeds($$
    insert into public.job_runs (kind, singleton_key) values ('imprint.analyse', 'analyse:org-1')
  $$),
  'the next singleton may be queued the moment the last one finishes');

update public.job_runs
   set status = 'succeeded', finished_at = now(), worker_id = 'worker-a', lease_until = now()
 where dedupe_key = 'twin.tick:2026-09-06';

select pg_temp.check(
  pg_temp.refused($$
    insert into public.job_runs (kind, dedupe_key) values ('twin.tick', 'twin.tick:2026-09-06')
  $$, 'job_runs_dedupe_key'),
  'a finished slot is still spent — that is what "once, ever" means');

-- ═══════════════════════════════════════════════════════════════════════════
-- Leases, and the worker that stopped
-- ═══════════════════════════════════════════════════════════════════════════

-- Jobs left queued by the section above would compete for the next claim and
-- make these assertions depend on the order rows happened to be inserted in.
-- Cleared, so each section starts from a queue it fully describes.
update public.job_runs set status = 'cancelled', finished_at = now()
 where status = 'queued';

insert into public.job_runs (kind, max_attempts) values ('twin.tick', 3)
returning id as leased \gset

select pg_temp.check(
  (select count(*) from amryn.claim_jobs('worker-c', 1, interval '5 minutes')) >= 1,
  'a job is claimed under a lease');

select pg_temp.check(
  amryn.heartbeat_job(:'leased', 'worker-c', interval '5 minutes') = true,
  'the worker holding it may extend that lease');

select pg_temp.check(
  amryn.heartbeat_job(:'leased', 'worker-d', interval '5 minutes') = false,
  'and a worker that is not holding it may not');

-- The worker dies here. Nothing tells the database; the lease simply lapses.
update public.job_runs set lease_until = now() - interval '1 minute' where id = :'leased';

select pg_temp.check(
  (select id from amryn.claim_jobs('worker-e', 1)) = :'leased',
  'a lapsed lease makes the job claimable again, with no reaper process involved');

select pg_temp.check(
  (select attempts from public.job_runs where id = :'leased') = 2,
  'and the abandoned attempt was counted, so a job that kills workers cannot loop for ever');

select pg_temp.check(
  amryn.heartbeat_job(:'leased', 'worker-c', interval '5 minutes') = false,
  'the worker that was superseded is told to stop rather than left writing over the new one');

-- ═══════════════════════════════════════════════════════════════════════════
-- Finishing, failing, and giving up
-- ═══════════════════════════════════════════════════════════════════════════

-- Jobs left queued by the section above would compete for the next claim and
-- make these assertions depend on the order rows happened to be inserted in.
-- Cleared, so each section starts from a queue it fully describes.
update public.job_runs set status = 'cancelled', finished_at = now()
 where status = 'queued';

insert into public.job_runs (kind, max_attempts) values ('rate_limits.prune', 2)
returning id as retried \gset

select pg_temp.check(
  (select count(*) from amryn.claim_jobs('worker-f', 1)) >= 1,
  'a job with two attempts is claimed');

select pg_temp.check(
  (select status from amryn.fail_job(:'retried', 'connection reset', interval '30 seconds'))
    = 'queued',
  'a failure with attempts left goes back to the queue');

select pg_temp.check(
  (select run_at > now() and error = 'connection reset' and finished_at is null
     from public.job_runs where id = :'retried'),
  'held back by the delay the worker asked for, with the reason recorded');

-- Nothing may be claimed until the backoff has passed. That is the point of it.
select pg_temp.check(
  (select count(*) from amryn.claim_jobs('worker-f', 10)
    where id = :'retried') = 0,
  'and it is not handed out again before that delay has passed');

update public.job_runs set run_at = now() - interval '1 second' where id = :'retried';
select count(*) from amryn.claim_jobs('worker-f', 1) \gset attempt2_

select pg_temp.check(
  (select attempts from public.job_runs where id = :'retried') = 2,
  'the second attempt is claimed once the delay expires');

select pg_temp.check(
  (select status from amryn.fail_job(:'retried', 'connection reset again', interval '30 seconds'))
    = 'failed',
  'and a second failure gives up, because the delay is the worker''s to choose and the count is not');

select pg_temp.check(
  (select finished_at is not null and duration_ms >= 0 and error = 'connection reset again'
     from public.job_runs where id = :'retried'),
  'a job that has given up is closed, timed, and says why');

select pg_temp.check(
  (select count(*) from amryn.claim_jobs('worker-f', 10) where id = :'retried') = 0,
  'and is never claimed again');

-- A worker whose lease lapsed must not be able to close a job somebody else
-- now owns. Both functions refuse anything that is not currently running.
-- Jobs left queued by the section above would compete for the next claim and
-- make these assertions depend on the order rows happened to be inserted in.
-- Cleared, so each section starts from a queue it fully describes.
update public.job_runs set status = 'cancelled', finished_at = now()
 where status = 'queued';

insert into public.job_runs (kind) values ('rate_limits.prune') returning id as stolen \gset

select pg_temp.check(
  pg_temp.refused(
    format('select amryn.complete_job(%L)', :'stolen'),
    'is not running'),
  'a job that was never claimed cannot be completed');

select pg_temp.check(
  pg_temp.refused(
    format('select amryn.fail_job(%L, %L)', :'stolen', 'nonsense'),
    'is not running'),
  'nor failed');

select count(*) from amryn.claim_jobs('worker-g', 1) \gset claim_
select pg_temp.check(
  (select status from amryn.complete_job(:'stolen', '{"removed": 4}'::jsonb)) = 'succeeded',
  'a running job is completed with its result');

select pg_temp.check(
  (select result ->> 'removed' = '4' and error is null and duration_ms >= 0
     from public.job_runs where id = :'stolen'),
  'and the result is kept, with no error left over from an earlier attempt');

-- ═══════════════════════════════════════════════════════════════════════════
-- Sweeping
-- ═══════════════════════════════════════════════════════════════════════════

-- Abandoned with nothing left: the lease alone cannot recover this one,
-- because no attempts remain, so without the sweep it reads as work in
-- progress for ever.
insert into public.job_runs
  (kind, status, attempts, max_attempts, worker_id, lease_until, started_at)
values
  ('twin.tick', 'running', 3, 3, 'worker-gone', now() - interval '1 hour', now() - interval '2 hours')
returning id as abandoned \gset

insert into public.job_runs (kind, status, finished_at, worker_id, lease_until)
values ('rate_limits.prune', 'succeeded', now() - interval '90 days', 'worker-a', now())
returning id as ancient \gset

insert into public.job_runs (kind, status, finished_at, error, worker_id, lease_until)
values ('twin.tick', 'failed', now() - interval '90 days', 'it broke', 'worker-a', now())
returning id as ancient_failure \gset

select amryn.sweep_jobs(interval '30 days') as swept \gset

select pg_temp.check(
  (select status = 'failed' and error like 'abandoned:%'
     from public.job_runs where id = :'abandoned'),
  'the sweep closes a run abandoned with no attempts left, and says so');

select pg_temp.check(
  (select count(*) from public.job_runs where id = :'ancient') = 0,
  'and deletes a success that is past the retention window');

select pg_temp.check(
  (select count(*) from public.job_runs where id = :'ancient_failure') = 1,
  'but never a failure, whatever its age — it is the only record that anything went wrong');

-- ═══════════════════════════════════════════════════════════════════════════
-- Who may see and touch any of this
-- ═══════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pg_temp.act_as('b1111111-1111-4111-8111-111111111111');

select pg_temp.check(
  (select count(*) from public.job_runs) >= 1
  and (select count(*) from public.job_runs
        where organisation_id is distinct from current_setting('amryn_test.org')::uuid) = 0,
  'a member sees their own organisation''s runs and nothing else — not another tenant''s, not the platform''s');

select pg_temp.act_as('b2222222-2222-4222-8222-222222222222');
select pg_temp.check(
  (select count(*) from public.job_runs) = 0,
  'and somebody from another organisation sees none of them');

select pg_temp.act_as('b1111111-1111-4111-8111-111111111111');

-- There is no write policy at all, which is stronger than a policy that
-- happens to be restrictive: nothing reaching PostgREST can queue work for
-- itself, jump the queue, or mark its own analysis finished.
select pg_temp.check(
  pg_temp.refused($$
    insert into public.job_runs (organisation_id, kind)
    values (current_setting('amryn_test.org')::uuid, 'imprint.analyse')
  $$, 'row-level security'),
  'a signed-in member cannot queue work');

-- An UPDATE or DELETE with no policy behind it is not refused the way an
-- INSERT is. It matches no rows and reports success, which is a quieter
-- failure mode and the one worth asserting for what it actually is — a test
-- expecting an exception here would pass while the rows were being rewritten.
select count(*) as visible from public.job_runs \gset before_

select pg_temp.check(
  pg_temp.succeeds($$ update public.job_runs set priority = 0 $$)
  and (select count(*) from public.job_runs where priority = 0) = 0,
  'nor jump the queue: the update reaches no row at all');

select pg_temp.check(
  pg_temp.succeeds($$ delete from public.job_runs $$)
  and (select count(*) from public.job_runs) = :before_visible
  and :before_visible > 0,
  'nor delete the record of what ran — and there was something there to delete');

-- Nor may they turn on their own rollout switches. Switched on above, so the
-- attempt here is to switch it off: a no-op update would otherwise be
-- indistinguishable from a successful one.
select pg_temp.check(
  pg_temp.succeeds($$ update public.organisation_feature_flags set enabled = false $$)
  and (select enabled from public.organisation_feature_flags
        where organisation_id = current_setting('amryn_test.org')::uuid
          and flag_key = 'background_jobs') = true,
  'and a customer cannot switch unfinished behaviour on or off for themselves');

select pg_temp.check(
  (select enabled from public.organisation_features
    where flag_key = 'background_jobs'
      and organisation_id = current_setting('amryn_test.org')::uuid) = true,
  'though they can see which switches are on for them');

select pg_temp.check(
  (select count(distinct organisation_id) from public.organisation_features) = 1,
  'and the view stays inside the tenant, like every other');

-- The worker's own functions are not reachable from a browser at all.
select pg_temp.check(
  not has_function_privilege('authenticated', 'amryn.claim_jobs(text, integer, interval)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'amryn.complete_job(uuid, jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'amryn.fail_job(uuid, text, interval)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'amryn.heartbeat_job(uuid, text, interval)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'amryn.sweep_jobs(interval)', 'EXECUTE'),
  'no signed-in caller may claim, complete, fail, extend or sweep a job');

select pg_temp.check(
  not has_function_privilege('anon', 'amryn.feature_enabled(uuid, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'amryn.feature_enabled(uuid, text)', 'EXECUTE'),
  'and resolving a flag is for signed-in callers only');

reset role;
rollback;

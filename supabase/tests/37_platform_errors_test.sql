-- Errors, counted rather than piled up, and readable by nobody with a session.
--
-- The two properties that make this table worth having. If recurrences added
-- rows instead of raising a count, one failing loop would bury everything else
-- and the table would need a pruning job. If a signed-in caller could read it,
-- one tenant would be reading the internals of another's failures.
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

-- ── the same problem twice is one row ─────────────────────────────────────

select public.record_platform_error('documents:could not reach <address>', 'documents',
  'could not reach 10.0.0.4', 'worker', 'abc1234');

select pg_temp.check(
  (select occurrences from public.platform_errors
    where fingerprint = 'documents:could not reach <address>') = 1,
  'a failure nobody has seen before is one occurrence');

select public.record_platform_error('documents:could not reach <address>', 'documents',
  'could not reach 10.0.0.9', 'worker', 'abc1234');
select public.record_platform_error('documents:could not reach <address>', 'documents',
  'could not reach 10.0.0.9', 'worker', 'abc1234');

select pg_temp.check(
  (select count(*) from public.platform_errors) = 1
  and (select occurrences from public.platform_errors) = 3,
  'seeing it again raises the count instead of adding rows');

select pg_temp.check(
  (select message from public.platform_errors) = 'could not reach 10.0.0.9',
  'and keeps the newest wording, which is what it is saying now');

-- ── when it started is not overwritten ────────────────────────────────────
--
-- The fact that says whether a problem arrived with the last deploy. Raising
-- first_seen_at on every recurrence would erase exactly that, and the erasure
-- would be invisible.

select pg_temp.check(
  (select first_seen_at < last_seen_at or first_seen_at = last_seen_at
     from public.platform_errors)
  and (select first_seen_at from public.platform_errors)
      = (select min(created_at) from public.platform_errors),
  'when it was first seen survives every recurrence');

-- ── a different problem is a different row ────────────────────────────────

select public.record_platform_error('billing:the card was declined', 'billing',
  'the card was declined', 'web', 'abc1234');

select pg_temp.check(
  (select count(*) from public.platform_errors) = 2,
  'a genuinely different failure gets its own row');

-- ── what may be stored ────────────────────────────────────────────────────

select pg_temp.check(
  pg_temp.refused(
    $$insert into public.platform_errors (fingerprint, scope, message, service)
      values ('x', 'y', 'z', 'somewhere')$$,
    'check constraint'),
  'a service that is neither the web nor the worker is not storable');

select pg_temp.check(
  pg_temp.refused(
    $$insert into public.platform_errors (fingerprint, scope, message, occurrences)
      values ('x', 'y', 'z', 0)$$,
    'check constraint'),
  'and an error that happened zero times is not an error');

-- ── nobody reads this with a session ──────────────────────────────────────
--
-- These messages name hosts, file paths and the internals of other tenants'
-- failures. Row level security is on with no policy at all, which refuses
-- every signed-in caller — and the privilege is revoked as well, so neither
-- defence rests on somebody remembering migration 09's default grants.

set local role authenticated;

select pg_temp.check(
  pg_temp.refused($$select count(*) from public.platform_errors$$, 'permission denied'),
  'a signed-in caller cannot read the platform''s failures');

select pg_temp.check(
  pg_temp.refused(
    $$select public.record_platform_error('forged', 'billing', 'nothing is wrong', 'web', null)$$,
    'permission denied'),
  'nor file one, which would make this a place to put claims rather than a record');

rollback;

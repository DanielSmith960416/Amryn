-- The record that a backup happened, and who is not allowed to read it.
--
-- The table answers one question — "is there a backup, and how old is it?" —
-- so the assertions are about the things that would make the answer a lie: a
-- backup recorded twice reading as two, a dump of nothing being indistinguish-
-- able from a dump of something, and a signed-in customer learning how many
-- organisations exist from a diagnostics table.
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

insert into public.backups
  (taken_at, database_digest, database_label, bytes, sha256, pg_dump_version, rows, stored_at)
values
  (now() - interval '3 hours', 'abc123', 'db.example.co/postgres', 4194304,
   repeat('a', 64), 'pg_dump (PostgreSQL) 17.6', '{"organisations": 2}'::jsonb,
   '/backups/today.sql');

select pg_temp.check(
  (select count(*) from public.backups) = 1,
  'a completed backup is recorded');

-- ── the same backup reported twice is still one backup ────────────────────
--
-- Re-running the recorder, or a script retried after a network blip, must not
-- make the history look busier than it was.

select pg_temp.check(
  pg_temp.refused($$
    insert into public.backups
      (taken_at, database_digest, database_label, bytes, sha256, pg_dump_version, stored_at)
    select taken_at, database_digest, database_label, bytes, sha256, pg_dump_version, stored_at
      from public.backups
  $$, 'duplicate key'),
  'one backup of one database at one instant cannot be recorded twice');

-- ── a row must describe a real dump ───────────────────────────────────────
--
-- Zero bytes is not a small backup, it is a missing one, and a truncated
-- checksum is a checksum of something else.

select pg_temp.check(
  pg_temp.refused($$
    insert into public.backups
      (taken_at, database_digest, database_label, bytes, sha256, pg_dump_version, stored_at)
    values (now(), 'd', 'l', 0, repeat('b', 64), 'v', '/tmp/x')
  $$, 'bytes_check'),
  'a zero-byte backup is refused rather than recorded as a small one');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.backups
      (taken_at, database_digest, database_label, bytes, sha256, pg_dump_version, stored_at)
    values (now(), 'd', 'l', 100, 'short', 'v', '/tmp/x')
  $$, 'sha256_check'),
  'a checksum of the wrong length is refused');

-- ── which database it came from is not optional ───────────────────────────
--
-- A staging dump and a production dump are otherwise identical rows, and the
-- reassuring one is always the wrong one.

select pg_temp.check(
  pg_temp.refused($$
    insert into public.backups
      (taken_at, database_digest, database_label, bytes, sha256, pg_dump_version, stored_at)
    values (now(), '', 'l', 100, repeat('c', 64), 'v', '/tmp/x')
  $$, 'database_digest_check'),
  'a backup that cannot say which database it is of is refused');

-- ── the counts survive, because emptiness is the quiet failure ────────────

select pg_temp.check(
  (select (rows->>'organisations')::int from public.backups limit 1) = 2,
  'the row counts read out of the dump are kept, so a dump of nothing is visible');

-- ── nobody with a session may read it ─────────────────────────────────────
--
-- Platform plumbing, not tenant data, and it names hosts, file paths and how
-- many organisations exist — the size of the customer base is not a thing a
-- customer should learn from a diagnostics table.

reset role;
set local role authenticated;

select pg_temp.check(
  pg_temp.refused($$ select count(*) from public.backups $$, 'permission denied'),
  'a signed-in caller cannot read the backup history');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.backups
      (taken_at, database_digest, database_label, bytes, sha256, pg_dump_version, stored_at)
    values (now(), 'forged', 'l', 100, repeat('d', 64), 'v', '/tmp/x')
  $$, 'permission denied'),
  'and cannot forge one to make an unprotected database look backed up');

rollback;

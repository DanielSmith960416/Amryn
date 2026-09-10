-- ═══════════════════════════════════════════════════════════════════════════
-- 35. A record of every backup that was actually taken
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Phase 7, backups. The procedure has existed since migration 25:
-- scripts/backup.mjs takes a dump, verifies it is complete, counts what it
-- captured, and writes a manifest; scripts/migrate.mjs refuses a migration
-- that is not purely additive unless that manifest is recent and intact.
--
-- All of which protects migrations, and none of which answers the question
-- somebody asks after a disaster: **is there a backup, and how old is it?**
--
-- Until now the only evidence a backup ever happened was a file on whichever
-- machine took it. Nothing in the platform knew. "We have backups" was an
-- assumption, and the failure mode of an assumption is that it is discovered
-- to be false at the worst possible moment.
--
-- ── why a table rather than reading the files ─────────────────────────────
--
-- The files are not here. They are on an operator's machine by design — the
-- deployment container's filesystem is discarded, which backup.mjs says in
-- its own error message. So the platform cannot inspect them; it can only be
-- told. This is where it is told.
--
-- A row is written when a dump completes and verifies, never before. A row
-- therefore means: at this moment, a complete dump of this database existed,
-- of this size, containing these rows. What it cannot promise is that the
-- file still exists — see stored_at, and the note on restore below.
--
-- ── what the row is for ───────────────────────────────────────────────────
--
-- /diagnostics reads the newest one and reports its age. That turns silence
-- into a statement: no backup in nine days is a sentence somebody can act on,
-- where an empty backups directory on a laptop nobody has opened is not.
--
-- Additive: one table.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.backups (
  id               uuid primary key default gen_random_uuid(),

  -- When the dump was taken, not when the row was written. They differ when a
  -- backup is recorded after the fact, and the first is the one that matters.
  taken_at         timestamptz not null,

  /*
   * Which database this is a backup *of*.
   *
   * The digest of host and database name, from backup-manifest.mjs — never the
   * connection string, which carries a password. Without this a staging dump
   * and a production dump are indistinguishable rows, and the reassuring one
   * is always the wrong one.
   */
  database_digest  text not null check (database_digest <> ''),
  database_label   text not null check (database_label <> ''),

  bytes            bigint not null check (bytes > 0),

  -- pg_dump's own output, hashed. Two rows with one checksum are one backup
  -- recorded twice, not two backups.
  sha256           text not null check (char_length(sha256) = 64),

  -- The client that produced it. A dump taken by a pg_dump older than the
  -- server can omit what it does not know about, so which one took it is part
  -- of what the backup is.
  pg_dump_version  text not null check (pg_dump_version <> ''),

  /*
   * What was captured, counted from the dump itself rather than from the
   * database — so the figures describe the file, not the intention.
   *
   * Zero organisations in a backup of a live system is the number worth
   * noticing before trusting it, which is why this is stored rather than
   * summarised away.
   */
  rows             jsonb not null default '{}'::jsonb,

  /*
   * Where the operator put it. A path on a machine, or wherever it was moved
   * to afterwards.
   *
   * Deliberately free text and deliberately not trusted: the platform cannot
   * see that filesystem, so this records what it was told and nothing more. A
   * row does not prove the file is still there — only that it once was.
   */
  stored_at        text not null check (stored_at <> ''),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- One backup of one database at one instant is one row, however many times
  -- it is reported.
  constraint one_row_per_backup unique (database_digest, taken_at)
);

comment on table public.backups is
  'One row per completed, verified database dump. Written by scripts/backup.mjs after the dump passes its completion check. /diagnostics reads the newest to report how old the last backup is. A row proves a backup existed, not that the file still does.';

comment on column public.backups.rows is
  'Row counts read out of the dump itself. Zero organisations in a backup of a live system is the figure worth noticing before trusting it.';

comment on column public.backups.stored_at is
  'Where the operator said they put it. Not verifiable from here — the platform cannot see that filesystem.';

create index backups_newest on public.backups (database_digest, taken_at desc);

create trigger backups_touch
  before update on public.backups
  for each row execute function amryn.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- Who may see one
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Nobody, through PostgREST — the same treatment as worker_heartbeats, for the
-- same reason and with one more. This is platform plumbing rather than a
-- tenant's data, and it names hosts, file paths and how many organisations
-- exist. A signed-in customer learning the size of the customer base from a
-- diagnostics table is a leak, however small.
--
-- RLS on with no policy at all, plus the explicit revoke: migration 09 grants
-- select, insert, update and delete to `authenticated` by default on every new
-- table in this schema, so the absence of a policy is not on its own the whole
-- defence and never was.

alter table public.backups enable row level security;
alter table public.backups force  row level security;

revoke all on public.backups from authenticated, anon;

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 40. How much room is left where the backups go
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Migration 35 made the *age* of the last backup visible, which turned "we
-- have backups" from an assumption into a statement. This is the other half of
-- the same question, and it has the same failure mode: a nightly dump that
-- silently stops because the volume filled looks exactly like one that is
-- still running, right up until somebody needs it.
--
-- ── why this is on the heartbeat rather than on the backup row ───────────
--
-- A backup row is written once a night. A volume can fill at ten in the
-- morning, and learning about it fifteen hours later is learning about it
-- after the dump that would have told you has already failed.
--
-- The heartbeat beats every five seconds and already carries the operational
-- facts about the worker that nothing else can see — its handler list, its
-- revision, whether it is ahead of the schema. Free space belongs with those:
-- the volume is mounted on the worker, and the diagnostics page is rendered by
-- the web service, which cannot see that filesystem at all.
--
-- ── why not the host's own monitor ──────────────────────────────────────
--
-- Railway has disk-usage monitors and they are gated behind a plan this
-- deployment is not on. A check that exists only for customers who pay more is
-- not a check this platform has. Measuring it here costs one syscall per beat
-- and works on every plan, including none.
--
-- Additive: three columns with defaults. No row is rewritten — zero is the
-- default and reads as "never reported", which is what a worker on an older
-- build honestly is.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.worker_heartbeats
  add column volume_path        text   not null default '',
  add column volume_total_bytes bigint not null default 0 check (volume_total_bytes >= 0),
  add column volume_free_bytes  bigint not null default 0 check (volume_free_bytes  >= 0);

comment on column public.worker_heartbeats.volume_path is
  'Where the worker writes backups. Empty when it has no volume mounted, or is running a build from before this column existed.';

comment on column public.worker_heartbeats.volume_total_bytes is
  'Size of that volume as the worker measured it. Zero means it did not report, which is not the same as full — /diagnostics reads it as unknown.';

notify pgrst, 'reload schema';

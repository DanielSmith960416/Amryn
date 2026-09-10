-- ═══════════════════════════════════════════════════════════════════════════
-- 34. A worker that knows the database is behind it
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Phase 7, promotion. The failure this closes has now happened twice.
--
-- Both times the worker deployed before its migrations were applied, so it
-- came up carrying handlers that referenced tables the database did not yet
-- have. twin.nightly claimed, ran, and failed on `relation
-- "public.twin_scenarios" does not exist` — three times, until it had spent
-- every attempt it was allowed. The migration was applied by hand a few
-- minutes later, at which point the job was permanently failed and stayed
-- that way: the queue had already given up on work that would now have
-- succeeded, and somebody had to reset the row by hand to get it back.
--
-- Nothing about that was a code fault. The handler was right, the schema was
-- right, and they were right at different times.
--
-- ── the fix is ordering; this column is what makes the ordering visible ───
--
-- The ordering is enforced outside the database, by applying migrations
-- before the new worker is allowed to start. But a deploy step can be
-- removed, skipped, or silently fail, and the whole lesson of the last two
-- evenings is that a control nothing reports on is a control nobody knows
-- has stopped working.
--
-- So the worker also decides for itself. It ships with the list of migrations
-- its build was made from, compares that against the ledger on every poll,
-- and while the database is behind it declines to claim anything rather than
-- claiming work it cannot do. Waiting costs a few seconds. Claiming costs the
-- job its attempts, and someone an evening.
--
-- What is recorded here is what it found, so the state is legible from
-- outside the process — /diagnostics reads this column and names the missing
-- files. Empty is the healthy answer and the default, so a worker on an older
-- build that never writes it reads as healthy rather than as alarming.
--
-- Additive: one column with a default. Nothing existing is altered.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.worker_heartbeats
  add column if not exists pending_migrations text[] not null default '{}';

comment on column public.worker_heartbeats.pending_migrations is
  'Migrations this worker''s build carries that the database has not recorded. Non-empty means the worker is ahead of the schema and is deliberately not claiming jobs. Empty is healthy.';

notify pgrst, 'reload schema';

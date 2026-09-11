-- ═══════════════════════════════════════════════════════════════════════════
-- 41. Somewhere a deploy can put a backup
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The backup rule has been enforced since migration 25: scripts/migrate.mjs
-- refuses a migration that rewrites rows unless a recent, verified dump is to
-- hand. That rule is right and it has one consequence nobody designed for —
-- the worker's pre-deploy command cannot satisfy it, so a migration that
-- updates a single row stops the deploy of both services until a person
-- applies it by hand. Migration 36 did exactly that.
--
-- ── why the deploy could not simply take one ─────────────────────────────
--
-- Because it has nowhere to put it. Railway does not mount volumes during the
-- pre-deploy command — their documentation says so in four places — so a dump
-- written there lands on a filesystem that is discarded minutes later. That is
-- not a backup; it is a green check over nothing, which is worse than the
-- refusal it would replace.
--
-- ── and why not just let the deploy through ──────────────────────────────
--
-- Letting migrate.mjs give up quietly looked attractive until the consequence
-- was followed through. A worker whose database is behind claims nothing —
-- migration 34, deliberately — and enqueues nothing either, so the nightly
-- backup stops with everything else. The one thing needed to unblock the
-- migration is the one thing that has stopped running. A deadlock, reached by
-- being careful.
--
-- So: a private bucket the deploy can write to. The dump goes here, the
-- migration proceeds, and no human is in the path.
--
-- ── what this is honestly worth ──────────────────────────────────────────
--
-- A dump stored in the same project it was taken from does not survive losing
-- that project, and nothing here pretends otherwise. It is complete protection
-- against the thing the gate exists for — an update or a delete that turns out
-- to be wrong — and no protection at all against the account going away. The
-- nightly dump onto the worker's own volume, and whatever an operator copies
-- off it, remain the answer to the second question.
--
-- ── who may read it ──────────────────────────────────────────────────────
--
-- Nobody through a session. No policy is written for this bucket at all, which
-- given storage's row level security means every signed-in caller is refused —
-- the same treatment public.backups gets, and for a stronger reason: these
-- objects are the whole database, every tenant at once, in one file.
--
-- Only the service role reaches it, which bypasses policies by design and is
-- held by the deploy and the worker.
--
-- Additive: one bucket row.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

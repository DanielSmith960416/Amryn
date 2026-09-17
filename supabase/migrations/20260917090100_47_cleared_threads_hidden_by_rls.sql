-- ═══════════════════════════════════════════════════════════════════════════
-- 47 — a cleared conversation is hidden by the database, not only by the query
--
-- Migration 45 gave ai_conversations a nullable deleted_at, a partial index for
-- the live ones, and the convention that every list filters on it. The
-- application does: the assistant page and both list queries in
-- features/assistant/actions.ts carry `.is('deleted_at', null)`, and clearing a
-- thread is an update that sets the column rather than a delete.
--
-- What was never true is that the *database* hid them. ai_conversations_own was
-- a single FOR ALL policy on (user_id, is_member) that said nothing about
-- deleted_at, so a query written next year that forgets the filter reads
-- cleared threads back — with every question and figure in them — and looks
-- like it is working. The filter belongs where it cannot be forgotten.
--
-- ── why this is four policies and a function, and not one line ──────────
-- The obvious change is to add `deleted_at is null` to the existing FOR ALL
-- policy's USING and leave its WITH CHECK alone, on the reasoning that USING
-- is evaluated against the existing row and WITH CHECK against the new one, so
-- the update that clears a thread would still pass.
--
-- It does not. Postgres also requires the *result* of an UPDATE to satisfy the
-- table's SELECT policies — an update may not make a row invisible to the
-- person performing it. Measured here, on a throwaway table with one SELECT
-- policy carrying `deleted_at is null` and an UPDATE policy carrying only
-- ownership:
--
--   update t set label = 'renamed'     → accepted
--   update t set deleted_at = now()    → REFUSED, "new row violates row-level
--                                         security policy"
--
-- The only difference is the column that appears in the read policy and
-- nowhere else. Tried again with FORCE ROW LEVEL SECURITY off: refused
-- identically, so this is the general rule and not a quirk of this table.
--
-- The consequence is worth stating plainly, because it is not obvious and it
-- will come up again: **a row cannot be soft-deleted by the same user the
-- read policy will then hide it from.** Any table in this schema that hides
-- deleted_at rows from SELECT needs its soft delete performed by something
-- that is not subject to that policy.
--
-- So: the read hides cleared threads, and clearing one goes through
-- public.clear_conversation() — SECURITY DEFINER, with the ownership check the
-- policy would have made, written out where it can be read. The same shape as
-- create_organisation, ensure_user_profile and record_account_event already
-- use in this schema, and for the same reason.
--
--   select → yours, in your organisation, not cleared
--   insert → yours, in your organisation
--   update → yours, in your organisation   (renaming a thread; the ordinary
--                                           path, which never sets deleted_at)
--   delete → yours, in your organisation   (unchanged: nothing in the product
--                                           hard-deletes a thread, and this
--                                           migration is not the place to
--                                           start removing capabilities)
--
-- Nothing widens. All four carry the same ownership and membership test the
-- single policy carried; the read carries one more; and the one operation that
-- can no longer be done directly is done by a function that checks the same
-- thing first.
--
-- ── the caller this changes ──────────────────────────────────────────────
-- clearConversation() updated the row directly and read it back with
-- `.select('id, title')` to name the thread in the audit entry. Both halves of
-- that stop working here: the update is refused by the rule above, and the
-- RETURNING would come back empty even if it were not. It now calls
-- clear_conversation(), which returns the title it cleared so the audit entry
-- still names the thread without a second read. Changed in the same commit as
-- this file.
--
-- ── and the messages ─────────────────────────────────────────────────────
-- ai_messages keeps no deleted_at of its own — nothing in the product deletes
-- an individual message, and a column nothing writes is a column that lies.
-- Its policy already reaches through conversation_id to check ownership, so
-- the parent's deleted_at joins that same reach: clearing a thread takes its
-- messages out of view in the same instant, through one column. Here the
-- condition is safe in USING and WITH CHECK alike, because a message row never
-- changes its parent — and writing a new message into a thread you have
-- already cleared is not something to allow.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── the conversations ─────────────────────────────────────────────────────
--
-- Every drop is `if exists`, including the four policies this migration
-- itself creates, so the file can be applied to a database that already has
-- them. That is not hypothetical: these four were applied to production by
-- hand while this was being built, which left the objects present and the
-- ledger saying the migration was still pending. The next deploy tried it,
-- hit `policy "ai_conversations_read" already exists`, and stopped — taking
-- the worker down and blocking every later migration behind it.
--
-- Dropping and recreating rather than `create or replace`, which Postgres
-- does not offer for a policy. The whole file runs in one transaction, so
-- there is no moment at which the table is readable without a policy.
drop policy if exists ai_conversations_own on public.ai_conversations;
drop policy if exists ai_conversations_read on public.ai_conversations;
drop policy if exists ai_conversations_insert on public.ai_conversations;
drop policy if exists ai_conversations_update on public.ai_conversations;
drop policy if exists ai_conversations_delete on public.ai_conversations;

create policy ai_conversations_read on public.ai_conversations
  for select
  using (
    user_id = (select auth.uid())
    and amryn.is_member(organisation_id)
    and deleted_at is null
  );

create policy ai_conversations_insert on public.ai_conversations
  for insert
  with check (
    user_id = (select auth.uid())
    and amryn.is_member(organisation_id)
  );

create policy ai_conversations_update on public.ai_conversations
  for update
  using (
    user_id = (select auth.uid())
    and amryn.is_member(organisation_id)
  )
  with check (
    user_id = (select auth.uid())
    and amryn.is_member(organisation_id)
  );

create policy ai_conversations_delete on public.ai_conversations
  for delete
  using (
    user_id = (select auth.uid())
    and amryn.is_member(organisation_id)
  );

comment on policy ai_conversations_read on public.ai_conversations is
  'Your own live threads. deleted_at appears here and in no other policy on this table: in an update policy it would refuse the update that clears a thread.';

-- ── the messages in them ──────────────────────────────────────────────────
drop policy if exists ai_messages_own on public.ai_messages;

create policy ai_messages_own on public.ai_messages
  for all
  using (
    amryn.is_member(organisation_id)
    and exists (
      select 1 from public.ai_conversations c
       where c.id = ai_messages.conversation_id
         and c.user_id = (select auth.uid())
         and c.deleted_at is null
    )
  )
  with check (
    amryn.is_member(organisation_id)
    and exists (
      select 1 from public.ai_conversations c
       where c.id = ai_messages.conversation_id
         and c.user_id = (select auth.uid())
         and c.deleted_at is null
    )
  );

comment on policy ai_messages_own on public.ai_messages is
  'Messages in your own live threads. The parent thread is reached through conversation_id, so clearing the thread hides its messages through one column rather than a second deleted_at here.';

-- ── clearing a thread ─────────────────────────────────────────────────────
--
-- The one operation the read policy above makes impossible to perform
-- directly. SECURITY DEFINER, so it is not subject to that policy, with the
-- check the policy would have made written out in full: the caller must be
-- signed in, must own the thread, must belong to the organisation it is in,
-- and the thread must still be live.
--
-- It returns the title it cleared, so the caller can name the thread in the
-- audit entry without reading a row it is no longer allowed to see. Null means
-- nothing was cleared — not yours, not there, or already gone — and the caller
-- cannot tell which, which is the same answer the read policy would give.
create or replace function public.clear_conversation(p_conversation_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := (select auth.uid());
  cleared text;
begin
  if caller is null then
    return null;
  end if;

  update public.ai_conversations
     set deleted_at = now()
   where id = p_conversation_id
     and user_id = caller
     and deleted_at is null
     and amryn.is_member(organisation_id)
  returning title into cleared;

  return cleared;
end;
$$;

comment on function public.clear_conversation(uuid) is
  'Clears one of your own assistant threads out of your list by setting deleted_at. SECURITY DEFINER because the read policy hides the result, which Postgres will not let an ordinary update produce. Returns the title cleared, or null if there was nothing to clear.';

revoke all on function public.clear_conversation(uuid) from public, anon;
grant execute on function public.clear_conversation(uuid) to authenticated;

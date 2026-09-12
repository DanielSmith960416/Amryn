-- ═══════════════════════════════════════════════════════════════════════════
-- 45 — the assistant's conversation list
--
-- The assistant has held threads since migration 03. What it never had was a
-- list: the page opened the single most recent conversation and there was no
-- way to reach any other, rename one, or put one away. Three additive changes
-- make a list possible. No table is created, no column is dropped, no policy
-- is rewritten.
--
-- ── why a column rather than a delete ─────────────────────────────────────
-- "Clear this conversation" could have been a delete: the rows are the
-- reader's own, and `on delete cascade` from ai_conversations would take the
-- messages with it. It is not, for the same reason nothing else here is.
-- Every other record of what somebody did in this product survives being
-- dismissed — the audit log exists precisely so that "it was removed" is
-- itself a fact with a time on it. A thread deleted outright takes with it the
-- questions asked, the figures cited in the answers, and any proposal still
-- pointing at it (migration 32 keeps a `conversation_id` on proposals), and
-- leaves no record that it ever existed.
--
-- So the row is marked and filtered out. The reader's list is theirs to
-- curate; the record is not theirs to destroy, and it is not ours to destroy
-- on their behalf without saying so.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. the mark ───────────────────────────────────────────────────────────
alter table public.ai_conversations
  add column if not exists deleted_at timestamptz;

comment on column public.ai_conversations.deleted_at is
  'When the reader cleared this thread out of their list. The thread and its messages are kept; every list query filters on this being null.';

-- ── 2. the index the list reads through ───────────────────────────────────
--
-- Partial, because the list only ever asks for the live ones, and a partial
-- index is both smaller and the one the planner can use for `deleted_at is
-- null` without a second condition to evaluate per row.
--
-- ai_conversations_user_idx (migration 03) stays exactly as it is: it serves
-- the same two leading columns for anything that does want every thread,
-- which includes this migration's own soft-deleted rows.
create index if not exists ai_conversations_live_idx
  on public.ai_conversations (user_id, updated_at desc)
  where deleted_at is null;

-- ── 3. the bump that was missing ──────────────────────────────────────────
--
-- `updated_at` is maintained by amryn.touch_updated_at, attached before update
-- on seventeen tables in migration 06 — including this one. Before *update*.
-- A new message is an insert into a different table, so it moved nothing, and
-- a thread's updated_at has until now meant "when its title last changed".
--
-- Nothing read it, so nothing was visibly wrong. A list sorted by
-- `updated_at desc` reads it constantly, and would have put the conversation
-- you just spoke in wherever its title was last edited — which for every
-- thread the assistant opens by itself is the moment it was created, so the
-- order would have looked almost right and been wrong.
--
-- A trigger rather than a line in the action that inserts the message:
-- messages are written from the web application today and from the worker
-- when a queued answer lands, and the two would have to remember separately.
--
-- security definer, because the worker writes as the service role and the web
-- application as the reader: with neither able to satisfy the other's policy
-- on ai_conversations, an invoker-rights update would be filtered to zero rows
-- for one of them and silently do nothing. It can reach exactly one row — the
-- parent of the message just inserted — and change exactly one column.
create or replace function amryn.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ai_conversations
     set updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

comment on function amryn.touch_conversation_on_message is
  'Moves a conversation to the top of its own list when a message lands in it. Touches updated_at and nothing else.';

-- `create trigger` has no `if not exists` before PostgreSQL 17, and this
-- migration has to be safe to re-apply — the deploy applies every file in
-- order against a database that may already carry some of them.
drop trigger if exists ai_messages_touch_conversation on public.ai_messages;
create trigger ai_messages_touch_conversation
  after insert on public.ai_messages
  for each row execute function amryn.touch_conversation_on_message();

-- PostgREST answers from a cached copy of the schema and is not told by
-- applying SQL. Without this, everything above exists and stays invisible to
-- the application — which reads exactly like a migration that never ran.
notify pgrst, 'reload schema';

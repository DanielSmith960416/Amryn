-- The assistant's conversation list: what clearing one does, and what it does not.
--
-- Three things are worth asserting and one of them is the reason this
-- migration exists at all:
--
--   · that a message landing in a thread moves that thread to the top of its
--     own list — `updated_at` was maintained only on update of the
--     conversation row, so before migration 45 it meant "when the title last
--     changed" and a list sorted by it would have been quietly wrong;
--   · that the bump works for the worker as well as for the reader, which is
--     the whole reason the trigger is security definer;
--   · that clearing a thread hides it without destroying it, and that it is
--     the reader's own thread they can clear and nobody else's.
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
end $$;

-- ── fixtures ──────────────────────────────────────────────────────────────

set local role postgres;

insert into auth.users (id, email) values
  ('d1111111-1111-1111-1111-111111111111', 'asks@alpha.test'),
  ('d2222222-2222-2222-2222-222222222222', 'colleague@alpha.test');

insert into public.organisations (id, name, slug) values
  ('d0000000-0000-0000-0000-0000000000a1', 'Alpha Trading', 'alpha-trading-threads');

-- Both AI tables carry organisation_id and are not on migration 16's exempt
-- list, so both refuse a write for a lapsed subscription. An active one is a
-- fixture requirement here, not decoration.
insert into public.subscriptions (organisation_id, plan, status) values
  ('d0000000-0000-0000-0000-0000000000a1', 'growth', 'active');

insert into public.organisation_members (organisation_id, user_id, role, scope_kind, scope_ids) values
  ('d0000000-0000-0000-0000-0000000000a1', 'd1111111-1111-1111-1111-111111111111', 'org_admin', 'organisation', '{}'),
  ('d0000000-0000-0000-0000-0000000000a1', 'd2222222-2222-2222-2222-222222222222', 'executive', 'organisation', '{}');

-- ── the column, and its default ───────────────────────────────────────────

select pg_temp.check(
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ai_conversations'
       and column_name = 'deleted_at' and is_nullable = 'YES'
       and column_default is null
  ),
  'a conversation carries a nullable deleted_at with no default'
);

select pg_temp.check(
  exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'ai_conversations_live_idx'
       and indexdef like '%deleted_at IS NULL%'
  ),
  'and the list reads through an index of only the live ones'
);

-- ── a message moves its thread ────────────────────────────────────────────

set local role authenticated;
select pg_temp.act_as('d1111111-1111-1111-1111-111111111111');

-- The ages are set on insert, not by updating afterwards. amryn.touch_updated_at
-- is a *before update* trigger that assigns now() unconditionally, so any
-- value handed to an update is overwritten — there is no backdating a row
-- through the front door, which is the trigger working correctly.
insert into public.ai_conversations (id, organisation_id, user_id, title, updated_at) values
  ('dcccccc1-0000-4000-8000-000000000001', 'd0000000-0000-0000-0000-0000000000a1',
   'd1111111-1111-1111-1111-111111111111', 'Margin by branch', now() - interval '3 days'),
  ('dcccccc2-0000-4000-8000-000000000002', 'd0000000-0000-0000-0000-0000000000a1',
   'd1111111-1111-1111-1111-111111111111', 'Stock cover',      now() - interval '1 day'),
  -- A third, for the answer written with no session at all.
  ('dcccccc3-0000-4000-8000-000000000003', 'd0000000-0000-0000-0000-0000000000a1',
   'd1111111-1111-1111-1111-111111111111', 'Cash position',    now() - interval '9 days');

select pg_temp.check(
  (select deleted_at is null from public.ai_conversations
    where id = 'dcccccc1-0000-4000-8000-000000000001'),
  'a new conversation is not cleared'
);

select pg_temp.check(
  (select id = 'dcccccc2-0000-4000-8000-000000000002' from public.ai_conversations
    where user_id = 'd1111111-1111-1111-1111-111111111111' and deleted_at is null
    order by updated_at desc limit 1),
  'the more recently touched thread is at the top to begin with'
);

insert into public.ai_messages (organisation_id, conversation_id, role, content) values
  ('d0000000-0000-0000-0000-0000000000a1', 'dcccccc1-0000-4000-8000-000000000001',
   'user', 'Which branch lost margin this month?');

select pg_temp.check(
  (select id = 'dcccccc1-0000-4000-8000-000000000001' from public.ai_conversations
    where user_id = 'd1111111-1111-1111-1111-111111111111' and deleted_at is null
    order by updated_at desc limit 1),
  'and asking a question moves that thread to the top, which is what was missing'
);

-- The worker answers as the service role, where auth.uid() is null and no
-- policy on ai_conversations would match. An invoker-rights trigger would
-- update zero rows here and say nothing about it.
set local role postgres;
select pg_temp.act_as(null);

insert into public.ai_messages (organisation_id, conversation_id, role, content, model) values
  ('d0000000-0000-0000-0000-0000000000a1', 'dcccccc3-0000-4000-8000-000000000003',
   'assistant', 'Kimberley, by 4.2 points.', 'test-model');

select pg_temp.check(
  (select updated_at > now() - interval '1 minute' from public.ai_conversations
    where id = 'dcccccc3-0000-4000-8000-000000000003'),
  'an answer written without a session moves its thread too, nine days on'
);

-- ── clearing one ──────────────────────────────────────────────────────────

set local role authenticated;
select pg_temp.act_as('d1111111-1111-1111-1111-111111111111');

update public.ai_conversations
   set deleted_at = now()
 where id = 'dcccccc1-0000-4000-8000-000000000001';

select pg_temp.check(
  not exists (
    select 1 from public.ai_conversations
     where user_id = 'd1111111-1111-1111-1111-111111111111'
       and deleted_at is null
       and id = 'dcccccc1-0000-4000-8000-000000000001'
  ),
  'a cleared thread is gone from the list'
);

select pg_temp.check(
  (select count(*) from public.ai_messages
    where conversation_id = 'dcccccc1-0000-4000-8000-000000000001') = 1,
  'and the question asked in it is still there, because clearing is not deleting'
);

-- ── somebody else's thread ────────────────────────────────────────────────

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222');

update public.ai_conversations
   set deleted_at = now()
 where id = 'dcccccc2-0000-4000-8000-000000000002';

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111');

select pg_temp.check(
  (select deleted_at is null from public.ai_conversations
    where id = 'dcccccc2-0000-4000-8000-000000000002'),
  'a colleague cannot clear a thread that is not theirs'
);

-- Threads are private to the person who held the conversation (migration 05),
-- so the colleague's update matched no rows rather than being refused. Worth
-- asserting from their side too: they cannot even see it.
select pg_temp.act_as('d2222222-2222-2222-2222-222222222222');

select pg_temp.check(
  not exists (select 1 from public.ai_conversations
               where organisation_id = 'd0000000-0000-0000-0000-0000000000a1'),
  'nor read it, which is why the update was a no-op rather than an error'
);

rollback;

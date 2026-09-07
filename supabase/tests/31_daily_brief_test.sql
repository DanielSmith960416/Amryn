-- A brief item that cannot name where it came from is an assertion.
--
-- The requirement is "every item traceable to its source record", and these
-- assertions are about the database refusing rather than the composer
-- remembering. The composer is tested separately and without a schema; this is
-- the half that still holds when somebody adds a sixth section in a hurry.
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

insert into public.organisations (id, name, slug, country_code, currency_code)
values ('c0000000-0000-4000-8000-000000000001', 'Brief Co', 'brief-co', 'ZA', 'ZAR');

set local role postgres;

insert into public.daily_briefs (id, organisation_id, brief_date)
values ('c1000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', date '2026-09-07');

-- ═══════════════════════════════════════════════════════════════════════════
-- The gate
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    insert into public.brief_items
      (brief_id, organisation_id, section, rank, headline, detail, provenance, source_id)
    values ('c1000000-0000-4000-8000-000000000001',
            'c0000000-0000-4000-8000-000000000001', 'today', 1,
            'Do the thing', 'Because of the reason', 'derived',
            'c2000000-0000-4000-8000-000000000001')
  $$, 'source_table'),
  'an item that names no source table is refused');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.brief_items
      (brief_id, organisation_id, section, rank, headline, detail, provenance, source_table)
    values ('c1000000-0000-4000-8000-000000000001',
            'c0000000-0000-4000-8000-000000000001', 'today', 1,
            'Do the thing', 'Because of the reason', 'derived', 'ai_recommendations')
  $$, 'source_id'),
  'and one that names no source row is refused too');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.brief_items
      (brief_id, organisation_id, section, rank, headline, detail, provenance,
       source_table, source_id)
    values ('c1000000-0000-4000-8000-000000000001',
            'c0000000-0000-4000-8000-000000000001', 'today', 1,
            'Do the thing', 'Because of the reason', 'derived', '',
            'c2000000-0000-4000-8000-000000000001')
  $$, 'source_table_check'),
  'an empty source table is not a source — a blank citation is worse than none, because it looks like one');

-- ═══════════════════════════════════════════════════════════════════════════
-- Five, and no more
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.brief_items
  (brief_id, organisation_id, section, rank, headline, detail, provenance, source_table, source_id)
select 'c1000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', 'today', g,
       'Item ' || g, 'Detail ' || g, 'derived', 'ai_recommendations',
       gen_random_uuid()
  from generate_series(1, 5) g;

select pg_temp.check(
  (select count(*) from public.brief_items
    where brief_id = 'c1000000-0000-4000-8000-000000000001') = 5,
  'five items fit');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.brief_items
      (brief_id, organisation_id, section, rank, headline, detail, provenance,
       source_table, source_id)
    values ('c1000000-0000-4000-8000-000000000001',
            'c0000000-0000-4000-8000-000000000001', 'today', 6,
            'One too many', 'Detail', 'derived', 'ai_recommendations',
            gen_random_uuid())
  $$, 'brief_items_rank_check'),
  'a sixth is refused by the rank ceiling — a brief nobody finishes reading is not a state that can exist');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.brief_items
      (brief_id, organisation_id, section, rank, headline, detail, provenance,
       source_table, source_id)
    values ('c1000000-0000-4000-8000-000000000001',
            'c0000000-0000-4000-8000-000000000001', 'radar', 3,
            'Also third', 'Detail', 'fact', 'market_signals', gen_random_uuid())
  $$, 'one_item_per_rank'),
  'and two items cannot share a rank, so "the most important thing" has one answer');

-- ═══════════════════════════════════════════════════════════════════════════
-- The licence rule reaches the brief
-- ═══════════════════════════════════════════════════════════════════════════
--
-- #70 protected the screens. A brief is read by more people than any screen and
-- is forwarded by email, so an unlicensed simulated figure matters more here,
-- not less.

insert into public.daily_briefs (id, organisation_id, brief_date)
values ('c1000000-0000-4000-8000-000000000002',
        'c0000000-0000-4000-8000-000000000001', date '2026-09-08');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.brief_items
      (brief_id, organisation_id, section, rank, headline, detail, provenance,
       source_table, source_id)
    values ('c1000000-0000-4000-8000-000000000002',
            'c0000000-0000-4000-8000-000000000001', 'yesterday', 1,
            'Yesterday was below expectation', 'By quite a lot.', 'simulated',
            'twin_simulations', gen_random_uuid())
  $$, 'simulated_figure_is_licensed'),
  'a simulated figure with no accuracy measurement behind it cannot reach a brief');

insert into public.twin_fidelity
  (id, organisation_id, status, months_available, reason)
values ('c3000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'not_measurable', 0,
        'No history yet. Naming that is the point.');

insert into public.brief_items
  (brief_id, organisation_id, section, rank, headline, detail, provenance,
   source_table, source_id, fidelity_id)
values ('c1000000-0000-4000-8000-000000000002',
        'c0000000-0000-4000-8000-000000000001', 'yesterday', 1,
        'Yesterday was below expectation', 'By quite a lot.', 'simulated',
        'twin_simulations', gen_random_uuid(),
        'c3000000-0000-4000-8000-000000000001');

select pg_temp.check(
  (select count(*) from public.brief_items
    where brief_id = 'c1000000-0000-4000-8000-000000000002') = 1,
  'and one that names a measurement is allowed — including a measurement reading "not measurable", which is a valid thing to name');

select pg_temp.check(
  pg_temp.refused($$
    delete from public.twin_fidelity where id = 'c3000000-0000-4000-8000-000000000001'
  $$, 'brief_items_fidelity_id_fkey'),
  'deleting the measurement a brief rests on fails loudly rather than leaving the figure standing on nothing');

-- ═══════════════════════════════════════════════════════════════════════════
-- One brief per morning
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    insert into public.daily_briefs (organisation_id, brief_date)
    values ('c0000000-0000-4000-8000-000000000001', date '2026-09-07')
  $$, 'one_brief_per_morning'),
  'a second brief for the same morning is refused');

select pg_temp.check(
  pg_temp.refused($$
    update public.daily_briefs
       set emailed_at = now(), email_skipped = 'no mail configured'
     where id = 'c1000000-0000-4000-8000-000000000001'
  $$, 'delivery_is_one_thing_or_the_other'),
  'a brief cannot have both been emailed and been skipped');

-- ═══════════════════════════════════════════════════════════════════════════
-- Nobody writes a brief from a browser
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The worker composes over a direct connection. A brief a reader can edit is a
-- record of what they wish it had found.

reset role;
set local role authenticated;

select pg_temp.check(
  pg_temp.refused($$
    insert into public.daily_briefs (organisation_id, brief_date)
    values ('c0000000-0000-4000-8000-000000000001', date '2026-09-09')
  $$, 'row-level security'),
  'a session cannot compose a brief');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.brief_items
      (brief_id, organisation_id, section, rank, headline, detail, provenance,
       source_table, source_id)
    values ('c1000000-0000-4000-8000-000000000001',
            'c0000000-0000-4000-8000-000000000001', 'today', 4,
            'Made up', 'By a reader', 'fact', 'ai_recommendations', gen_random_uuid())
  $$, 'row-level security'),
  'nor add a line to one');

rollback;

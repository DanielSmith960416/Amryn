-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ — sector scope
--
-- The point being proved: a tender is visible to a customer by default, and
-- disappears only when that customer narrows their own sector scope. Amryn's
-- commercial posture never reaches into a customer's radar.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'ceo@wholesaler.test'),
  ('66666666-6666-6666-6666-666666666666', 'ceo@privateonly.test');

-- Two customers. One takes public work, one has chosen not to.
insert into public.organisations (id, name, slug) values
  ('d0000000-0000-0000-0000-000000000001', 'Wholesaler Co', 'wholesaler');

insert into public.organisations (id, name, slug, sector_scope) values
  ('d0000000-0000-0000-0000-000000000002', 'Private Only Ltd', 'private-only', '{private}');

insert into public.organisation_members (organisation_id, user_id, role, scope_kind) values
  ('d0000000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'executive', 'organisation'),
  ('d0000000-0000-0000-0000-000000000002', '66666666-6666-6666-6666-666666666666', 'executive', 'organisation');

-- The same two opportunities exist for both: one commercial, one a public tender.
insert into public.opportunities (organisation_id, title, kind, sector, summary) values
  ('d0000000-0000-0000-0000-000000000001', 'Weekend delivery gap', 'market_expansion', 'private', 'Uncontested weekend demand.'),
  ('d0000000-0000-0000-0000-000000000001', 'Municipal supply tender', 'tender', 'public', 'A 24-month schools supply tender, reissued.'),
  ('d0000000-0000-0000-0000-000000000002', 'Weekend delivery gap', 'market_expansion', 'private', 'Uncontested weekend demand.'),
  ('d0000000-0000-0000-0000-000000000002', 'Municipal supply tender', 'tender', 'public', 'A 24-month schools supply tender, reissued.');

insert into public.market_signals (organisation_id, kind, sector, title, summary) values
  ('d0000000-0000-0000-0000-000000000001', 'market', 'public', 'Provincial procurement calendar published', 'Supply categories open in the new year.'),
  ('d0000000-0000-0000-0000-000000000002', 'market', 'public', 'Provincial procurement calendar published', 'Supply categories open in the new year.');

create or replace function pg_temp.expect(label text, got bigint, want bigint)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL  %  — expected %, got %', label, want, got;
  end if;
  raise notice 'pass  %', label;
end;
$$;

create or replace function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
end;
$$;

set local role authenticated;

-- ── 1. by default a customer sees tenders ─────────────────────────────────

select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
select pg_temp.expect(
  'a customer sees both opportunities by default',
  (select count(*) from public.opportunities), 2);
select pg_temp.expect(
  'the public tender is among them',
  (select count(*) from public.opportunities where kind = 'tender'), 1);
select pg_temp.expect(
  'public-sector market signals are surfaced too',
  (select count(*) from public.market_signals), 1);

-- ── 2. a customer who narrows their scope stops seeing them ───────────────

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');
select pg_temp.expect(
  'a private-only customer sees only the commercial opportunity',
  (select count(*) from public.opportunities), 1);
select pg_temp.expect(
  'the tender is filtered out for them',
  (select count(*) from public.opportunities where sector = 'public'), 0);
select pg_temp.expect(
  'their public-sector signals are filtered out as well',
  (select count(*) from public.market_signals), 0);

-- ── 3. the setting is the customer's, and it is reversible ────────────────

reset role;
update public.organisations
   set sector_scope = '{private,public,mixed,unknown}'
 where id = 'd0000000-0000-0000-0000-000000000002';
set local role authenticated;

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');
select pg_temp.expect(
  'widening the scope brings the tender back',
  (select count(*) from public.opportunities), 2);

-- ── 4. sector scope narrows, it never widens across tenants ───────────────

select pg_temp.expect(
  'a widened scope still shows nothing from the other organisation',
  (select count(*) from public.opportunities
    where organisation_id = 'd0000000-0000-0000-0000-000000000001'), 0);

-- ── 5. the scope can never be emptied into a radar that shows nothing ─────

reset role;
do $$
begin
  begin
    update public.organisations set sector_scope = '{}'
     where id = 'd0000000-0000-0000-0000-000000000002';
    raise exception 'FAIL  an empty sector scope was accepted';
  exception
    when check_violation then
      raise notice 'pass  an empty sector scope is rejected';
  end;
end;
$$;

rollback;

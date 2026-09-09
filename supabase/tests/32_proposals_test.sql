-- A proposal changes nothing, and the database is what makes that true.
--
-- Change 6 lets the Assistant suggest edits to the Imprint — the record every
-- figure on this platform derives from. The control on that is not the prompt.
-- It is that raising a suggestion and applying one are different rights, and
-- that nothing in this schema applies one on its own.
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

create or replace function pg_temp.refused(stmt text, needle text) returns boolean
language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  if position(lower(needle) in lower(sqlerrm)) > 0 then return true; end if;
  raise exception 'statement failed for an unrelated reason: %', sqlerrm;
end $$;

insert into auth.users (id, email) values
  ('f1111111-1111-4111-8111-111111111111', 'owner@proposalco.test'),
  ('f2222222-2222-4222-8222-222222222222', 'analyst@proposalco.test'),
  ('f3333333-3333-4333-8333-333333333333', 'outsider@elsewhere.test')
  on conflict (id) do nothing;

set local role authenticated;

select pg_temp.act_as('f1111111-1111-4111-8111-111111111111');
select public.create_organisation('Proposal Co', 'proposal-co-test', null, 'ZA', 'ZAR') as org \gset

select pg_temp.act_as('f3333333-3333-4333-8333-333333333333');
select public.create_organisation('Elsewhere', 'elsewhere-prop-test', null, 'ZA', 'ZAR') as other \gset

select set_config('amryn_test.org', :'org', true);

-- An ordinary member who is not an administrator.
reset role;
insert into public.organisation_members (organisation_id, user_id, role, status)
values (:'org'::uuid, 'f2222222-2222-4222-8222-222222222222', 'analyst', 'active');
set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Raising one needs membership; deciding one needs more
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A proposal changes nothing, so a colleague who spots a wrong figure should
-- be able to say so without administrator rights. What needs the rights is
-- saying yes.

select pg_temp.act_as('f2222222-2222-4222-8222-222222222222');

insert into public.proposals
  (id, organisation_id, target_table, target_field, current_value, proposed_value, rationale)
values ('f9000000-0000-4000-8000-000000000001', :'org'::uuid,
        'imprint_layers', 'averageOrderValue', null, '2400',
        'Twelve months of sales records average R2,400 an order; this field is blank.');

select pg_temp.check(
  (select count(*) from public.proposals where organisation_id = :'org'::uuid) = 1,
  'an ordinary member may raise a proposal — it changes nothing, so it needs no special right');

select pg_temp.check(
  (select status from public.proposals where id = 'f9000000-0000-4000-8000-000000000001')
    = 'pending',
  'and it starts pending rather than applied');

-- The analyst cannot accept their own suggestion.
update public.proposals
   set status = 'accepted', decided_at = now(),
       decided_by = 'f2222222-2222-4222-8222-222222222222'
 where id = 'f9000000-0000-4000-8000-000000000001';

select pg_temp.check(
  (select status from public.proposals where id = 'f9000000-0000-4000-8000-000000000001')
    = 'pending',
  'an analyst cannot accept one — the update policy matches no row, so it changes nothing rather than raising');

-- ═══════════════════════════════════════════════════════════════════════════
-- Nobody outside the organisation sees or touches it
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.act_as('f3333333-3333-4333-8333-333333333333');

select pg_temp.check(
  (select count(*) from public.proposals) = 0,
  'an outsider cannot see that a proposal exists');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.proposals
      (organisation_id, target_table, target_field, proposed_value, rationale)
    values (current_setting('amryn_test.org')::uuid,
            'imprint_layers', 'annualRevenue', '1', 'Because I said so.')
  $$, 'row-level security'),
  'nor raise one against a business they do not belong to');

-- ═══════════════════════════════════════════════════════════════════════════
-- What a proposal must say
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.act_as('f1111111-1111-4111-8111-111111111111');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.proposals
      (organisation_id, target_table, target_field, proposed_value, rationale)
    values (current_setting('amryn_test.org')::uuid,
            'imprint_layers', 'annualRevenue', '5000000', '')
  $$, 'proposals_rationale_check'),
  'a proposal with no stated reason is refused — one you can only accept on trust is the opposite of explaining');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.proposals
      (organisation_id, target_table, target_field, current_value, proposed_value, rationale)
    values (current_setting('amryn_test.org')::uuid,
            'imprint_layers', 'annualRevenue', '5000000', '5000000',
            'No change at all.')
  $$, 'proposal_moves_something'),
  'and one that proposes the value already there is refused, because it asks somebody to decide nothing');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.proposals
      (organisation_id, target_table, target_field, proposed_value, rationale)
    values (current_setting('amryn_test.org')::uuid,
            'imprint_layers', 'averageOrderValue', '9999',
            'A second opinion on the same field.')
  $$, 'proposals_one_pending_per_field'),
  'the same field cannot have two proposals waiting — two of them in a list is how people stop reading the list');

-- ═══════════════════════════════════════════════════════════════════════════
-- Deciding
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  pg_temp.refused($$
    update public.proposals set status = 'declined'
     where id = 'f9000000-0000-4000-8000-000000000001'
  $$, 'decided_carries_a_time'),
  'a decision with no moment attached is refused — it cannot be ordered against anything');

update public.proposals
   set status = 'declined', decided_at = now(),
       decided_by = 'f1111111-1111-4111-8111-111111111111',
       decision_note = 'Our order value is seasonal; the twelve-month mean is misleading.'
 where id = 'f9000000-0000-4000-8000-000000000001';

select pg_temp.check(
  (select status from public.proposals where id = 'f9000000-0000-4000-8000-000000000001')
    = 'declined',
  'an administrator may decide one');

-- Declined is not pending, so the field is free for a better-argued proposal.
insert into public.proposals
  (organisation_id, target_table, target_field, current_value, proposed_value, rationale)
values (:'org'::uuid, 'imprint_layers', 'averageOrderValue', null, '2650',
        'Excluding the December peak, the mean is R2,650.');

select pg_temp.check(
  (select count(*) from public.proposals
    where organisation_id = :'org'::uuid and status = 'pending') = 1,
  'and once decided the field is free again, so a better argument can be put');

-- ═══════════════════════════════════════════════════════════════════════════
-- The point of the whole table
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Accepting is what writes. Nothing in this schema does it on a proposal's
-- behalf — no trigger, no rule, no default. If that ever stops being true,
-- this assertion is what says so.

reset role;

select pg_temp.check(
  (select count(*) from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'proposals'
      and not t.tgisinternal
      and t.tgname not in ('proposals_touch', 'proposals_refuse_lapsed')) = 0,
  'nothing on proposals applies one — the only triggers are the timestamp and the lapsed-account guard');

select pg_temp.check(
  (select count(*) from pg_rewrite r
     join pg_class c on c.oid = r.ev_class
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'proposals'
      and r.rulename <> '_RETURN') = 0,
  'and no rewrite rule quietly turns an accepted proposal into a write');

rollback;

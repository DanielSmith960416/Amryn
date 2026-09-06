-- The Imprint: eight layers, gaps that are not blocks, and the backfill.
--
-- The backfill is the reason half this file exists. It runs once, against data
-- the person who wrote it cannot see, and leaves nothing behind when it
-- silently matches nothing — so it is the part of migration 24 most likely to
-- be wrong and least likely to be noticed. Because it is a function rather
-- than eight inline statements, it can be run again here with fixtures in
-- front of it, including the cases that have no straightforward answer.
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
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'aal', 'aal2')::text, true);
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

create or replace function pg_temp.succeeds(stmt text) returns boolean
language plpgsql as $$
begin
  execute stmt;
  return true;
exception when others then
  raise notice 'statement failed: %', sqlerrm;
  return false;
end $$;

-- The state of one layer, as a word. Used throughout below.
create or replace function pg_temp.layer_state(org uuid, l text) returns text
language sql as $$
  select state::text from public.imprint_layers
   where organisation_id = org and layer = l::public.imprint_layer
$$;

insert into auth.users (id, email) values
  ('c1111111-1111-4111-8111-111111111111', 'founder@imprint.test'),
  ('c2222222-2222-4222-8222-222222222222', 'analyst@imprint.test'),
  ('c3333333-3333-4333-8333-333333333333', 'other@imprint.test')
  on conflict (id) do nothing;

set local role authenticated;

select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');
select public.create_organisation('Imprint Co', 'imprint-co', null, 'ZA', 'ZAR') as org \gset
select set_config('amryn_test.org', :'org', true);

select pg_temp.act_as('c3333333-3333-4333-8333-333333333333');
select public.create_organisation('Other Co', 'other-imprint-co', null, 'ZA', 'ZAR') as org \gset
select set_config('amryn_test.other', :'org', true);

set local role postgres;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
insert into public.organisation_members (organisation_id, user_id, role, status)
values (current_setting('amryn_test.org')::uuid,
        'c2222222-2222-4222-8222-222222222222', 'analyst', 'active')
on conflict do nothing;
set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Opening one
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');

select pg_temp.check(
  (select current_layer from public.ensure_imprint(current_setting('amryn_test.org')::uuid))
    = 'identity',
  'an Imprint starts at the first layer');

select pg_temp.check(
  (select count(*) from public.imprint_layers
    where organisation_id = current_setting('amryn_test.org')::uuid) = 8,
  'and all eight layers exist immediately, rather than appearing as they are answered');

set local role postgres;
select pg_temp.check(
  (select count(*) from public.audit_logs
    where organisation_id = current_setting('amryn_test.org')::uuid
      and action = 'imprint.started') = 1,
  'opening one is recorded, once');
set local role authenticated;

-- Rows for every layer from the start is what makes "not started" different
-- from "does not exist". Without them every reader would need its own list of
-- the layers to tell one from the other.
select pg_temp.check(
  (select count(*) from public.imprint_layers
    where organisation_id = current_setting('amryn_test.org')::uuid
      and state = 'unanswered') = 8,
  'all of them unanswered, which is not the same as skipped');

select pg_temp.check(
  (select quality_score is null and scored_at is null
     from public.imprint_records
    where organisation_id = current_setting('amryn_test.org')::uuid),
  'and unscored — null rather than zero, which would read as a bad Imprint rather than an unmeasured one');

select pg_temp.check(
  pg_temp.succeeds(format(
    'select public.ensure_imprint(%L)', current_setting('amryn_test.org'))),
  'calling it again is harmless, because it is called on every page load');

select pg_temp.check(
  (select count(*) from public.imprint_layers
    where organisation_id = current_setting('amryn_test.org')::uuid) = 8,
  'and does not duplicate the layers');

-- The function runs on every page load. If it recorded a start each time, the
-- audit log would be several thousand rows of nothing by the end of the week.
set local role postgres;
select pg_temp.check(
  (select count(*) from public.audit_logs
    where organisation_id = current_setting('amryn_test.org')::uuid
      and action = 'imprint.started') = 1,
  'and does not record a second start — it is called on every page load');
set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Answering, skipping, and gaps
-- ═══════════════════════════════════════════════════════════════════════════

update public.imprint_layers
   set state = 'answered', answered_at = now(),
       answers = '{"industry": "Wholesale", "headcountBand": "11-50"}'::jsonb,
       gaps = array['fiscalYearStart']
 where organisation_id = current_setting('amryn_test.org')::uuid and layer = 'identity';

select pg_temp.check(
  (select gaps = array['fiscalYearStart'] and state = 'answered'
     from public.imprint_layers
    where organisation_id = current_setting('amryn_test.org')::uuid and layer = 'identity'),
  'a layer can be answered and still record what was left blank — gaps, not blocks');

-- The constraint that stops a layer claiming to be answered with no time on
-- it. Without it "answered" and "answered when" can disagree, and the Quality
-- Score reads a completeness it cannot date.
select pg_temp.check(
  pg_temp.refused(format($$
    update public.imprint_layers set state = 'answered', answered_at = null
     where organisation_id = %L and layer = 'offer'
  $$, current_setting('amryn_test.org')), 'answered_carries_a_time'),
  'a layer cannot be answered without saying when');

select pg_temp.check(
  pg_temp.succeeds(format($$
    update public.imprint_layers set state = 'skipped'
     where organisation_id = %L and layer = 'digital'
  $$, current_setting('amryn_test.org'))),
  'but it can be skipped, which needs no time and is a real answer');

-- A score has to be datable, for the same reason.
select pg_temp.check(
  pg_temp.refused(format($$
    update public.imprint_records set quality_score = 62
     where organisation_id = %L
  $$, current_setting('amryn_test.org')), 'scored_carries_a_time'),
  'and a Quality Score cannot be stored without one either, so a stale score is visible as stale');

select pg_temp.check(
  pg_temp.succeeds(format($$
    update public.imprint_records set quality_score = 62, scored_at = now()
     where organisation_id = %L
  $$, current_setting('amryn_test.org'))),
  'with a time, it stores');

select pg_temp.check(
  pg_temp.refused(format($$
    update public.imprint_records set quality_score = 140, scored_at = now()
     where organisation_id = %L
  $$, current_setting('amryn_test.org')), 'quality_score'),
  'and it cannot be outside nought to a hundred');

-- ═══════════════════════════════════════════════════════════════════════════
-- Finishing
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  (select completed_at is not null and initialised_at is not null
     from public.complete_imprint(current_setting('amryn_test.org')::uuid)),
  'an administrator can complete the Imprint');

set local role postgres;
select pg_temp.check(
  (select count(*) from public.audit_logs
    where organisation_id = current_setting('amryn_test.org')::uuid
      and action = 'imprint.completed') = 1,
  'and it is recorded, in the same transaction as the completion');
set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Who may touch it
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.act_as('c2222222-2222-4222-8222-222222222222');

select pg_temp.check(
  (select count(*) from public.imprint_layers
    where organisation_id = current_setting('amryn_test.org')::uuid) = 8,
  'every member can see how far the Imprint has got');

-- An analyst has no manage_organisation, so the write policy matches no row.
-- Not refused — an UPDATE with no policy behind it reaches nothing and reports
-- success, which is the quieter failure and the one worth asserting for.
select pg_temp.check(
  pg_temp.succeeds(format($$
    update public.imprint_layers set answers = '{"tampered": true}'::jsonb
     where organisation_id = %L
  $$, current_setting('amryn_test.org')))
  and (select count(*) from public.imprint_layers
        where organisation_id = current_setting('amryn_test.org')::uuid
          and answers ? 'tampered') = 0,
  'but somebody without manage_organisation changes nothing in it');

select pg_temp.check(
  pg_temp.refused(format(
    'select public.complete_imprint(%L)', current_setting('amryn_test.org')),
    'only an administrator'),
  'and cannot complete it');

select pg_temp.act_as('c3333333-3333-4333-8333-333333333333');

select pg_temp.check(
  (select count(*) from public.imprint_layers
    where organisation_id = current_setting('amryn_test.org')::uuid) = 0,
  'another organisation sees none of it');

select pg_temp.check(
  pg_temp.refused(format(
    'select public.ensure_imprint(%L)', current_setting('amryn_test.org')),
    'not a member'),
  'and cannot open one against somebody else''s organisation');

-- ═══════════════════════════════════════════════════════════════════════════
-- The backfill
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Four organisations, each a case the mapping has to get right. They are given
-- an old record and no Imprint, and then the migration's own function is run
-- over them — not a copy of it written for the test, which could agree with
-- itself while disagreeing with what production ran.

set local role postgres;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

insert into public.organisations (id, name, slug, country_code, currency_code) values
  ('d1111111-1111-4111-8111-111111111111', 'Finished Co',  'finished-co',  'ZA', 'ZAR'),
  ('d2222222-2222-4222-8222-222222222222', 'Half Co',      'half-co',      'ZA', 'ZAR'),
  ('d3333333-3333-4333-8333-333333333333', 'Skipper Co',   'skipper-co',   'ZA', 'ZAR'),
  ('d4444444-4444-4444-8444-444444444444', 'Untouched Co', 'untouched-co', 'ZA', 'ZAR');

-- Answered everything.
insert into public.onboarding_progress
  (organisation_id, current_step, completed_steps, skipped_steps, answers, completed_at)
values
  ('d1111111-1111-4111-8111-111111111111', 'review',
   array['identity','structure','objectives','systems','data','market'],
   '{}',
   '{"identity": {"headcountBand": "11-50"}}'::jsonb,
   now()),
-- Answered the objectives and never got to the market: Intent is fed by both,
-- and half of it is neither answered nor skipped.
  ('d2222222-2222-4222-8222-222222222222', 'market',
   array['identity','objectives'], '{}', '{}'::jsonb, null),
-- Skipped what could be skipped.
  ('d3333333-3333-4333-8333-333333333333', 'review',
   array['identity'],
   array['structure','systems','data','objectives','market'],
   '{}'::jsonb, null),
-- Started and did nothing.
  ('d4444444-4444-4444-8444-444444444444', 'identity', '{}', '{}', '{}'::jsonb, null);

select amryn.backfill_imprint_from_onboarding() as brought \gset

select pg_temp.check(
  :'brought'::integer = 4,
  'the backfill brings across every organisation that had an old record');

select pg_temp.check(
  (select count(*) from public.imprint_layers
    where organisation_id = 'd1111111-1111-4111-8111-111111111111') = 8,
  'each of them gets all eight layers');

-- The straightforward mapping.
select pg_temp.check(
  pg_temp.layer_state('d1111111-1111-4111-8111-111111111111', 'identity')   = 'answered'
  and pg_temp.layer_state('d1111111-1111-4111-8111-111111111111', 'location')   = 'answered'
  and pg_temp.layer_state('d1111111-1111-4111-8111-111111111111', 'operations') = 'answered'
  and pg_temp.layer_state('d1111111-1111-4111-8111-111111111111', 'commercial') = 'answered',
  'an answered step becomes an answered layer');

select pg_temp.check(
  (select answers -> 'headcountBand' = '"11-50"'::jsonb
     from public.imprint_layers
    where organisation_id = 'd1111111-1111-4111-8111-111111111111' and layer = 'identity'),
  'and what was said in it comes across, rather than the layer being marked answered and left empty');

select pg_temp.check(
  pg_temp.layer_state('d1111111-1111-4111-8111-111111111111', 'intent') = 'answered',
  'Intent is answered when both the steps that feed it were');

-- The three questions nobody was ever asked.
select pg_temp.check(
  pg_temp.layer_state('d1111111-1111-4111-8111-111111111111', 'offer')     = 'unanswered'
  and pg_temp.layer_state('d1111111-1111-4111-8111-111111111111', 'customers') = 'unanswered'
  and pg_temp.layer_state('d1111111-1111-4111-8111-111111111111', 'digital')   = 'unanswered',
  'Offer, Customers and Digital start unanswered even for a finished Imprint — they were never asked');

-- The case with no straightforward answer.
select pg_temp.check(
  pg_temp.layer_state('d2222222-2222-4222-8222-222222222222', 'intent') = 'unanswered',
  'half of Intent is neither answered nor skipped, which is the truthful reading');

select pg_temp.check(
  pg_temp.layer_state('d3333333-3333-4333-8333-333333333333', 'location')   = 'skipped'
  and pg_temp.layer_state('d3333333-3333-4333-8333-333333333333', 'operations') = 'skipped'
  and pg_temp.layer_state('d3333333-3333-4333-8333-333333333333', 'commercial') = 'skipped'
  and pg_temp.layer_state('d3333333-3333-4333-8333-333333333333', 'intent')     = 'skipped',
  'a skipped step becomes a skipped layer, and both the steps feeding Intent were skipped');

select pg_temp.check(
  (select count(*) from public.imprint_layers
    where organisation_id = 'd4444444-4444-4444-8444-444444444444'
      and state = 'unanswered') = 8,
  'an organisation that started and did nothing arrives with nothing claimed');

select pg_temp.check(
  (select count(*) from public.imprint_records
    where organisation_id = 'd1111111-1111-4111-8111-111111111111'
      and quality_score is null) = 1,
  'and nothing is scored, because the score is defined over fields the old record never held');

-- ── running it twice ─────────────────────────────────────────────────────
--
-- The migration calls this once, but a re-run is exactly what happens when
-- somebody re-applies a migration against a database that already has it, or
-- when the same statement is pasted into a console to check something. It must
-- not overwrite what a customer has said since.
update public.imprint_layers
   set answers = '{"headcountBand": "201-1000"}'::jsonb, answered_at = now()
 where organisation_id = 'd1111111-1111-4111-8111-111111111111' and layer = 'identity';

update public.imprint_layers
   set state = 'answered', answered_at = now(), answers = '{"since": true}'::jsonb
 where organisation_id = 'd2222222-2222-4222-8222-222222222222' and layer = 'intent';

select amryn.backfill_imprint_from_onboarding() as again \gset

select pg_temp.check(
  :'again'::integer = 0,
  'a second run brings across nobody new');

select pg_temp.check(
  (select answers -> 'headcountBand' = '"201-1000"'::jsonb
     from public.imprint_layers
    where organisation_id = 'd1111111-1111-4111-8111-111111111111' and layer = 'identity'),
  'and does not overwrite a corrected answer with the one it used to be');

select pg_temp.check(
  pg_temp.layer_state('d2222222-2222-4222-8222-222222222222', 'intent') = 'answered'
  and (select answers ? 'since' from public.imprint_layers
        where organisation_id = 'd2222222-2222-4222-8222-222222222222' and layer = 'intent'),
  'nor un-answer a layer the customer has since answered themselves');

-- Nothing about the old record is disturbed by any of this. It is still there,
-- unread, until a later migration removes it deliberately and with a backup.
select pg_temp.check(
  (select count(*) from public.onboarding_progress) = 4,
  'the record it was brought across from is left exactly as it was');

select pg_temp.check(
  not has_function_privilege('authenticated', 'amryn.backfill_imprint_from_onboarding()', 'EXECUTE'),
  'and no signed-in caller can run the backfill');

reset role;
rollback;

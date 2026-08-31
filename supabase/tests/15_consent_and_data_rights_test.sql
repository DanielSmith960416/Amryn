-- Consent, and the requests a person can make about their own information.
--
-- Two things are being checked. First that consent given at sign-up survives
-- the gap before a profile exists — which is where it would quietly be lost,
-- because the account is created and the person then disappears into their
-- inbox to confirm an address. Second that a request to exercise a POPIA right
-- is visible to the person who made it and to nobody else, their employer
-- included.
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

-- ── consent carried through sign-up ──────────────────────────────────────
--
-- The account is created with the acceptance in its metadata, exactly as the
-- sign-up action writes it, and with no profile row yet.

insert into auth.users (id, email, raw_user_meta_data) values
  ('e5555555-5555-4555-8555-555555555555', 'consenting@highveld.test',
   jsonb_build_object(
     'full_name', 'Thandi Mokoena',
     'terms_version', '2026-08-31',
     'terms_accepted_at', '2026-08-31T09:00:00Z',
     'privacy_version', '2026-08-31',
     'privacy_accepted_at', '2026-08-31T09:00:00Z')),
  ('f6666666-6666-4666-8666-666666666666', 'colleague@highveld.test', '{}'::jsonb),
  ('a7777777-7777-4777-8777-777777777777', 'boss@highveld.test', '{}'::jsonb)
  on conflict (id) do nothing;

delete from public.user_profiles
where id = 'e5555555-5555-4555-8555-555555555555';

set local role authenticated;
select pg_temp.act_as('e5555555-5555-4555-8555-555555555555');
select public.ensure_user_profile();

select pg_temp.check(
  (select terms_version = '2026-08-31' and privacy_version = '2026-08-31'
     and terms_accepted_at is not null and privacy_accepted_at is not null
   from public.user_profiles where id = 'e5555555-5555-4555-8555-555555555555'),
  'consent given at sign-up reaches the profile created on first sign-in');

-- A later acceptance must not be undone by signing in again, which would
-- silently roll the record back to whatever was captured at sign-up.
update public.user_profiles
   set terms_version = '2027-01-01', terms_accepted_at = now()
 where id = 'e5555555-5555-4555-8555-555555555555';

select public.ensure_user_profile();

select pg_temp.check(
  (select terms_version = '2027-01-01'
   from public.user_profiles where id = 'e5555555-5555-4555-8555-555555555555'),
  'accepting a newer version is not overwritten on the next sign-in');

-- ── the addendum is recorded against the organisation ────────────────────
select public.create_organisation('Highveld Consent Co', 'highveld-consent-test', null, 'ZA', 'ZAR') as org \gset

update public.organisations
   set dpa_accepted_at = now(),
       dpa_version = '2026-08-31',
       dpa_accepted_by = 'e5555555-5555-4555-8555-555555555555'
 where id = :'org'::uuid;

select pg_temp.check(
  (select dpa_version = '2026-08-31' and dpa_accepted_by is not null
   from public.organisations where id = :'org'::uuid),
  'an administrator can record the addendum for their own organisation');

-- ── a request belongs to the person who made it ──────────────────────────
insert into public.data_requests (user_id, kind, note)
values ('e5555555-5555-4555-8555-555555555555', 'deletion', 'Please remove my contact details.');

select pg_temp.check(
  (select count(*) from public.data_requests) = 1,
  'a person can see the request they made');

-- Nobody may file a request in somebody else's name: a deletion request
-- attributed to a colleague would be a way to have their records destroyed.
do $$
begin
  insert into public.data_requests (user_id, kind)
  values ('f6666666-6666-4666-8666-666666666666', 'deletion');
  raise exception 'FAIL  a request was filed in another person''s name';
exception when insufficient_privilege then
  raise notice 'pass  a request cannot be filed in another person''s name';
end $$;

-- The employer is deliberately not a reader here. An administrator who can see
-- that an employee asked to have their information deleted is a reason for the
-- employee not to ask.
select set_config('amryn_test.consent_org', :'org', true);
select pg_temp.act_as('a7777777-7777-4777-8777-777777777777');

do $$
declare
  admin_id uuid := 'a7777777-7777-4777-8777-777777777777';
begin
  -- Make the boss a genuine administrator of the same organisation, so the
  -- assertion below is about the policy rather than about the absence of a
  -- membership.
  set local role postgres;
  insert into public.organisation_members (organisation_id, user_id, role, status)
  values (current_setting('amryn_test.consent_org')::uuid, admin_id, 'org_admin', 'active')
  on conflict do nothing;
  set local role authenticated;
end $$;

-- Proving the membership took, so that the assertion below is about the policy
-- rather than about an outsider who could never have read it anyway.
select pg_temp.check(
  (select count(*) from public.organisation_members
    where organisation_id = current_setting('amryn_test.consent_org')::uuid
      and user_id = 'a7777777-7777-4777-8777-777777777777'
      and role = 'org_admin' and status = 'active') = 1,
  'the administrator really is an active administrator of that organisation');

select pg_temp.check(
  (select count(*) from public.data_requests) = 0,
  'an administrator of the same organisation cannot read a member''s request');

-- And it cannot be edited away. There is no update policy at all, so a request
-- once made stays made until whoever handles it resolves it outside this
-- interface.
select pg_temp.act_as('e5555555-5555-4555-8555-555555555555');

do $$
begin
  update public.data_requests set status = 'completed';
  if found then
    raise exception 'FAIL  a request could be marked completed by the person who made it';
  end if;
  raise notice 'pass  a request cannot be closed by the person who made it';
end $$;

rollback;

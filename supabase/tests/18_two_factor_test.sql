-- Two-factor authentication, enforced where the data is.
--
-- The interesting assertions here are the ones about a session that has *not*
-- presented a second factor. Redirecting such a session to a verification page
-- is worth doing and proves nothing: the same session carries a token that
-- speaks to PostgREST directly, so the question is whether the database
-- refuses it, not whether the interface hides it.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.check(ok boolean, what text) returns void
language plpgsql as $$
begin
  if ok then raise notice 'pass  %', what;
  else raise exception 'FAIL  %', what; end if;
end $$;

-- Impersonation, at a stated assurance level. Every call has to say which,
-- because "signed in" is no longer one state.
create or replace function pg_temp.act_as(uid uuid, aal text default 'aal1')
returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'aal', aal)::text,
    true);
end $$;

insert into auth.users (id, email) values
  ('e1111111-1111-4111-8111-111111111111', 'careful@twofactor.test'),
  ('e2222222-2222-4222-8222-222222222222', 'relaxed@twofactor.test')
  on conflict (id) do nothing;

set local role authenticated;

-- Two people in one organisation. One will turn two-factor on; the other will
-- not, which is the case that must keep working unchanged.
select pg_temp.act_as('e1111111-1111-4111-8111-111111111111', 'aal2');
select public.create_organisation('Two Factor Co', 'two-factor-co', null, 'ZA', 'ZAR') as org \gset
select set_config('amryn_test.tf_org', :'org', true);

set local role postgres;
insert into public.organisation_members (organisation_id, user_id, role, status)
values (:'org'::uuid, 'e2222222-2222-4222-8222-222222222222', 'analyst', 'active')
on conflict do nothing;
set local role authenticated;

-- ── nobody has it on yet: aal1 is fine ───────────────────────────────────
--
-- The guard must not inconvenience anyone who has not asked for it. This is
-- the assertion that a badly written check would fail by locking out the whole
-- customer base on the day it shipped.
select pg_temp.act_as('e1111111-1111-4111-8111-111111111111', 'aal1');

select pg_temp.check(
  amryn.mfa_satisfied(),
  'someone without a second factor is not asked for one');

select pg_temp.check(
  (select count(*) from public.organisations
    where id = current_setting('amryn_test.tf_org')::uuid) = 1,
  'and reads their organisation at aal1, exactly as before');

-- ── turn it on ───────────────────────────────────────────────────────────
update public.user_profiles
   set mfa_enabled = true, mfa_enabled_at = now()
 where id = 'e1111111-1111-4111-8111-111111111111';

-- ── the same session is now refused ──────────────────────────────────────
--
-- Same person, same valid token, same query. Nothing about the session
-- changed; what changed is that they now have a factor they have not presented.
select pg_temp.check(
  not amryn.mfa_satisfied(),
  'with a factor enrolled, an aal1 session does not satisfy the guard');

select pg_temp.check(
  (select count(*) from public.organisations
    where id = current_setting('amryn_test.tf_org')::uuid) = 0,
  'and the database refuses their organisation to that session');

select pg_temp.check(
  (select count(*) from public.audit_logs
    where organisation_id = current_setting('amryn_test.tf_org')::uuid) = 0,
  'and every other table behind is_member() with it');

select pg_temp.check(
  not amryn.has_permission(current_setting('amryn_test.tf_org')::uuid, 'manage_users'),
  'and holds no permission, whatever their role says');

-- What must still work: the interface has to be able to render the page that
-- explains the second step, and that page needs to know who they are.
select pg_temp.check(
  (select count(*) from public.user_profiles
    where id = 'e1111111-1111-4111-8111-111111111111') = 1,
  'they can still read their own profile, or nothing could tell them why');

select pg_temp.check(
  (select count(*) from public.organisation_members
    where user_id = 'e1111111-1111-4111-8111-111111111111') = 1,
  'and their own membership, which is how the app knows where to send them');

-- ── present the factor ───────────────────────────────────────────────────
select pg_temp.act_as('e1111111-1111-4111-8111-111111111111', 'aal2');

select pg_temp.check(
  amryn.mfa_satisfied(),
  'presenting the second factor satisfies the guard');

select pg_temp.check(
  (select count(*) from public.organisations
    where id = current_setting('amryn_test.tf_org')::uuid) = 1,
  'and the same query now returns the organisation');

-- ── one person turning it on does not affect another ─────────────────────
select pg_temp.act_as('e2222222-2222-4222-8222-222222222222', 'aal1');

select pg_temp.check(
  (select count(*) from public.organisations
    where id = current_setting('amryn_test.tf_org')::uuid) = 1,
  'a colleague who has not turned it on is unaffected');

-- ── recovery codes ───────────────────────────────────────────────────────
select pg_temp.act_as('e1111111-1111-4111-8111-111111111111', 'aal2');

select public.replace_recovery_codes(array[
  encode(digest('code-one', 'sha256'), 'hex'),
  encode(digest('code-two', 'sha256'), 'hex')
]);

select pg_temp.check(
  (select count(*) from public.mfa_recovery_codes
    where user_id = 'e1111111-1111-4111-8111-111111111111') = 2,
  'recovery codes are issued');

select pg_temp.check(
  (select count(*) from public.mfa_recovery_codes where code_hash = 'code-one') = 0,
  'and stored as hashes, never as the code itself');

-- Issuing again replaces rather than adds: a set printed two years ago must
-- stop working the moment a new one is generated.
select public.replace_recovery_codes(array[encode(digest('code-three', 'sha256'), 'hex')]);

select pg_temp.check(
  (select count(*) from public.mfa_recovery_codes
    where user_id = 'e1111111-1111-4111-8111-111111111111') = 1,
  'a fresh set replaces the old one rather than adding to it');

-- ── spending one ─────────────────────────────────────────────────────────
--
-- Redeeming is not a sign-in. It removes the requirement, so the two things
-- needed to get back in are the password and a code — still two factors.
select pg_temp.act_as('e1111111-1111-4111-8111-111111111111', 'aal1');

select pg_temp.check(
  public.redeem_recovery_code(encode(digest('wrong-code', 'sha256'), 'hex')) = false,
  'a code that was never issued is refused');

select pg_temp.check(
  public.redeem_recovery_code(encode(digest('code-three', 'sha256'), 'hex')) = true,
  'a real code is accepted');

select pg_temp.check(
  public.redeem_recovery_code(encode(digest('code-three', 'sha256'), 'hex')) = false,
  'and cannot be spent twice');

select pg_temp.check(
  (select not mfa_enabled from public.user_profiles
    where id = 'e1111111-1111-4111-8111-111111111111'),
  'spending one clears the requirement, so the account is reachable again');

select pg_temp.check(
  amryn.mfa_satisfied(),
  'and the aal1 session it was redeemed from can now read again');

-- ── a code cannot be minted or un-spent by its owner ─────────────────────
do $$
begin
  insert into public.mfa_recovery_codes (user_id, code_hash)
  values ('e1111111-1111-4111-8111-111111111111', 'a-code-i-made-up');
  raise exception 'FAIL  a caller minted themselves a recovery code';
exception when insufficient_privilege then
  raise notice 'pass  a caller cannot mint themselves a recovery code';
end $$;

-- Deliberately not written as "the update affected no rows": that would pass
-- just as well if the row were simply invisible, which is a different and
-- weaker guarantee. The privilege has to be the thing that refuses.
do $$
begin
  update public.mfa_recovery_codes set used_at = null;
  raise exception 'FAIL  a spent recovery code was un-spent, or the update was merely empty';
exception when insufficient_privilege then
  raise notice 'pass  a spent code cannot be un-spent — the privilege is not there';
end $$;

-- ── and nobody reads anybody else's ──────────────────────────────────────
select pg_temp.act_as('e2222222-2222-4222-8222-222222222222', 'aal1');

select pg_temp.check(
  (select count(*) from public.mfa_recovery_codes) = 0,
  'a colleague sees none of them, not even that they exist');

-- ── a background job carries no token at all ─────────────────────────────
--
-- The service role runs ingestion outside any session. auth.uid() is null
-- there, so the guard must not read that as "someone with a factor who has not
-- presented it" and stop the platform's own work.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select pg_temp.check(
  amryn.mfa_satisfied(),
  'a job with no session is not asked for a second factor');

rollback;

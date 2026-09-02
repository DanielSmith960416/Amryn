-- Invitations: the record that lets somebody join an organisation they are not
-- yet a member of. The token in the link is a credential, and most of what is
-- asserted here is that it behaves like one.
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

-- ── two organisations, an admin in each, and an outsider ─────────────────
insert into auth.users (id, email) values
  ('a1111111-1111-4111-8111-111111111111', 'owner@highveld.test'),
  ('b2222222-2222-4222-8222-222222222222', 'newjoiner@highveld.test'),
  ('c3333333-3333-4333-8333-333333333333', 'stranger@elsewhere.test'),
  ('d4444444-4444-4444-8444-444444444444', 'rival@other.test')
  on conflict (id) do nothing;

set local role authenticated;

select pg_temp.act_as('a1111111-1111-4111-8111-111111111111');
select public.create_organisation('Highveld Supply Co', 'highveld-inv-test', null, 'ZA', 'ZAR') as org \gset

select pg_temp.act_as('d4444444-4444-4444-8444-444444444444');
select public.create_organisation('Rival Traders', 'rival-inv-test', null, 'ZA', 'ZAR') as rival \gset

-- ── only someone who manages members may write an invitation ─────────────
select pg_temp.act_as('a1111111-1111-4111-8111-111111111111');

insert into public.organisation_invitations (organisation_id, email, role, token_hash, invited_by)
values (:'org'::uuid, 'newjoiner@highveld.test', 'analyst',
        encode(digest('token-for-newjoiner', 'sha256'), 'hex'),
        'a1111111-1111-4111-8111-111111111111');

select pg_temp.check(
  (select count(*) from public.organisation_invitations where organisation_id = :'org'::uuid) = 1,
  'an administrator can invite someone to their own organisation');

-- The rival administrator manages members — in their own organisation. A psql
-- variable cannot be read inside a DO block, so the id is carried through a
-- setting.
select set_config('amryn_test.other_org', :'org', true);
select pg_temp.act_as('d4444444-4444-4444-8444-444444444444');

do $$
begin
  insert into public.organisation_invitations (organisation_id, email, role, token_hash)
  values (current_setting('amryn_test.other_org')::uuid, 'mole@rival.test', 'org_admin',
          encode(digest('mole-token', 'sha256'), 'hex'));
  raise exception 'FAIL  an outsider wrote an invitation into another organisation';
exception when insufficient_privilege then
  raise notice 'pass  an administrator cannot invite into an organisation they do not manage';
end $$;

select pg_temp.check(
  (select count(*) from public.organisation_invitations) = 0,
  'and cannot even see that organisation''s invitations');

-- ── the token is never stored ────────────────────────────────────────────
reset role;
select pg_temp.check(
  (select count(*) from public.organisation_invitations
    where token_hash = 'token-for-newjoiner') = 0,
  'the raw token is not in the table');

select pg_temp.check(
  (select token_hash = encode(digest('token-for-newjoiner', 'sha256'), 'hex')
     from public.organisation_invitations where organisation_id = :'org'::uuid),
  'only its SHA-256 hash is');

-- ── previewing ───────────────────────────────────────────────────────────
set local role anon;
select pg_temp.check(
  (select state from public.invitation_preview('token-for-newjoiner')) = 'open',
  'someone following the link can see it is open before signing in');

select pg_temp.check(
  (select organisation_name from public.invitation_preview('token-for-newjoiner'))
    = 'Highveld Supply Co',
  'and which organisation invited them');

select pg_temp.check(
  (select state from public.invitation_preview('a-token-nobody-issued')) = 'invalid',
  'an unissued token is simply invalid');

-- ── accepting ────────────────────────────────────────────────────────────
set local role authenticated;

-- The wrong person, holding a real link.
select pg_temp.act_as('c3333333-3333-4333-8333-333333333333');
do $$
begin
  perform public.accept_invitation('token-for-newjoiner');
  raise exception 'FAIL  a forwarded link let the wrong person in';
exception when sqlstate '42501' then
  raise notice 'pass  a forwarded link is refused: the invitation is bound to its address';
end $$;

-- Counted outside RLS. Asked as the stranger, this returns zero whether or not
-- a membership was written, because RLS hides what they are not a member of —
-- so the assertion would pass for the wrong reason.
reset role;
select pg_temp.check(
  (select count(*) from public.organisation_members
    where organisation_id = :'org'::uuid) = 1,
  'and no membership was created for them');
set local role authenticated;

-- The right person.
select pg_temp.act_as('b2222222-2222-4222-8222-222222222222');
select public.accept_invitation('token-for-newjoiner') as joined \gset

select pg_temp.check(:'joined'::uuid = :'org'::uuid, 'the invited person joins the right organisation');

select pg_temp.check(
  (select role = 'analyst' and status = 'active' and scope_kind = 'organisation'
     from public.organisation_members
    where organisation_id = :'org'::uuid
      and user_id = 'b2222222-2222-4222-8222-222222222222'),
  'with the role the invitation recorded, not one they chose');

-- Outside RLS again: the joiner is an analyst, and reading invitations needs
-- manage_users, so asking as them would return no row and fail for the wrong
-- reason. That they cannot see it is asserted separately, at the end.
reset role;
select pg_temp.check(
  (select accepted_by = 'b2222222-2222-4222-8222-222222222222' and accepted_at is not null
     from public.organisation_invitations where organisation_id = :'org'::uuid),
  'and the invitation is marked accepted, by them');
set local role authenticated;
select pg_temp.act_as('b2222222-2222-4222-8222-222222222222');

-- Clicking the link twice is not an error.
select pg_temp.check(
  public.accept_invitation('token-for-newjoiner') = :'org'::uuid,
  'following the link again just returns where they were going');

-- But it is spent for anybody else.
select pg_temp.act_as('c3333333-3333-4333-8333-333333333333');
do $$
begin
  perform public.accept_invitation('token-for-newjoiner');
  raise exception 'FAIL  a used invitation was accepted again';
exception when sqlstate '42501' or sqlstate '22023' then
  raise notice 'pass  a used invitation cannot be taken by someone else';
end $$;

-- ── expiry and withdrawal ────────────────────────────────────────────────
reset role;
insert into public.organisation_invitations
  (organisation_id, email, role, token_hash, expires_at)
values
  (:'org'::uuid, 'stranger@elsewhere.test', 'viewer',
   encode(digest('expired-token', 'sha256'), 'hex'), now() - interval '1 day');

set local role authenticated;
select pg_temp.act_as('c3333333-3333-4333-8333-333333333333');
do $$
begin
  perform public.accept_invitation('expired-token');
  raise exception 'FAIL  an expired invitation was accepted';
exception when sqlstate '22023' then
  raise notice 'pass  an expired invitation is refused';
end $$;

reset role;
update public.organisation_invitations set expires_at = now() + interval '7 days', revoked_at = now()
 where token_hash = encode(digest('expired-token', 'sha256'), 'hex');

set local role authenticated;
select pg_temp.act_as('c3333333-3333-4333-8333-333333333333');
do $$
begin
  perform public.accept_invitation('expired-token');
  raise exception 'FAIL  a withdrawn invitation was accepted';
exception when sqlstate '22023' then
  raise notice 'pass  a withdrawn invitation is refused';
end $$;

-- ── signed out ───────────────────────────────────────────────────────────
select pg_temp.act_as(null);
do $$
begin
  perform public.accept_invitation('token-for-newjoiner');
  raise exception 'FAIL  accepted without a session';
exception when sqlstate '42501' then
  raise notice 'pass  accepting requires being signed in';
end $$;

reset role;

-- ── the new member sees the right organisation, and only it ──────────────
set local role authenticated;
select pg_temp.act_as('b2222222-2222-4222-8222-222222222222');

select pg_temp.check(
  (select count(*) from public.organisations) = 1,
  'the joiner sees exactly one organisation');

select pg_temp.check(
  (select name from public.organisations) = 'Highveld Supply Co',
  'and it is the one that invited them, not the rival');

-- An analyst does not manage members, so the invitation list stays hidden.
select pg_temp.check(
  (select count(*) from public.organisation_invitations) = 0,
  'an ordinary member cannot read who else has been invited');

reset role;
rollback;

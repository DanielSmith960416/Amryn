-- The workspace, in one round trip.
--
-- workspace_snapshot() replaces six PostgREST calls on the critical path of
-- every authenticated render. That makes it the most security-sensitive thing
-- to have been added for speed: it reads memberships, organisations, profiles,
-- permissions, subscriptions and entitlements in one statement, so if it
-- leaked it would leak all of them at once.
--
-- The assertions below are therefore of two kinds and both are load-bearing:
-- that it agrees with the queries it replaces, and that a second tenant in the
-- same database gets their own answer and none of the first one's.
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

insert into auth.users (id, email) values
  ('a1111111-1111-4111-8111-111111111111', 'owner@snap.test'),
  ('a2222222-2222-4222-8222-222222222222', 'rival@snap.test'),
  ('a3333333-3333-4333-8333-333333333333', 'scoped@snap.test')
  on conflict (id) do nothing;

set local role authenticated;

select pg_temp.act_as('a1111111-1111-4111-8111-111111111111');
select public.create_organisation('Snap One', 'snap-one', null, 'ZA', 'ZAR') as one \gset
select public.create_organisation('Snap Two', 'snap-two', null, 'ZA', 'ZAR') as two \gset

select pg_temp.act_as('a2222222-2222-4222-8222-222222222222');
select public.create_organisation('Rival Co', 'rival-co', null, 'ZA', 'ZAR') as rival \gset

-- ═══════════════════════════════════════════════════════════════════════════
-- It answers with the workspace the separate queries would have assembled
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.act_as('a1111111-1111-4111-8111-111111111111');
select public.workspace_snapshot(null) as snap \gset

select pg_temp.check(
  (:'snap'::jsonb -> 'organisation' ->> 'id') = :'one',
  'with no preference it opens the organisation joined first');

select pg_temp.check(
  jsonb_array_length(:'snap'::jsonb -> 'organisations') = 2,
  'the switcher is offered both memberships');

select pg_temp.check(
  (:'snap'::jsonb -> 'membership' ->> 'user_id') = 'a1111111-1111-4111-8111-111111111111'
  and (:'snap'::jsonb -> 'membership' ->> 'role') = 'org_admin',
  'the membership row is the caller’s own');

select pg_temp.check(
  (:'snap'::jsonb -> 'profile' ->> 'id') = 'a1111111-1111-4111-8111-111111111111',
  'the profile is the caller’s own');

select pg_temp.check(
  (:'snap'::jsonb -> 'subscription' ->> 'organisation_id') = :'one',
  'the subscription belongs to the organisation being opened');

-- The cookie's choice, honoured — this is the one input the database cannot
-- see for itself, so it is the one that has to be passed in and tested.
select public.workspace_snapshot(:'two'::uuid) as picked \gset
select pg_temp.check(
  (:'picked'::jsonb -> 'organisation' ->> 'id') = :'two',
  'a named organisation is the one opened');

-- A cookie naming somebody else's organisation must not open it, and must not
-- empty the workspace either: the fallback is the caller's own first.
select public.workspace_snapshot(:'rival'::uuid) as spoofed \gset
select pg_temp.check(
  (:'spoofed'::jsonb -> 'organisation' ->> 'id') = :'one',
  'naming an organisation the caller is not in falls back to their own');

-- ═══════════════════════════════════════════════════════════════════════════
-- The permissions agree with the database's own answer
-- ═══════════════════════════════════════════════════════════════════════════
--
-- amryn.has_permission() is what actually enforces every policy. The snapshot
-- computes the same set in one pass for the interface to draw from, and the
-- two disagreeing is how a control appears and then refuses.

select pg_temp.check(
  (select bool_and(amryn.has_permission(:'one'::uuid, k))
     from jsonb_array_elements_text(:'snap'::jsonb -> 'permissions') as t(k)),
  'every permission it reports is one the database grants');

select pg_temp.check(
  (select count(*) from public.role_permissions where role = 'org_admin')
  = jsonb_array_length(:'snap'::jsonb -> 'permissions'),
  'and it reports all of them, not a subset');

-- A revoking override has to take a default away, which a union of the two
-- tables would not do.
select id as member_one from public.organisation_members
  where organisation_id = :'one'::uuid
    and user_id = 'a1111111-1111-4111-8111-111111111111' \gset

insert into public.member_permission_overrides
  (organisation_id, member_id, permission_key, granted)
values (:'one'::uuid, :'member_one'::uuid, 'view_financial_data', false);

select public.workspace_snapshot(:'one'::uuid) as revoked \gset
select pg_temp.check(
  not (:'revoked'::jsonb -> 'permissions' ? 'view_financial_data'),
  'a revoking override removes a permission the role grants');
select pg_temp.check(
  not amryn.has_permission(:'one'::uuid, 'view_financial_data'),
  'and the database agrees, which is the point');

delete from public.member_permission_overrides
  where member_id = :'member_one'::uuid and permission_key = 'view_financial_data';

-- ═══════════════════════════════════════════════════════════════════════════
-- What it includes, and what a second tenant sees instead
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  jsonb_array_length(:'snap'::jsonb -> 'entitlements')
    = (select count(*) from public.entitlements),
  'every entitlement in the catalogue is answered for');

-- The bell. It counts the opened organisation's unread alerts and no other's,
-- which is the assertion worth making: a count is the easiest thing to compute
-- across a join that has lost its tenant.
select pg_temp.check(
  (:'snap'::jsonb ->> 'unread_alerts')::int = 0,
  'a new organisation has nothing unread');

insert into public.alerts (organisation_id, title, severity, status)
values (:'one'::uuid, 'Stock below cover', 'high', 'new'),
       (:'one'::uuid, 'Margin slipped', 'high', 'new'),
       (:'two'::uuid, 'Belongs to the other one', 'high', 'new');

select pg_temp.check(
  (public.workspace_snapshot(:'one'::uuid) ->> 'unread_alerts')::int = 2,
  'the bell counts the opened organisation’s unread alerts');
select pg_temp.check(
  (public.workspace_snapshot(:'two'::uuid) ->> 'unread_alerts')::int = 1,
  'and switching organisation switches the count with it');

select pg_temp.act_as('a2222222-2222-4222-8222-222222222222');
select public.workspace_snapshot(null) as theirs \gset

select pg_temp.check(
  (:'theirs'::jsonb -> 'organisation' ->> 'id') = :'rival',
  'the second tenant is opened in their own organisation');

select pg_temp.check(
  jsonb_array_length(:'theirs'::jsonb -> 'organisations') = 1,
  'and is offered only their own in the switcher');

select pg_temp.check(
  (:'theirs'::jsonb -> 'membership' ->> 'user_id') = 'a2222222-2222-4222-8222-222222222222'
  and (:'theirs'::jsonb -> 'profile' ->> 'id') = 'a2222222-2222-4222-8222-222222222222',
  'with their own membership and their own profile');

-- ═══════════════════════════════════════════════════════════════════════════
-- Nobody, and a session that still owes a second factor
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.act_as('a3333333-3333-4333-8333-333333333333');
select pg_temp.check(
  public.workspace_snapshot(null) is null,
  'a user belonging to nothing gets no workspace rather than an empty one');

-- The guard that matters most, because it is the one this function could have
-- quietly walked around. It is SECURITY INVOKER, so amryn.mfa_satisfied()
-- closes every table it reads to a session that has not presented its factor.
-- A single statement that answered anyway would have undone migration 15 for
-- the sake of a round trip.
select pg_temp.act_as('a1111111-1111-4111-8111-111111111111');
update public.user_profiles set mfa_enabled = true
  where id = 'a1111111-1111-4111-8111-111111111111';

select set_config('request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'aal', 'aal1')::text,
  true);

select pg_temp.check(
  public.workspace_snapshot(null) is null,
  'a session still owing a second factor gets no workspace from it either');

-- And is handed back once the factor is presented, so the refusal above is
-- the guard doing its job rather than the function being broken.
select set_config('request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'aal', 'aal2')::text,
  true);

select pg_temp.check(
  (public.workspace_snapshot(null) -> 'organisation' ->> 'id') is not null,
  'and the same session gets it back once the factor is presented');

rollback;

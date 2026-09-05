-- ═══════════════════════════════════════════════════════════════════════════
-- Test 22 — the paid journey and the team journey, end to end
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Five functions were dead on the hosted database and green here. Each had a
-- correct body, a correct guard and a correct message, and none of them ever
-- reached any of it:
--
--   42883  function digest(text, unknown) does not exist
--   42883  function gen_random_bytes(integer) does not exist
--
-- Between them that was every way to pay for the product and every way to add
-- a colleague. See migration 19 for why: pgcrypto is installed into
-- `extensions` on Supabase and into `public` on a plain PostgreSQL, and these
-- five pin a search_path that named only the second.
--
-- The shim now installs it where Supabase installs it, so the suite runs on
-- the layout that ships. This file is what uses that.
--
-- It asserts the journeys rather than the symbols. A test that only caught
-- 42883 would pass on a database where request_subscription resolved
-- gen_random_bytes and then wrote a reference nobody could pay against; these
-- assertions fail unless the thing the customer needs actually happens.
\set ON_ERROR_STOP on
begin;

-- Production resolves these two schemas and this file must resolve them the
-- same way, because it hashes the tokens it hands to the functions under test.
-- Computing a hash differently from the code being tested would compare two
-- things neither of which is what runs.
set local search_path = public, extensions, pg_temp;

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

create or replace function pg_temp.act_as_operator() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into auth.users (id, email) values
  ('e1111111-1111-4111-8111-111111111111', 'buyer@extensions.test'),
  ('e2222222-2222-4222-8222-222222222222', 'colleague@extensions.test')
  on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- The paid journey: request → confirm → preview → redeem
-- ═══════════════════════════════════════════════════════════════════════════

set local role authenticated;
select pg_temp.act_as('e1111111-1111-4111-8111-111111111111');
select public.create_organisation('Extension Co', 'extension-co', null, 'ZA', 'ZAR') as org \gset
select set_config('amryn_test.org', :'org', true);

-- Step one. This is the call that raised gen_random_bytes(integer) does not
-- exist on every attempt to buy the product.
select public.request_subscription('starter', 1);

-- The reference is what the customer types into their banking app, so an
-- empty or malformed one means the payment cannot be matched to the account
-- even though the request appears to have worked.
select pg_temp.check(
  (select reference ~ '^AMR-[0-9A-F]{8}$'
     from public.subscription_activations
    where organisation_id = current_setting('amryn_test.org')::uuid
      and state = 'awaiting_payment'),
  'requesting a subscription produces a payable reference');

-- Step two, by an operator who has seen the proof of payment. The hash is
-- computed out here exactly as the application computes it; the token itself
-- is never stored.
set local role postgres;
select pg_temp.act_as_operator();

select public.issue_activation(
  (select id from public.subscription_activations
    where organisation_id = current_setting('amryn_test.org')::uuid
      and state = 'awaiting_payment'),
  encode(digest('activation-token-for-test-22', 'sha256'), 'hex'),
  null,
  'EFT received');

-- Step three: what the activation page shows somebody who is not signed in.
-- Possession of the link is the whole authorisation, so this must answer for
-- anon — and answering at all is what it could not do.
set local role anon;
select pg_temp.act_as_operator();

select pg_temp.check(
  (select state from public.activation_preview('activation-token-for-test-22')) = 'ready',
  'a signed-out recipient can see that the activation link is ready');

select pg_temp.check(
  (select state from public.activation_preview('a-token-nobody-issued')) = 'unknown',
  'an invented token is unknown rather than an error');

-- Step four: the customer redeems it and is on the plan they paid for.
set local role authenticated;
select pg_temp.act_as('e1111111-1111-4111-8111-111111111111');
select public.redeem_activation('activation-token-for-test-22');

select pg_temp.check(
  (select plan::text from public.subscriptions
    where organisation_id = current_setting('amryn_test.org')::uuid) = 'starter'
  and (select status::text from public.subscriptions
        where organisation_id = current_setting('amryn_test.org')::uuid) = 'active',
  'redeeming the link puts the organisation on the plan it paid for');

select pg_temp.check(
  (select state from public.subscription_activations
    where organisation_id = current_setting('amryn_test.org')::uuid
      and token_hash = encode(digest('activation-token-for-test-22', 'sha256'), 'hex'))
  = 'activated',
  'the link is spent, so it cannot be redeemed a second time');

-- ═══════════════════════════════════════════════════════════════════════════
-- The team journey: invite → preview → accept
-- ═══════════════════════════════════════════════════════════════════════════

set local role postgres;
select pg_temp.act_as_operator();

insert into public.organisation_invitations
  (organisation_id, email, role, token_hash, invited_by)
values
  (current_setting('amryn_test.org')::uuid, 'colleague@extensions.test', 'analyst',
   encode(digest('invitation-token-for-test-22', 'sha256'), 'hex'),
   'e1111111-1111-4111-8111-111111111111');

set local role anon;
select pg_temp.act_as_operator();

select pg_temp.check(
  (select organisation_name from public.invitation_preview('invitation-token-for-test-22'))
  = 'Extension Co',
  'a signed-out recipient can see which company invited them');

set local role authenticated;
select pg_temp.act_as('e2222222-2222-4222-8222-222222222222');

select pg_temp.check(
  public.accept_invitation('invitation-token-for-test-22')
    = current_setting('amryn_test.org')::uuid,
  'accepting an invitation returns the organisation joined');

select pg_temp.check(
  (select role::text from public.organisation_members
    where organisation_id = current_setting('amryn_test.org')::uuid
      and user_id = 'e2222222-2222-4222-8222-222222222222') = 'analyst',
  'the colleague is a member, at the role they were invited to');

-- ═══════════════════════════════════════════════════════════════════════════
-- The pin itself
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Everything above would also pass if somebody removed the pins altogether and
-- let these functions inherit the caller's search_path. That is the thing the
-- pin exists to prevent, so it is asserted separately rather than assumed.

set local role postgres;

do $$
declare
  unpinned text[];
begin
  select array_agg(p.proname order by p.proname) into unpinned
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('request_subscription','activation_preview','redeem_activation',
                       'invitation_preview','accept_invitation')
     and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=public, extensions%';

  if unpinned is not null then
    raise exception 'these must pin search_path to public, extensions, pg_temp: %',
      array_to_string(unpinned, ', ');
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Who may call these at all
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The bodies above refuse the wrong caller, and that is the guarantee that
-- matters. This is the second lock: migrations 04 to 15 take back the EXECUTE
-- PostgreSQL grants by default, migrations 16 and 17 forgot to, and migration
-- 21 restored it. Asserting the grants means the next function added is a
-- failing test rather than an open door found by a linter later.

do $$
declare
  reachable text[];
begin
  select array_agg(fn order by fn) into reachable
    from unnest(array[
      'public.ensure_onboarding(uuid)',
      'public.complete_onboarding(uuid)',
      'public.request_subscription(public.subscription_plan, integer)',
      'public.redeem_activation(text)',
      'public.accept_invitation(text)'
    ]) as fn
   where has_function_privilege('anon', fn, 'EXECUTE');

  if reachable is not null then
    raise exception 'these need a session and must not be callable by anon: %',
      array_to_string(reachable, ', ');
  end if;
end $$;

-- The other half, which a blanket revoke would silently break: the two
-- previews are what a signed-out person sees after following a link from an
-- email, and must stay reachable.
do $$
declare
  blocked text[];
begin
  select array_agg(fn order by fn) into blocked
    from unnest(array['public.activation_preview(text)', 'public.invitation_preview(text)']) as fn
   where not has_function_privilege('anon', fn, 'EXECUTE');

  if blocked is not null then
    raise exception
      'a recipient who is not signed in must still be able to read the link: %',
      array_to_string(blocked, ', ');
  end if;
end $$;

-- And every helper in amryn, five of which carried no pin at all until
-- migration 19. They are SECURITY INVOKER, so this is not the escalation it
-- would be above, but a trigger that decides whether a branch belongs to your
-- organisation is not where to start making exceptions.
do $$
declare
  unpinned text[];
begin
  select array_agg(p.proname order by p.proname) into unpinned
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'amryn'
     and p.prokind = 'f'
     and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path%';

  if unpinned is not null then
    raise exception 'every amryn function must pin search_path; these do not: %',
      array_to_string(unpinned, ', ');
  end if;
end $$;

rollback;

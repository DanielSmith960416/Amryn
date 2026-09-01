-- Subscriptions: what a tier includes, and what a lapsed one stops.
--
-- Two questions are being asked here and they are not the same one. Whether a
-- feature is included is a question about the plan, and is answered the same
-- way whether the account is paid or three months in arrears. Whether the
-- records may be changed is a question about the payment, and is answered the
-- same way on every tier. The tests below keep them apart on purpose: an
-- implementation that conflated them would pass half of these and lock a
-- lapsed customer out of their own invoice, which is the failure that matters.
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

-- An operator, not a customer. The service role carries no `sub` claim, which
-- is exactly how migration 16's guard tells the two apart — so impersonating
-- one here means clearing the claims, not only changing the role.
create or replace function pg_temp.act_as_operator() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Did a statement fail, and with a message that says why?
create or replace function pg_temp.refused(stmt text, needle text) returns boolean
language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return position(lower(needle) in lower(sqlerrm)) > 0;
end $$;

insert into auth.users (id, email) values
  ('f1111111-1111-4111-8111-111111111111', 'paid@subs.test'),
  ('f2222222-2222-4222-8222-222222222222', 'lapsed@subs.test'),
  ('f3333333-3333-4333-8333-333333333333', 'starter@subs.test')
  on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- The catalogue
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  (select count(*) from public.subscription_plans) = 4,
  'four tiers are published');

select pg_temp.check(
  (select price_cents_monthly from public.subscription_plans where plan = 'starter') = 99900
  and (select price_cents_monthly from public.subscription_plans where plan = 'growth') = 399900
  and (select price_cents_monthly from public.subscription_plans where plan = 'professional') = 999900,
  'Starter, Growth and Professional carry the published rand prices');

select pg_temp.check(
  (select contact_sales from public.subscription_plans where plan = 'enterprise'),
  'Enterprise is arranged rather than bought at a checkout');

-- A new entitlement must arrive switched off everywhere until it is sold
-- deliberately, so every tier is expected to carry an explicit row for every
-- feature rather than relying on the absence of one.
select pg_temp.check(
  (select count(*) from public.plan_entitlements pe
     join public.entitlements e on e.key = pe.entitlement_key
    where e.kind = 'feature')
  = (select count(*) from public.entitlements where kind = 'feature') * 4,
  'every tier has an explicit answer for every feature');

-- ═══════════════════════════════════════════════════════════════════════════
-- Three organisations on three footings
-- ═══════════════════════════════════════════════════════════════════════════

set local role authenticated;

select pg_temp.act_as('f1111111-1111-4111-8111-111111111111');
select public.create_organisation('Paid Co', 'paid-co', null, 'ZA', 'ZAR') as org \gset
select set_config('amryn_test.paid', :'org', true);

select pg_temp.act_as('f2222222-2222-4222-8222-222222222222');
select public.create_organisation('Lapsed Co', 'lapsed-co', null, 'ZA', 'ZAR') as org \gset
select set_config('amryn_test.lapsed', :'org', true);

select pg_temp.act_as('f3333333-3333-4333-8333-333333333333');
select public.create_organisation('Starter Co', 'starter-co', null, 'ZA', 'ZAR') as org \gset
select set_config('amryn_test.starter', :'org', true);

set local role postgres;
select pg_temp.act_as_operator();

select public.apply_subscription_plan(
  current_setting('amryn_test.paid')::uuid, 'professional', 'active',
  now() - interval '2 days', now() + interval '28 days');

update public.subscriptions
   set status = 'cancelled', cancelled_at = now() - interval '10 days'
 where organisation_id = current_setting('amryn_test.lapsed')::uuid;

-- Starter Co stays exactly as create_organisation left it: a trial.

set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- What the plan includes
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.act_as('f1111111-1111-4111-8111-111111111111');

select pg_temp.check(
  amryn.has_entitlement(current_setting('amryn_test.paid')::uuid, 'competitor_radar'),
  'Professional includes the competitor radar');

select pg_temp.check(
  not amryn.has_entitlement(current_setting('amryn_test.starter')::uuid, 'competitor_radar'),
  'Starter does not');

select pg_temp.check(
  not amryn.has_entitlement(current_setting('amryn_test.starter')::uuid, 'sso'),
  'and single sign-on is Enterprise only');

select pg_temp.check(
  not amryn.has_entitlement(current_setting('amryn_test.paid')::uuid, 'no_such_feature'),
  'an entitlement nobody has heard of is not included by default');

-- The distinction the design turns on: unlimited and not-sold are different
-- answers, and a single nullable number could not tell them apart.
select pg_temp.check(
  amryn.entitlement_limit(current_setting('amryn_test.starter')::uuid, 'data_sources') = 2
  and amryn.entitlement_limit(current_setting('amryn_test.paid')::uuid, 'data_sources') is null
  and amryn.has_entitlement(current_setting('amryn_test.paid')::uuid, 'data_sources'),
  'Professional data sources are unlimited, not absent');

-- A cancelled subscription keeps its feature set. It is the payment that has
-- lapsed, not the purchase, and telling someone their competitor radar has
-- been withdrawn would be the wrong explanation of the wrong problem.
select pg_temp.act_as('f2222222-2222-4222-8222-222222222222');
select pg_temp.check(
  amryn.has_entitlement(current_setting('amryn_test.lapsed')::uuid, 'command_centre'),
  'a cancelled subscription still names what it bought');

-- ═══════════════════════════════════════════════════════════════════════════
-- Whether the subscription is current
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  amryn.subscription_current(current_setting('amryn_test.paid')::uuid),
  'an active subscription is current');

select pg_temp.check(
  not amryn.subscription_current(current_setting('amryn_test.lapsed')::uuid),
  'a cancelled one is not');

select pg_temp.check(
  amryn.subscription_current(current_setting('amryn_test.starter')::uuid),
  'a trial inside its thirty days is');

set local role postgres;
select pg_temp.act_as_operator();
update public.subscriptions set trial_ends_at = now() - interval '1 day'
 where organisation_id = current_setting('amryn_test.starter')::uuid;
set local role authenticated;

select pg_temp.check(
  not amryn.subscription_current(current_setting('amryn_test.starter')::uuid),
  'and an expired trial is not, without anything having to notice the date');

-- Arrears are given room. A transfer between South African banks still takes a
-- day, and a customer who has paid must not lose the platform in the meantime.
set local role postgres;
select pg_temp.act_as_operator();
update public.subscriptions
   set status = 'past_due', trial_ends_at = null,
       current_period_end = now() - interval '2 days',
       grace_until = now() + interval '5 days'
 where organisation_id = current_setting('amryn_test.starter')::uuid;
set local role authenticated;

select pg_temp.check(
  amryn.subscription_current(current_setting('amryn_test.starter')::uuid),
  'a late payment inside the grace period keeps working');

set local role postgres;
select pg_temp.act_as_operator();
update public.subscriptions set grace_until = now() - interval '1 hour'
 where organisation_id = current_setting('amryn_test.starter')::uuid;
set local role authenticated;

select pg_temp.check(
  not amryn.subscription_current(current_setting('amryn_test.starter')::uuid),
  'and stops once the grace period is spent');

-- ═══════════════════════════════════════════════════════════════════════════
-- What a lapsed subscription actually stops
-- ═══════════════════════════════════════════════════════════════════════════

set local role postgres;
select pg_temp.act_as_operator();
insert into public.branches (id, organisation_id, name) values
  ('bbbbbbbb-0000-4000-8000-000000000001', current_setting('amryn_test.lapsed')::uuid, 'Bloemfontein');
insert into public.financial_records
  (organisation_id, occurred_on, category, amount_cents, direction)
values
  (current_setting('amryn_test.lapsed')::uuid, current_date - 30, 'Historic', 100000, 'income');
set local role authenticated;

select pg_temp.act_as('f2222222-2222-4222-8222-222222222222');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.financial_records
      (organisation_id, occurred_on, category, amount_cents, direction)
    values (current_setting('amryn_test.lapsed')::uuid, current_date, 'New', 1, 'income')
  $$, 'subscription is not active'),
  'a lapsed organisation cannot add a financial record');

select pg_temp.check(
  pg_temp.refused($$
    update public.branches set name = 'Renamed'
     where organisation_id = current_setting('amryn_test.lapsed')::uuid
  $$, 'subscription is not active'),
  'nor change one it already has');

select pg_temp.check(
  pg_temp.refused($$
    delete from public.financial_records
     where organisation_id = current_setting('amryn_test.lapsed')::uuid
  $$, 'subscription is not active'),
  'nor delete one — otherwise arrears would be a way to destroy the record');

-- The other half, and the more important half. Refusing a lapsed customer
-- their own data would be bad collection practice and worse compliance: POPIA
-- s23 gives a right of access that does not expire with a card.
select pg_temp.check(
  (select count(*) from public.financial_records
    where organisation_id = current_setting('amryn_test.lapsed')::uuid) = 1,
  'but still reads its own financial records');

select pg_temp.check(
  (select count(*) from public.organisations
    where id = current_setting('amryn_test.lapsed')::uuid) = 1,
  'and its own organisation');

select pg_temp.check(
  not pg_temp.refused($$
    insert into public.data_requests (organisation_id, subject_id, kind)
    values (current_setting('amryn_test.lapsed')::uuid,
            'f2222222-2222-4222-8222-222222222222', 'export')
  $$, 'subscription is not active'),
  'and may still ask for its data — a right that does not lapse with a payment');

-- A paid organisation is untouched by any of this.
select pg_temp.act_as('f1111111-1111-4111-8111-111111111111');
select pg_temp.check(
  not pg_temp.refused($$
    insert into public.financial_records
      (organisation_id, occurred_on, category, amount_cents, direction)
    values (current_setting('amryn_test.paid')::uuid, current_date, 'Sale', 250000, 'income')
  $$, 'subscription is not active'),
  'a paid organisation writes exactly as before');

-- ═══════════════════════════════════════════════════════════════════════════
-- Buying a subscription by transfer
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.act_as('f2222222-2222-4222-8222-222222222222');

select (public.request_subscription('growth', 12)).id as act \gset
select set_config('amryn_test.activation', :'act', true);

select pg_temp.check(
  (select state from public.subscription_activations
    where id = current_setting('amryn_test.activation')::uuid) = 'awaiting_payment',
  'a request starts as awaiting payment, not as a subscription');

select pg_temp.check(
  (select reference from public.subscription_activations
    where id = current_setting('amryn_test.activation')::uuid) like 'AMR-%',
  'and carries a reference short enough to type into a banking app');

select pg_temp.check(
  (select amount_cents from public.subscription_activations
    where id = current_setting('amryn_test.activation')::uuid)
  = (select price_cents_annual from public.subscription_plans where plan = 'growth'),
  'a twelve-month term is priced from the catalogue, not from the caller');

select pg_temp.check(
  not amryn.subscription_current(current_setting('amryn_test.lapsed')::uuid),
  'asking for a plan does not grant one');

select pg_temp.check(
  pg_temp.refused($$select public.request_subscription('enterprise', 1)$$, 'directly'),
  'Enterprise cannot be self-served');

-- The control the whole design rests on. Row Level Security decides rows, not
-- columns, so a write policy here would have let the customer confirm their
-- own payment. The grant is revoked instead.
select pg_temp.check(
  pg_temp.refused($$
    update public.subscription_activations
       set state = 'activated', activated_at = now()
     where id = current_setting('amryn_test.activation')::uuid
  $$, 'permission denied'),
  'a customer cannot mark their own transfer as received');

select pg_temp.check(
  pg_temp.refused($$
    select public.issue_activation(current_setting('amryn_test.activation')::uuid, 'deadbeef')
  $$, 'permission denied'),
  'nor call the function that would do it for them');

-- An operator confirms the money arrived, holding the service role.
set local role postgres;
select pg_temp.act_as_operator();
select public.issue_activation(
  current_setting('amryn_test.activation')::uuid,
  encode(digest('one-time-token', 'sha256'), 'hex'),
  null,
  'EFT received, FNB, matched on reference');
set local role authenticated;
select pg_temp.act_as('f2222222-2222-4222-8222-222222222222');

select pg_temp.check(
  (select state from public.subscription_activations
    where id = current_setting('amryn_test.activation')::uuid) = 'payment_confirmed',
  'confirming the payment readies the link but does not activate anything');

select pg_temp.check(
  not amryn.subscription_current(current_setting('amryn_test.lapsed')::uuid),
  'the subscription is still lapsed until the link is opened');

select pg_temp.check(
  (select state from public.activation_preview('one-time-token')) = 'ready'
  and (select plan from public.activation_preview('one-time-token')) = 'growth',
  'the activation page can describe the link without anyone being a member');

select pg_temp.check(
  (select state from public.activation_preview('a-guess')) = 'unknown',
  'and says nothing useful about a token it does not recognise');

-- The customer opens the link.
select public.redeem_activation('one-time-token');

select pg_temp.check(
  amryn.subscription_current(current_setting('amryn_test.lapsed')::uuid),
  'redeeming the link makes the subscription current');

select pg_temp.check(
  (select plan from public.subscriptions
    where organisation_id = current_setting('amryn_test.lapsed')::uuid) = 'growth'
  and (select status from public.subscriptions
    where organisation_id = current_setting('amryn_test.lapsed')::uuid) = 'active',
  'on the plan that was paid for');

select pg_temp.check(
  (select data_source_limit from public.subscriptions
    where organisation_id = current_setting('amryn_test.lapsed')::uuid) = 8
  and (select ai_credits_monthly from public.subscriptions
    where organisation_id = current_setting('amryn_test.lapsed')::uuid) = 2500,
  'with the limits taken from the catalogue rather than typed in twice');

select pg_temp.check(
  (select current_period_end from public.subscriptions
    where organisation_id = current_setting('amryn_test.lapsed')::uuid) > now() + interval '360 days',
  'and the twelve months running from the moment the link was opened');

select pg_temp.check(
  not pg_temp.refused($$
    insert into public.financial_records
      (organisation_id, occurred_on, category, amount_cents, direction)
    values (current_setting('amryn_test.lapsed')::uuid, current_date, 'Back in business', 1, 'income')
  $$, 'subscription is not active'),
  'and the organisation can write again');

select pg_temp.check(
  pg_temp.refused($$select public.redeem_activation('one-time-token')$$, 'already been used'),
  'the link cannot be used twice');

select pg_temp.check(
  (select count(*) from public.audit_logs
    where organisation_id = current_setting('amryn_test.lapsed')::uuid
      and action in ('subscription.requested', 'subscription.payment_confirmed',
                     'subscription.activated', 'subscription.plan_applied')) = 4,
  'and every step of it is in the audit log');

-- ═══════════════════════════════════════════════════════════════════════════
-- The resolved view stays inside the tenant
-- ═══════════════════════════════════════════════════════════════════════════

select pg_temp.check(
  (select count(distinct organisation_id) from public.organisation_entitlements) = 1
  and (select distinct organisation_id from public.organisation_entitlements)
      = current_setting('amryn_test.lapsed')::uuid,
  'the entitlement view shows one organisation: the caller''s own');

select pg_temp.act_as('f3333333-3333-4333-8333-333333333333');
select pg_temp.check(
  (select included from public.organisation_entitlements
    where entitlement_key = 'competitor_radar') = false,
  'and answers for the plan that organisation is actually on');

reset role;
rollback;

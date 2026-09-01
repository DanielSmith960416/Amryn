-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 16 — Subscription plans, entitlements and lapsed-account writes
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Migration 01 gave every organisation a `subscriptions` row carrying a plan
-- name and three numbers. Nothing read the plan. What a tier actually included
-- lived in a constant array on the billing page, and what a tier permitted
-- lived nowhere at all — an organisation whose subscription was cancelled a
-- year ago kept full use of the platform, because no code ever asked.
--
-- This migration supplies the two halves that were missing:
--
--   1. A catalogue. What each tier costs and what it includes are rows, so the
--      pricing page, the entitlement check and the payment webhook read one
--      answer. Changing what Growth includes is an update, not a deployment.
--
--   2. Enforcement. A subscription that has lapsed stops write access to the
--      business data, in the database, for every caller — including one
--      holding a valid token and talking to PostgREST directly rather than to
--      our pages.
--
-- ── why writes and not reads ──────────────────────────────────────────────
-- The blunt version of this is to refuse a lapsed organisation everything.
-- That is wrong on two counts. Commercially, a customer who cannot see the
-- invoice cannot pay it. Legally, POPIA s23 gives the data subject a right of
-- access that does not lapse when a card expires — locking someone out of
-- their own records to collect a debt would be the platform withholding
-- personal information it holds on request.
--
-- So a lapsed organisation keeps reading its own data, keeps its billing page,
-- keeps its export and deletion requests — and cannot add to, change or
-- destroy the business records until the subscription is current again.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The catalogue
-- ═══════════════════════════════════════════════════════════════════════════

create table public.subscription_plans (
  plan                 public.subscription_plan primary key,
  name                 text    not null,
  tagline              text    not null,
  -- Rand, in cents. Null where the price is negotiated rather than published.
  price_cents_monthly  integer check (price_cents_monthly is null or price_cents_monthly >= 0),
  price_cents_annual   integer check (price_cents_annual is null or price_cents_annual >= 0),
  currency_code        char(3) not null default 'ZAR',
  -- The defaults a new subscription on this tier is opened with. The
  -- subscription row remains the effective state: an Enterprise contract is
  -- negotiated, and negotiating it must not require a catalogue edit that
  -- would move every other Enterprise customer with it.
  seats                integer not null default 3  check (seats > 0),
  -- Null is no limit. It has to be nullable for the same reason `included`
  -- and `limit_value` are separate columns below: unlimited and not-sold are
  -- different answers, and one number cannot carry both.
  data_source_limit    integer check (data_source_limit is null or data_source_limit >= 0),
  ai_credits_monthly   integer not null default 500 check (ai_credits_monthly >= 0),
  trial_days           integer not null default 30 check (trial_days >= 0),
  -- Enterprise is a conversation, not a checkout button.
  contact_sales        boolean not null default false,
  is_public            boolean not null default true,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.subscription_plans is
  'What each tier costs and what a subscription on it is opened with. Read by the pricing page, the billing page and the payment webhook, so the three cannot disagree.';

create trigger subscription_plans_touch
  before update on public.subscription_plans
  for each row execute function amryn.touch_updated_at();

insert into public.subscription_plans
  (plan, name, tagline, price_cents_monthly, price_cents_annual, seats, data_source_limit, ai_credits_monthly, trial_days, contact_sales, sort_order)
values
  ('starter',      'Starter',      'One site, two data sources, the numbers that matter.',
     99900,  1_078_900,   3,   2,    500, 30, false, 1),
  ('growth',       'Growth',       'Several branches, eight sources, and the market watched for you.',
    399900,  4_318_900,  10,   8,  2_500, 30, false, 2),
  ('professional', 'Professional', 'The full radar, unlimited sources, reports on your own terms.',
    999900, 10_798_900,  30, null, 10_000, 14, false, 3),
  ('enterprise',   'Enterprise',   'Single sign-on, negotiated scale and a named person to call.',
   2_000_000, null,     100, null, 50_000,  0, true,  4);

comment on column public.subscription_plans.price_cents_annual is
  'Twelve months for the price of about eleven. Null where the tier is negotiated.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Entitlements
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Deliberately the same shape as `permissions`: a catalogue of keys and a
-- join table saying which tier carries which. The application mirrors the
-- vocabulary so it can explain a refusal, and the database decides.
--
-- Permissions and entitlements answer different questions and are not
-- interchangeable. A permission asks "is this person allowed to?" — an analyst
-- may not change billing however much the company pays. An entitlement asks
-- "has this company bought it?" — the founder on Starter is allowed to use the
-- competitor radar and has not purchased it. Both must be satisfied.

create table public.entitlements (
  key         text primary key,
  category    text not null,
  name        text not null,
  description text not null,
  -- 'feature' is on or off. 'quota' carries a number, and null means no limit.
  kind        text not null default 'feature' check (kind in ('feature', 'quota')),
  sort_order  integer not null default 0
);

comment on table public.entitlements is
  'The vocabulary of what a subscription can include. Mirrored in src/lib/billing/entitlements.ts so the application can name what is missing.';

insert into public.entitlements (key, category, name, description, kind, sort_order) values
  ('command_centre',        'Intelligence', 'Executive Command Centre',   'The daily view of the business.',                            'feature',  1),
  ('financial_intelligence','Intelligence', 'Financial intelligence',     'Revenue, margin, cash and the forecast.',                    'feature',  2),
  ('performance_tracking',  'Intelligence', 'Performance tracking',       'KPIs, goals and the action centre.',                         'feature',  3),
  ('risk_radar',            'Intelligence', 'Risk radar',                 'Risks scored, ranked and tracked to closure.',               'feature',  4),
  ('opportunity_pipeline',  'Growth',       'Opportunity pipeline',       'Opportunities found, scored and assigned.',                  'feature',  5),
  ('market_intelligence',   'Growth',       'Market intelligence',        'Signals from your market, read for you.',                    'feature',  6),
  ('competitor_radar',      'Growth',       'Competitor radar',           'Named competitors watched continuously.',                    'feature',  7),
  ('ai_assistant',          'Intelligence', 'AI DigitalTwin® assistant',  'Ask the twin about your own figures.',                       'feature',  8),
  ('report_weekly',         'Reporting',    'Weekly briefing',            'The weekly brief, written and delivered.',                   'feature',  9),
  ('report_monthly',        'Reporting',    'Monthly board pack',         'The monthly review, in board-meeting form.',                 'feature', 10),
  ('custom_reports',        'Reporting',    'Reports on your own terms',  'Choose the sections, the period and the recipients.',        'feature', 11),
  ('api_access',            'Operations',   'API access',                 'Read your intelligence from your own systems.',              'feature', 12),
  ('sso',                   'Operations',   'Single sign-on',             'Sign in with your company identity provider.',               'feature', 13),
  ('white_label',           'Operations',   'Your branding',              'Reports and the interface in your own colours.',             'feature', 14),
  ('priority_support',      'Support',      'Priority support',           'A four-hour response during business hours.',                'feature', 15),
  ('success_manager',       'Support',      'Named success manager',      'A person who knows your business and answers the phone.',    'feature', 16),
  ('seats',                 'Operations',   'People',                     'How many colleagues can be given an account.',               'quota',   17),
  ('data_sources',          'Operations',   'Data sources',               'How many systems can feed the platform.',                    'quota',   18),
  ('ai_credits',            'Intelligence', 'AI usage',                   'How much the assistant may be asked each month.',            'quota',   19),
  ('audit_retention_days',  'Operations',   'Audit history',              'How far back the audit log is kept.',                        'quota',   20),
  ('branches',              'Operations',   'Sites',                      'How many branches may be tracked separately.',               'quota',   21);

create table public.plan_entitlements (
  plan            public.subscription_plan not null references public.subscription_plans (plan) on delete cascade,
  entitlement_key text not null references public.entitlements (key) on delete cascade,
  included        boolean not null default true,
  -- Only meaningful for a quota. Null on an included quota means no limit.
  limit_value     integer check (limit_value is null or limit_value >= 0),
  primary key (plan, entitlement_key)
);

comment on table public.plan_entitlements is
  'The matrix. One row per tier per entitlement; absent is the same as not included, so a new entitlement is off everywhere until it is deliberately sold.';

-- Features. Written as a matrix rather than four separate inserts so that the
-- shape of the offer is legible in one screen — which is the point of having
-- it in one place at all.
insert into public.plan_entitlements (plan, entitlement_key, included)
select t.plan, m.key, t.included
from (values
  --  key                       starter growth  professional enterprise
  ('command_centre',            true,   true,   true,        true),
  ('financial_intelligence',    true,   true,   true,        true),
  ('performance_tracking',      true,   true,   true,        true),
  ('risk_radar',                false,  true,   true,        true),
  ('opportunity_pipeline',      false,  true,   true,        true),
  ('market_intelligence',       false,  true,   true,        true),
  ('competitor_radar',          false,  false,  true,        true),
  ('ai_assistant',              true,   true,   true,        true),
  ('report_weekly',             true,   true,   true,        true),
  ('report_monthly',            false,  true,   true,        true),
  ('custom_reports',            false,  false,  true,        true),
  ('api_access',                false,  false,  true,        true),
  ('sso',                       false,  false,  false,       true),
  ('white_label',               false,  false,  false,       true),
  ('priority_support',          false,  false,  true,        true),
  ('success_manager',           false,  false,  false,       true)
) as m(key, starter, growth, professional, enterprise)
cross join lateral (values
  ('starter'::public.subscription_plan,      m.starter),
  ('growth'::public.subscription_plan,       m.growth),
  ('professional'::public.subscription_plan, m.professional),
  ('enterprise'::public.subscription_plan,   m.enterprise)
) as t(plan, included);

-- Quotas.
--
-- The three that a subscription carries a column for are selected *from* the
-- catalogue rather than typed again beside it. Written out by hand they were
-- wrong within the hour: the matrix said Professional had unlimited data
-- sources while the catalogue said a hundred, and both were being read — the
-- pricing page from one, the enforcement from the other. Two places to state
-- one number is one place too many.
insert into public.plan_entitlements (plan, entitlement_key, included, limit_value)
select plan, 'seats',        true, seats              from public.subscription_plans
union all
select plan, 'data_sources', true, data_source_limit  from public.subscription_plans
union all
select plan, 'ai_credits',   true, ai_credits_monthly from public.subscription_plans;

-- The rest have no column on `subscriptions` and live here alone.
insert into public.plan_entitlements (plan, entitlement_key, included, limit_value) values
  ('starter',      'audit_retention_days', true,    90),
  ('growth',       'audit_retention_days', true,   365),
  ('professional', 'audit_retention_days', true, 1_095),
  ('enterprise',   'audit_retention_days', true,  null),

  ('starter',      'branches',             true,     1),
  ('growth',       'branches',             true,    10),
  ('professional', 'branches',             true,  null),
  ('enterprise',   'branches',             true,  null);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. What the subscription now has to record
-- ═══════════════════════════════════════════════════════════════════════════
--
-- There is no payment gateway. Customers pay by electronic transfer against a
-- reference, email the proof, and an operator issues an activation link. That
-- is a deliberate choice and not a placeholder: it needs no card processing
-- agreement, no gateway account, no secret in the deployment, and it matches
-- how South African business-to-business software of this size is actually
-- bought. The columns below record the outcome of that process, whoever
-- eventually performs it — a gateway added later writes the same fields.

-- Null is no limit, matching the catalogue. It was not null with a default of
-- two, which left no way to express the unlimited sources Professional is sold
-- with other than a large number that would eventually be reached.
alter table public.subscriptions
  alter column data_source_limit drop not null;

alter table public.subscriptions
  add column cancel_at_period_end boolean not null default false,
  add column cancelled_at         timestamptz,
  -- A payment that has not landed yet is not the same as a refusal to pay.
  -- Transfers between South African banks still take a day, and a customer who
  -- has paid should not lose the platform while the money is in flight. Set
  -- when the period lapses; cleared when an activation is redeemed.
  add column grace_until          timestamptz,
  add column last_payment_at      timestamptz,
  add column activated_at         timestamptz,
  add column activated_by         uuid references auth.users (id) on delete set null;

comment on column public.subscriptions.grace_until is
  'How long an unpaid period is tolerated before writes are refused. Null when the subscription is not in arrears.';

-- Bring the existing rows in line with the catalogue they were opened against.
-- Every organisation created before this migration is on Starter's defaults
-- already; this makes that a fact rather than a coincidence of two numbers
-- that happened to be typed the same.
update public.subscriptions s
   set price_cents_monthly = coalesce(p.price_cents_monthly, s.price_cents_monthly)
  from public.subscription_plans p
 where p.plan = s.plan
   and s.price_cents_monthly is distinct from coalesce(p.price_cents_monthly, s.price_cents_monthly);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Paying by transfer, and being activated
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The sequence, and where each step is recorded:
--
--   1. The customer chooses a plan and a term.       request_subscription()
--      They are given a reference to quote on the transfer.
--   2. They pay, and email the proof.                (outside the platform)
--   3. An operator confirms the money arrived.       issue_activation()
--      That mints a one-time link and returns it to be sent to the customer.
--   4. The customer opens the link.                  redeem_activation()
--      The plan is applied and the period starts from that moment.
--
-- Step 3 is the control. Nothing a customer can do — not the request, not the
-- proof they attach, not any field they can write — moves a subscription to
-- active. The platform never takes the customer's word for a payment, which is
-- the same rule a gateway integration would follow when it refuses to trust
-- the browser and waits for the webhook.

create table public.subscription_activations (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  plan            public.subscription_plan not null,
  -- One month or twelve. Stored rather than derived so a change to the
  -- catalogue's annual price cannot retrospectively alter what was invoiced.
  term_months     integer not null default 1 check (term_months in (1, 12)),
  amount_cents    integer not null check (amount_cents >= 0),
  currency_code   char(3) not null default 'ZAR',
  -- What the customer quotes on the transfer, and what the operator matches
  -- the proof against. Unique, and generated rather than chosen.
  reference       text not null unique,

  state           text not null default 'awaiting_payment'
                    check (state in ('awaiting_payment', 'payment_confirmed', 'activated', 'cancelled', 'expired')),

  requested_by    uuid references auth.users (id) on delete set null,
  requested_at    timestamptz not null default now(),

  -- Set at step 3. Never the link itself: only a SHA-256 hash is stored, so a
  -- leaked backup activates nothing. The raw token exists once, in the
  -- response to the operator who will send it on. Same rule as invitations.
  token_hash      text unique,
  confirmed_by    uuid references auth.users (id) on delete set null,
  confirmed_at    timestamptz,
  payment_note    text,
  expires_at      timestamptz,

  activated_at    timestamptz,
  activated_by    uuid references auth.users (id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- The states are not independent of the columns that record them.
  constraint confirmed_carries_a_token check (
    state = 'awaiting_payment' or state = 'cancelled' or token_hash is not null
  ),
  constraint activated_carries_a_time check (
    (state = 'activated') = (activated_at is not null)
  )
);

comment on table public.subscription_activations is
  'One row per attempt to buy or renew a subscription: what was asked for, what reference was quoted, who confirmed the money arrived, and when the customer redeemed the link. The billing history a dispute is answered from.';

-- One open request per organisation. A partial index rather than a plain
-- constraint, so the same organisation can request again after cancelling,
-- letting a request expire, or completing one.
create unique index subscription_activations_open
  on public.subscription_activations (organisation_id)
  where state in ('awaiting_payment', 'payment_confirmed');

create index subscription_activations_org_idx
  on public.subscription_activations (organisation_id, requested_at desc);

create trigger subscription_activations_touch
  before update on public.subscription_activations
  for each row execute function amryn.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Reading an entitlement
-- ═══════════════════════════════════════════════════════════════════════════

-- Is this organisation's subscription in a state that permits work?
--
-- Split out from the entitlement question because the two fail differently: a
-- missing entitlement is an upgrade, an inactive subscription is a payment.
create or replace function amryn.subscription_current(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select
       case s.status
         when 'active'    then true
         -- A trial is a subscription until the day it says it is not.
         when 'trialing'  then coalesce(s.trial_ends_at, s.current_period_end) > now()
         -- In arrears, inside the grace period we allowed for it.
         when 'past_due'  then coalesce(s.grace_until, s.current_period_end + interval '7 days') > now()
         when 'cancelled' then false
         else false
       end
     from public.subscriptions s
     where s.organisation_id = org),
    -- No subscription row is not a free pass. Every organisation is created
    -- with one; an organisation without one is a broken record, and the safe
    -- reading of a broken billing record is "not paid".
    false);
$$;

comment on function amryn.subscription_current is
  'Whether the organisation may currently be worked in. Reads are never gated on this — see the header of migration 16.';

-- Does the organisation''s plan include this?
--
-- Note what is *not* here: the subscription''s status. A cancelled Professional
-- customer still has the Professional feature set — they simply cannot write.
-- Conflating the two would mean a lapsed account silently losing pages as well
-- as write access, and being told the wrong thing about why.
create or replace function amryn.has_entitlement(org uuid, key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select pe.included
       from public.subscriptions s
       join public.plan_entitlements pe
         on pe.plan = s.plan and pe.entitlement_key = key
      where s.organisation_id = org),
    false);
$$;

-- The number attached to a quota, or null for no limit.
--
-- The subscription row wins over the catalogue where it carries its own
-- column, because that is where a negotiated contract is recorded. The
-- catalogue is what a tier opens with, not a ceiling it can never exceed.
create or replace function amryn.entitlement_limit(org uuid, key text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case key
    when 'seats'        then s.seats
    when 'data_sources' then s.data_source_limit
    when 'ai_credits'   then s.ai_credits_monthly
    else pe.limit_value
  end
  from public.subscriptions s
  left join public.plan_entitlements pe
    on pe.plan = s.plan and pe.entitlement_key = key
  where s.organisation_id = org;
$$;

-- One round trip for the whole picture, which is what a page render needs.
create view public.organisation_entitlements
with (security_invoker = true) as
select
  s.organisation_id,
  e.key            as entitlement_key,
  e.category,
  e.name,
  e.description,
  e.kind,
  e.sort_order,
  coalesce(pe.included, false) as included,
  case e.key
    when 'seats'        then s.seats
    when 'data_sources' then s.data_source_limit
    when 'ai_credits'   then s.ai_credits_monthly
    else pe.limit_value
  end              as limit_value
from public.subscriptions s
cross join public.entitlements e
left join public.plan_entitlements pe
  on pe.plan = s.plan and pe.entitlement_key = e.key;

comment on view public.organisation_entitlements is
  'Every entitlement resolved for every organisation the caller can see. security_invoker, so Row Level Security on subscriptions decides which organisations that is.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Refusing writes on a lapsed subscription
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── why a trigger and not a policy ────────────────────────────────────────
-- The policy version of this means appending a condition to the `with check`
-- of every write policy in the schema — around ninety of them, each edited by
-- hand, with no way to assert afterwards that none was missed. Worse, the
-- obvious shortcut of folding the condition into amryn.has_permission() would
-- catch reads too: several select policies are written against a manage_
-- permission, so a lapsed customer would lose sight of their own invoices,
-- which is the one thing they must be able to see.
--
-- A trigger separates the two cleanly. It fires on writes and never on reads,
-- it attaches by iterating the catalogue rather than by being remembered, and
-- it is one function to read when someone asks what the rule is.

create or replace function amryn.refuse_lapsed_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  org uuid;
begin
  -- The service role and the owner carry no `sub` claim: a webhook applying a
  -- payment, a scheduled job and a migration must all keep working, and it is
  -- specifically a payment that has to get through to end the lapse.
  if coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
              nullif(auth.jwt() ->> 'sub', '')) is null then
    return coalesce(new, old);
  end if;

  org := case tg_op when 'DELETE' then old.organisation_id else new.organisation_id end;
  if org is null then
    return coalesce(new, old);
  end if;

  if not amryn.subscription_current(org) then
    raise exception
      'This organisation''s subscription is not active, so its records cannot be changed. Reading, exporting and billing are unaffected.'
      using errcode = 'check_violation',
            hint = 'Settle the subscription on the billing page to resume.';
  end if;

  return coalesce(new, old);
end $$;

comment on function amryn.refuse_lapsed_write is
  'Refuses changes to business records while a subscription is lapsed. Reads, billing and data-rights records are exempt — see migration 16 header.';

-- Which tables it guards.
--
-- Everything owned by an organisation, except:
--   billing              a customer who cannot pay cannot recover, and the
--                        activation that ends the lapse is itself a write
--   legal and rights     POPIA s23/s24 do not lapse with a card
--   audit                the record of what happened must not have a gap
--   membership           removing a person's access must always be possible
--
-- Consent is not listed because it is not a table: it is columns on
-- user_profiles and organisations, neither of which carries an
-- organisation_id, so the loop below never reaches them and withdrawal keeps
-- working for the same reason reads do.
do $$
declare
  t text;
  exempt constant text[] := array[
    'subscriptions', 'billing_records', 'subscription_activations',
    'audit_logs', 'data_requests',
    'organisation_members', 'member_permission_overrides',
    'organisation_invitations', 'rate_limits'
  ];
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'organisation_id'
     where n.nspname = 'public'
       and c.relkind = 'r'
       and not a.attisdropped
       and c.relname <> all (exempt)
     order by c.relname
  loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I '
      || 'for each row execute function amryn.refuse_lapsed_write()',
      left('zz_subscription_' || t, 63), t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Moving a subscription, from one place
-- ═══════════════════════════════════════════════════════════════════════════

-- Puts an organisation on a plan and copies the catalogue's opening figures.
--
-- Definer, and deliberately not callable by a signed-in user. This is the only
-- statement in the schema that makes a subscription active, so it is reached
-- through redeem_activation() or by an operator holding the service role, and
-- never by posting to an endpoint.
create or replace function public.apply_subscription_plan(
  p_organisation uuid,
  p_plan         public.subscription_plan,
  p_status       public.subscription_status default null,
  p_period_start timestamptz default null,
  p_period_end   timestamptz default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  catalogue public.subscription_plans;
  updated     public.subscriptions;
  -- Not named `status`: PL/pgSQL refuses a bare name that matches both a
  -- variable and a column of a table in the statement, and `subscriptions`
  -- has one.
  next_status public.subscription_status;
begin
  select * into catalogue from public.subscription_plans where plan = p_plan;
  if not found then
    raise exception 'no such plan: %', p_plan using errcode = '22023';
  end if;

  select coalesce(p_status, s.status) into next_status
    from public.subscriptions s where s.organisation_id = p_organisation;

  update public.subscriptions s
     set plan                 = p_plan,
         status               = coalesce(p_status, s.status),
         -- Seats can be negotiated above the catalogue, and a plan change
         -- never silently takes them away. Reducing someone's seat count is a
         -- decision for a person, not a side effect of applying a tier.
         seats                = greatest(catalogue.seats, s.seats),
         data_source_limit    = catalogue.data_source_limit,
         ai_credits_monthly   = catalogue.ai_credits_monthly,
         price_cents_monthly  = coalesce(catalogue.price_cents_monthly, s.price_cents_monthly),
         currency_code        = catalogue.currency_code,
         current_period_start = coalesce(p_period_start, s.current_period_start),
         current_period_end   = coalesce(p_period_end, s.current_period_end),
         -- Becoming active ends the arrears and the trial in one step.
         grace_until          = case when next_status = 'active' then null else s.grace_until end,
         trial_ends_at        = case when next_status = 'active' then null else s.trial_ends_at end,
         cancelled_at         = case when next_status = 'cancelled'
                                     then coalesce(s.cancelled_at, now()) else null end,
         activated_at         = case when next_status = 'active'
                                     then now() else s.activated_at end
   where s.organisation_id = p_organisation
  returning * into updated;

  if not found then
    raise exception 'organisation % has no subscription', p_organisation
      using errcode = 'P0002';
  end if;

  insert into public.audit_logs
    (organisation_id, actor_id, action, entity_type, entity_id, summary, metadata)
  values
    (p_organisation, auth.uid(), 'subscription.plan_applied', 'subscription', updated.id::text,
     catalogue.name,
     jsonb_build_object('plan', p_plan, 'status', updated.status));

  return updated;
end $$;

revoke all on function public.apply_subscription_plan(uuid, public.subscription_plan, public.subscription_status, timestamptz, timestamptz) from public, anon, authenticated;

-- ── step 1: the customer asks ─────────────────────────────────────────────
--
-- Returns the reference to quote on the transfer. Deliberately says nothing
-- about the subscription itself: asking does not change what the organisation
-- currently has, and a request left unpaid must not remove anything either.
create or replace function public.request_subscription(
  p_plan        public.subscription_plan,
  p_term_months integer default 1
)
returns public.subscription_activations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  catalogue public.subscription_plans;
  org       uuid;
  amount    integer;
  created   public.subscription_activations;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_term_months not in (1, 12) then
    raise exception 'a subscription is bought by the month or by the year'
      using errcode = '22023';
  end if;

  -- The organisation is taken from the caller's own membership rather than
  -- from an argument, so nobody can open a request against a company they
  -- happen to know the identifier of.
  select m.organisation_id into org
    from public.organisation_members m
   where m.user_id = auth.uid()
     and m.status = 'active'
     and amryn.has_permission(m.organisation_id, 'manage_billing')
   order by m.joined_at
   limit 1;

  if org is null then
    raise exception 'only someone who manages billing can request a subscription'
      using errcode = '42501';
  end if;

  select * into catalogue from public.subscription_plans where plan = p_plan;
  if not found then
    raise exception 'no such plan: %', p_plan using errcode = '22023';
  end if;
  if catalogue.contact_sales then
    raise exception 'the % plan is arranged with us directly', catalogue.name
      using errcode = '22023',
            hint = 'Email the team and we will put the agreement together.';
  end if;

  amount := case when p_term_months = 12
                 then coalesce(catalogue.price_cents_annual, catalogue.price_cents_monthly * 12)
                 else catalogue.price_cents_monthly end;
  if amount is null then
    raise exception 'the % plan has no published price', catalogue.name
      using errcode = '22023';
  end if;

  -- Supersede whatever was open. Someone who changes their mind before paying
  -- should not have to ask an operator to clear the old request first.
  update public.subscription_activations
     set state = 'cancelled'
   where organisation_id = org
     and state in ('awaiting_payment', 'payment_confirmed');

  insert into public.subscription_activations
    (organisation_id, plan, term_months, amount_cents, currency_code, reference, requested_by)
  values
    (org, p_plan, p_term_months, amount, catalogue.currency_code,
     -- Short enough to be typed into a banking app's reference field, which is
     -- commonly twenty characters, and long enough not to collide.
     'AMR-' || upper(encode(gen_random_bytes(4), 'hex')),
     auth.uid())
  returning * into created;

  insert into public.audit_logs
    (organisation_id, actor_id, action, entity_type, entity_id, summary, metadata)
  values
    (org, auth.uid(), 'subscription.requested', 'subscription_activation', created.id::text,
     catalogue.name,
     jsonb_build_object('plan', p_plan, 'term_months', p_term_months, 'reference', created.reference));

  return created;
end $$;

-- ── step 3: an operator confirms the money arrived ────────────────────────
--
-- Takes the hash, not the token. The link is generated by the application,
-- shown once to the operator who will send it, and never stored anywhere it
-- could be read back — the same treatment an invitation gets.
--
-- Revoked from every signed-in role. Confirming a payment is an operator
-- action carried out with the service role; a customer with manage_billing
-- must not be able to confirm their own transfer.
create or replace function public.issue_activation(
  p_activation uuid,
  p_token_hash text,
  p_confirmed_by uuid default null,
  p_note       text default null,
  p_valid_for  interval default interval '14 days'
)
returns public.subscription_activations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated public.subscription_activations;
begin
  update public.subscription_activations a
     set state        = 'payment_confirmed',
         token_hash   = p_token_hash,
         confirmed_by = p_confirmed_by,
         confirmed_at = now(),
         payment_note = p_note,
         expires_at   = now() + p_valid_for
   where a.id = p_activation
     and a.state = 'awaiting_payment'
  returning * into updated;

  if not found then
    raise exception 'no activation awaiting payment with id %', p_activation
      using errcode = 'P0002';
  end if;

  insert into public.audit_logs
    (organisation_id, actor_id, action, entity_type, entity_id, summary, metadata)
  values
    (updated.organisation_id, p_confirmed_by, 'subscription.payment_confirmed',
     'subscription_activation', updated.id::text, updated.reference,
     jsonb_build_object('plan', updated.plan, 'amount_cents', updated.amount_cents));

  return updated;
end $$;

revoke all on function public.issue_activation(uuid, text, uuid, text, interval) from public, anon, authenticated;

-- ── what the activation page may say before anyone is signed in ───────────
--
-- Possession of the link is the whole authorisation, so this returns only what
-- the page needs to render: which organisation, which plan, and whether the
-- link is still good. Not the amount, not the reference, not who paid.
create or replace function public.activation_preview(p_token text)
returns table (
  organisation_name text,
  plan              public.subscription_plan,
  plan_name         text,
  term_months       integer,
  state             text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hashed text := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  record_ record;
begin
  select a.*, o.name as org_name, p.name as tier_name
    into record_
    from public.subscription_activations a
    join public.organisations o on o.id = a.organisation_id
    join public.subscription_plans p on p.plan = a.plan
   where a.token_hash = hashed;

  if record_.id is null then
    return query select null::text, null::public.subscription_plan, null::text, null::integer, 'unknown'::text;
    return;
  end if;

  return query select
    record_.org_name::text,
    record_.plan,
    record_.tier_name::text,
    record_.term_months,
    case
      when record_.state = 'activated' then 'already_used'
      when record_.state <> 'payment_confirmed' then 'unavailable'
      when record_.expires_at is not null and record_.expires_at < now() then 'expired'
      else 'ready'
    end::text;
end $$;

-- ── step 4: the customer redeems the link ─────────────────────────────────
--
-- The period runs from redemption rather than from confirmation, so a link
-- sent on a Friday and opened on a Monday does not cost the customer a
-- weekend. The activation is marked used in the same transaction that makes
-- the subscription active, so a link cannot be redeemed twice.
create or replace function public.redeem_activation(p_token text)
returns public.subscriptions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hashed  text := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  claim   public.subscription_activations;
  result  public.subscriptions;
begin
  -- for update, so two clicks on the same link race for the row rather than
  -- both reading it as unused.
  select * into claim
    from public.subscription_activations
   where token_hash = hashed
   for update;

  if claim.id is null then
    raise exception 'this activation link is not recognised' using errcode = '22023';
  end if;
  if claim.state = 'activated' then
    raise exception 'this activation link has already been used' using errcode = '22023';
  end if;
  if claim.state <> 'payment_confirmed' then
    raise exception 'this activation link is not ready to be used' using errcode = '22023';
  end if;
  if claim.expires_at is not null and claim.expires_at < now() then
    update public.subscription_activations set state = 'expired' where id = claim.id;
    raise exception 'this activation link has expired' using errcode = '22023',
      hint = 'Ask us for a new one; the payment is still on record.';
  end if;

  result := public.apply_subscription_plan(
    claim.organisation_id,
    claim.plan,
    'active',
    now(),
    now() + make_interval(months => claim.term_months));

  update public.subscriptions
     set last_payment_at = now(),
         activated_by    = auth.uid()
   where organisation_id = claim.organisation_id
  returning * into result;

  update public.subscription_activations
     set state = 'activated', activated_at = now(), activated_by = auth.uid()
   where id = claim.id;

  insert into public.audit_logs
    (organisation_id, actor_id, action, entity_type, entity_id, summary, metadata)
  values
    (claim.organisation_id, auth.uid(), 'subscription.activated',
     'subscription_activation', claim.id::text, claim.reference,
     jsonb_build_object('plan', claim.plan, 'term_months', claim.term_months));

  return result;
end $$;

-- ── who may see an activation record ──────────────────────────────────────
alter table public.subscription_activations enable row level security;

-- Readable by whoever manages billing, so the customer can see the reference
-- to pay against and what has been confirmed.
create policy subscription_activations_read on public.subscription_activations
  for select to authenticated
  using (amryn.has_permission(organisation_id, 'manage_billing'));

-- No write policy, and the grant is revoked as well. Every write goes through
-- one of the definer functions above, which is what keeps the confirmation
-- step out of the customer's hands: a policy alone would let anyone with
-- manage_billing set state = 'activated' on their own row, because Row Level
-- Security decides rows, not columns.
--
-- Deliberately not forced: the definer functions run as this table's owner,
-- and forcing it would refuse them along with everyone else. The revoked grant
-- is the stronger control here and is unaffected either way — the same
-- reasoning, and the same exception, as audit_logs and mfa_recovery_codes.
revoke insert, update, delete on public.subscription_activations from authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Who may read the catalogue
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.subscription_plans  enable row level security;
alter table public.subscription_plans  force row level security;
alter table public.entitlements        enable row level security;
alter table public.entitlements        force row level security;
alter table public.plan_entitlements   enable row level security;
alter table public.plan_entitlements   force row level security;

-- The catalogue is the price list. It is on the marketing site, so treating it
-- as a secret from a signed-in customer would be theatre.
--
-- `to public` rather than `to authenticated` because forcing row level
-- security applies to the table's owner too, and the definer functions above
-- read these rows as the owner. A policy naming only `authenticated` would
-- leave apply_subscription_plan() reading an empty catalogue and reporting
-- "no such plan" for a tier that is sitting right there. The grant, not the
-- policy, is what keeps anonymous callers out: migration 09 grants these
-- tables to `authenticated` alone, and `anon` holds nothing.
create policy subscription_plans_read on public.subscription_plans
  for select to public using (true);

create policy entitlements_read on public.entitlements
  for select to public using (true);

create policy plan_entitlements_read on public.plan_entitlements
  for select to public using (true);

-- Nobody signed in changes the price list. It changes by migration, or by an
-- operator holding the service role.
revoke insert, update, delete on public.subscription_plans from authenticated;
revoke insert, update, delete on public.entitlements from authenticated;
revoke insert, update, delete on public.plan_entitlements from authenticated;

grant select on public.organisation_entitlements to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Privileges for the role that does the operator's work
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Found while writing the confirmation step, and older than this migration.
--
-- Migration 09 established default privileges so that a table added by a later
-- migration is reachable by `authenticated` — the snapshot problem, fixed for
-- one role. `service_role` has exactly the same problem and was not covered:
-- Supabase grants it the public schema once, at project creation, and that
-- grant likewise says nothing about tables that do not exist yet. Every table
-- added since migration 09 — rate limits, data requests, and now these — was
-- therefore invisible to the one client that is supposed to be able to reach
-- everything, and would have failed the first time an operator tool touched
-- one, reported as a missing table rather than as a missing privilege.
--
-- Row Level Security is not weakened by any of this: service_role bypasses it
-- by design, which is why the key never reaches a browser.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant all on sequences to service_role;

-- The two functions the operator holds alone. Revoked from every signed-in
-- role above; granted here to the one role that is meant to have them, because
-- `revoke ... from public` took the default away from service_role as well.
grant execute on function public.apply_subscription_plan(uuid, public.subscription_plan, public.subscription_status, timestamptz, timestamptz) to service_role;
grant execute on function public.issue_activation(uuid, text, uuid, text, interval) to service_role;

notify pgrst, 'reload schema';

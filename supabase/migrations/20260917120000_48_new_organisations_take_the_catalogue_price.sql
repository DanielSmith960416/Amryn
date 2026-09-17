-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 48 — a new organisation takes the price list's price
--
-- ── the defect ────────────────────────────────────────────────────────────
--
-- Migration 01 gave subscriptions these column defaults:
--
--     price_cents_monthly  integer not null default 99900
--     seats                integer not null default 3
--     data_source_limit    integer          default 2
--     ai_credits_monthly   integer not null default 500
--
-- which was Starter, correctly, on 29 August. create_organisation() inserts
-- only (organisation_id, plan, status, trial_ends_at), so every new
-- organisation took its price from that default rather than from the price
-- list.
--
-- On 10 September migration 36 raised every published price — Starter from
-- 99900 to 149900 — by updating subscription_plans. It did not touch this
-- default, because nothing said the default was a second copy of the same
-- number.
--
-- So since 10 September every organisation created has been stamped R999 a
-- month whatever Starter actually costs, and every one created after this
-- would have been too. An audit of the two live organisations found exactly
-- that: one carrying 99900 from the default, against a catalogue price of
-- 149900.
--
-- ── what this does not change ─────────────────────────────────────────────
--
-- Nothing already recorded. An existing subscription keeps the price it was
-- opened at: apply_subscription_plan() has always read the catalogue, so a
-- row that went through a paid activation holds the price of the day it was
-- activated, and that is what a customer agreed to pay. Reconciling those to
-- today's list is a billing decision rather than a schema one, and is left to
-- a person.
--
-- ── why the defaults go rather than get corrected ─────────────────────────
--
-- Replacing 99900 with 149900 would fix today and re-arm the trap for the
-- next price change. The number belongs in one place, and that place is
-- subscription_plans, which exists to be the price list and is already what
-- apply_subscription_plan() and the billing page read.
--
-- With the defaults dropped, an insert that forgets these columns fails on
-- the not-null constraint rather than quietly writing last year's price. A
-- loud failure at the moment of the mistake is the better of the two: a wrong
-- price in a subscriptions row is invisible until somebody is invoiced from
-- it.
--
-- create_organisation() is the only writer — verified across the migrations,
-- the application and the worker; every other reference to subscriptions is a
-- select.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.subscriptions alter column price_cents_monthly drop default;
alter table public.subscriptions alter column seats               drop default;
alter table public.subscriptions alter column data_source_limit   drop default;
alter table public.subscriptions alter column ai_credits_monthly  drop default;

comment on column public.subscriptions.price_cents_monthly is
  'What this organisation pays, as at the day the plan was applied. Copied '
  'from subscription_plans by create_organisation() or apply_subscription_plan() '
  'and deliberately not re-synced when the price list changes: a customer keeps '
  'the price they signed at. Read subscription_plans for what a tier costs today.';

-- ── create_organisation, reading the price list ──────────────────────────
--
-- Unchanged from migration 08 but for the subscriptions insert. Repeated in
-- full rather than patched because a function has no patch: `create or
-- replace` takes the whole body, and a reader comparing this against 08
-- should be able to see the one statement that differs.

create or replace function public.create_organisation(
  p_name text,
  p_slug text,
  p_industry text default null,
  p_country_code text default 'ZA',
  p_currency_code text default 'ZAR'
)
returns uuid
language plpgsql
security definer
-- SECURITY DEFINER because the caller is not yet a member of the organisation
-- whose rows are being written. search_path is pinned so the elevated body
-- cannot be redirected to a caller-controlled schema.
set search_path = public, pg_temp
as $$
declare
  new_org   uuid;
  uid       uuid := auth.uid();
  country   text := upper(btrim(coalesce(p_country_code, 'ZA')));
  currency  text := upper(btrim(coalesce(p_currency_code, 'ZAR')));
  catalogue public.subscription_plans;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Validated here rather than left to the column cast. char(2) silently
  -- truncates anything longer, so 'ZAF' would have been stored as 'ZA' and
  -- nobody would have been told.
  if length(country) <> 2 then
    raise exception 'country code must be two letters, got %', country
      using errcode = '22023';
  end if;

  if length(currency) <> 3 then
    raise exception 'currency code must be three letters, got %', currency
      using errcode = '22023';
  end if;

  -- The one statement that differs from migration 08. Read before the
  -- organisation is written so that a missing or unpriced Starter row stops
  -- the whole thing, rather than leaving an organisation behind with no
  -- subscription against it.
  select * into catalogue from public.subscription_plans where plan = 'starter';
  if not found then
    raise exception 'the starter plan is missing from the price list'
      using errcode = 'P0002';
  end if;
  if catalogue.price_cents_monthly is null then
    raise exception 'the starter plan has no published price'
      using errcode = '22023';
  end if;

  insert into public.organisations (name, slug, industry, country_code, currency_code)
  values (p_name, lower(p_slug), p_industry, country, currency)
  returning id into new_org;

  insert into public.organisation_members (organisation_id, user_id, role, status, scope_kind)
  values (new_org, uid, 'org_admin', 'active', 'organisation');

  insert into public.subscriptions (
    organisation_id, plan, status, trial_ends_at,
    price_cents_monthly, seats, data_source_limit, ai_credits_monthly, currency_code)
  values (
    new_org, 'starter', 'trialing',
    -- The trial length is the plan's own, not a number repeated here.
    now() + make_interval(days => coalesce(catalogue.trial_days, 30)),
    catalogue.price_cents_monthly, catalogue.seats, catalogue.data_source_limit,
    catalogue.ai_credits_monthly, catalogue.currency_code);

  insert into public.health_score_weights (organisation_id, category, weight) values
    (new_org, 'financial',   0.25),
    (new_org, 'operational', 0.20),
    (new_org, 'sales',       0.20),
    (new_org, 'growth',      0.15),
    (new_org, 'customer',    0.10),
    (new_org, 'strategic',   0.10);

  insert into public.opportunity_score_weights (organisation_id) values (new_org);

  insert into public.audit_logs (organisation_id, actor_id, action, entity_type, entity_id, summary)
  values (new_org, uid, 'organisation.created', 'organisation', new_org::text, p_name);

  return new_org;
end;
$$;

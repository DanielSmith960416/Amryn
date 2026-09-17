-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 48 — a subscription takes its terms from the price list
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
-- organisation took its terms from those defaults rather than from the price
-- list.
--
-- On 10 September migration 36 raised every published price — Starter from
-- 99900 to 149900 — by updating subscription_plans. It did not touch these
-- defaults, because nothing said they were a second copy of the same numbers.
--
-- So since 10 September every organisation created has been stamped R999 a
-- month whatever Starter actually costs. An audit of the two live
-- organisations found exactly that.
--
-- The defaults are also wrong in a second way that no price change is needed
-- to expose: they are Starter's numbers, and they were applied to every
-- insert whatever plan it named. A row saying `plan = 'professional'` got
-- three seats and two data sources.
--
-- ── the fix ───────────────────────────────────────────────────────────────
--
-- The numbers belong in one place, and that place is subscription_plans —
-- already what apply_subscription_plan() and the billing page read. So the
-- frozen defaults go, and a trigger fills whatever an insert left out from
-- the plan that insert names.
--
-- A trigger rather than making each caller read the catalogue itself. There
-- are more writers than the obvious one: create_organisation() and five
-- schema-test fixtures, each of which names a plan and reasonably expects its
-- terms to follow. Pushing that lookup into every caller means every future
-- caller has to know to do it, and the one that forgets writes a subscription
-- whose terms do not match its own plan — which is the bug being fixed here,
-- reintroduced by the fix.
--
-- Only nulls are filled. A value supplied explicitly is kept, because seats
-- can be negotiated above the catalogue — the same rule
-- apply_subscription_plan() already applies when it takes
-- greatest(catalogue.seats, s.seats).
--
-- ── what this does not change ─────────────────────────────────────────────
--
-- Nothing already recorded. This is BEFORE INSERT only: an existing row is
-- never touched, and no plan change re-prices anyone. apply_subscription_plan()
-- has always read the catalogue, so a row that went through a paid activation
-- holds the price of the day it was activated — which is what that customer
-- agreed to pay. Reconciling a grandfathered price to today's list is a
-- billing decision rather than a schema one, and is left to a person.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.subscriptions alter column price_cents_monthly drop default;
alter table public.subscriptions alter column seats               drop default;
alter table public.subscriptions alter column data_source_limit   drop default;
alter table public.subscriptions alter column ai_credits_monthly  drop default;

comment on column public.subscriptions.price_cents_monthly is
  'What this organisation pays, as at the day the plan was applied. Filled '
  'from subscription_plans on insert and by apply_subscription_plan() on a '
  'plan change, and deliberately not re-synced when the price list moves: a '
  'customer keeps the price they signed at. Read subscription_plans for what '
  'a tier costs today.';

create or replace function amryn.subscription_terms_from_plan()
returns trigger
language plpgsql
-- Pinned so the body cannot be redirected to a caller-controlled schema. Not
-- SECURITY DEFINER: it runs as whoever is inserting, and reads a table every
-- role may already read.
set search_path = public, pg_temp
as $$
declare
  catalogue public.subscription_plans;
begin
  select * into catalogue from public.subscription_plans where plan = new.plan;

  -- A plan with no row in the price list is a mistake worth stopping for.
  -- Letting it through writes a subscription with no terms at all, which
  -- fails on the not-null columns a moment later with a far worse message.
  if not found then
    raise exception 'no such plan in the price list: %', new.plan
      using errcode = '22023';
  end if;

  new.price_cents_monthly := coalesce(new.price_cents_monthly, catalogue.price_cents_monthly);
  new.seats               := coalesce(new.seats,               catalogue.seats);
  new.ai_credits_monthly  := coalesce(new.ai_credits_monthly,  catalogue.ai_credits_monthly);

  -- data_source_limit is nullable on both sides, and null means unlimited.
  -- Enterprise has no limit, so an insert that leaves this out keeps null and
  -- that is the right answer rather than a missing one.
  new.data_source_limit   := coalesce(new.data_source_limit,   catalogue.data_source_limit);

  -- Enterprise is negotiated and carries no published monthly price, so this
  -- can still be null here. The not-null constraint on the column is what
  -- says so, and it says it at the moment somebody tries.
  if new.price_cents_monthly is null then
    raise exception 'the % plan has no published price', catalogue.name
      using errcode = '22023',
            hint = 'Set price_cents_monthly explicitly for a negotiated tier.';
  end if;

  return new;
end;
$$;

comment on function amryn.subscription_terms_from_plan() is
  'Fills a new subscription''s price and quotas from subscription_plans where '
  'the insert did not state them. Explicit values are kept, so a negotiated '
  'seat count survives.';

create trigger subscriptions_terms_from_plan
  before insert on public.subscriptions
  for each row execute function amryn.subscription_terms_from_plan();

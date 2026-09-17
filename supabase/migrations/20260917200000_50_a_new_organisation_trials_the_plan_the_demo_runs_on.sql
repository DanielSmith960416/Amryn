-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 50 — a new organisation trials the plan the product is shown on
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Reported as: when a new email signs up, it should work exactly like the
-- demonstration account. It does not, and the difference is one column.
--
-- create_organisation() has opened every subscription on 'starter' since
-- migration 06. The account the product is actually demonstrated on was moved
-- to 'growth'. Those two plans differ by exactly four entitlements:
--
--     market_intelligence     starter: no    growth: yes
--     opportunity_pipeline    starter: no    growth: yes
--     report_monthly          starter: no    growth: yes
--     risk_radar              starter: no    growth: yes
--
-- So somebody signing up sees the Command Centre, the financial screens and
-- the assistant — and finds the AI OpportunityRadar® and the risk radar behind
-- an upgrade wall, on day one, during a trial. They are being asked to decide
-- whether to buy the thing they were not allowed to look at.
--
-- A trial that withholds most of what is being sold is not a trial.
--
-- ── why a flag and not 'growth' written into the function ─────────────────
-- Which plan a trial runs on is a commercial decision, and commercial
-- decisions change more often than schemas. Written into the function body it
-- would take a migration, a deploy and somebody who knows plpgsql to change a
-- number that belongs to whoever sets the pricing.
--
-- It is a column on the price list instead, beside the price and the trial
-- length, where the rest of that decision already lives. Moving trials to
-- Professional is then one UPDATE.
--
-- Purely additive: one nullable-defaulted column, one index, one UPDATE
-- against the catalogue table, and a function body. No existing subscription
-- is read or written — every organisation that already has one keeps the plan,
-- the price and the trial end date it has today.

-- ── the catalogue says which plan a trial runs on ─────────────────────────

alter table public.subscription_plans
  add column if not exists is_trial_default boolean not null default false;

comment on column public.subscription_plans.is_trial_default is
  'The plan a newly created organisation trials on. At most one row may be true; '
  'create_organisation() falls back to the cheapest public plan if none is.';

-- At most one, enforced rather than agreed. Two rows marked true would make
-- what a new customer gets depend on which one the planner happened to read
-- first, and that is not a thing anybody would think to test.
create unique index if not exists subscription_plans_one_trial_default
  on public.subscription_plans ((true))
  where is_trial_default;

update public.subscription_plans set is_trial_default = true where plan = 'growth';

-- ── create_organisation reads it ──────────────────────────────────────────
--
-- Replaced in full rather than patched, because `create or replace function`
-- takes the whole body. Everything else about it is unchanged: the same
-- signature, the same SECURITY DEFINER with a pinned search_path, the same
-- validation, the same membership, weights and audit row in the same order.
--
-- Two lines are different. The plan comes from the catalogue, and so does the
-- trial length — 30 days was written here and again in subscription_plans.
-- trial_days, and the copy here was the one nobody would remember to change.

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
  new_org  uuid;
  uid      uuid := auth.uid();
  country  text := upper(btrim(coalesce(p_country_code, 'ZA')));
  currency text := upper(btrim(coalesce(p_currency_code, 'ZAR')));
  trial    public.subscription_plans;
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

  -- The flagged plan, or the cheapest public one if nobody has flagged any.
  -- A signup must never be the thing that fails because a catalogue row was
  -- edited, so there is always an answer here.
  select * into trial
    from public.subscription_plans
   where is_trial_default
   limit 1;

  if not found then
    select * into trial
      from public.subscription_plans
     where is_public and price_cents_monthly is not null
     order by price_cents_monthly
     limit 1;
  end if;

  if not found then
    raise exception 'the price list has no plan to start a trial on'
      using errcode = '22023';
  end if;

  insert into public.organisations (name, slug, industry, country_code, currency_code)
  values (p_name, lower(p_slug), p_industry, country, currency)
  returning id into new_org;

  insert into public.organisation_members (organisation_id, user_id, role, status, scope_kind)
  values (new_org, uid, 'org_admin', 'active', 'organisation');

  -- The terms themselves are left null on purpose: migration 48's trigger
  -- fills price, seats, data sources and AI credits from this same catalogue
  -- row. Naming them here would be a second copy of the price list, and the
  -- frozen defaults that trigger exists to replace are exactly what that
  -- produced last time.
  insert into public.subscriptions (organisation_id, plan, status, trial_ends_at)
  values (
    new_org,
    trial.plan,
    'trialing',
    now() + make_interval(days => greatest(coalesce(trial.trial_days, 30), 1))
  );

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

-- anon must never reach this: it writes an organisation and an admin
-- membership, and it runs as its owner. Restated because `create or replace`
-- keeps the existing grants, and a future drop-and-recreate would not.
revoke all on function public.create_organisation(text, text, text, text, text) from public, anon;
grant execute on function public.create_organisation(text, text, text, text, text) to authenticated;

-- PostgREST resolves a remote call against a cache of the schema, not against
-- the schema. Without this the new body exists and the old one keeps being
-- described until something else happens to reload it.
notify pgrst, 'reload schema';

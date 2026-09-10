-- ═══════════════════════════════════════════════════════════════════════════
-- 36. The 2026 price list, and the entitlements connectors will need
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Two changes that belong together because the second is what the first is
-- charging for.
--
-- ── the price list ───────────────────────────────────────────────────────
--
-- Starter R999 → R1,499, Growth R3,999 → R4,999, Professional R9,999 →
-- R12,999, Enterprise from a single R20,000 to a negotiated R25,000–R75,000.
--
-- No price is hardcoded anywhere in the application — the billing page reads
-- subscription_plans and always has — so this is the whole of the repricing.
-- That was a deliberate decision made in migration 16 and it is the reason
-- this migration is nine lines of update rather than a search through forty
-- components.
--
-- ── two things the table could not say ───────────────────────────────────
--
-- **A negotiated range.** Enterprise is quoted per contract, and one
-- price_cents_monthly column can only hold the floor. It has been holding
-- R20,000 and the sales conversation has been carrying the rest, which means
-- the number on the page has never been the number anyone pays. A ceiling
-- column lets the page say "R25,000 to R75,000+" and mean it.
--
-- **Implementation fees.** These exist commercially and have never existed in
-- the schema — not a column, not a table, not a line of interface. A customer
-- on Growth is quoted somewhere between R7,500 and R20,000 to be set up, and
-- until now the only place that lived was in a person's head. A range per
-- tier, because the fee genuinely varies with how much of the customer's
-- estate has to be connected, and a single number would be a fiction.
--
-- ── eight new entitlements, and the six that already existed ────────────
--
-- The connector brief asked for fifteen entitlement keys. Six of them are
-- already here under Amryn's own names — opportunity_pipeline is the
-- Opportunity Radar, custom_reports is advanced reporting, ai_assistant and
-- ai_credits together are the AI tier, and branches, api_access and sso are
-- themselves. Adding second keys for those would split enforcement across two
-- vocabularies, and the half of the application that checked the older name
-- would silently keep working while the other half diverged.
--
-- So eight are added — the seven asked for plus digital_twin, which the
-- brief lists and which has until now been gated by a feature flag rather
-- than by what anybody bought — and the rest are mapped to what exists.
--
-- max_connections is deliberately NOT among them: data_sources is already the
-- quota for "how many systems may feed the platform", already carries
-- per-plan ceilings, and is already displayed on the billing page. A second
-- key counting the same thing is how two limits come to disagree.
--
-- ── Professional loses unlimited sources ─────────────────────────────────
--
-- From null (no limit) to 20. This is a reduction and it is the one change
-- here that could take something away from somebody, so: no organisation is
-- on Professional today — the only subscription in the database is not — and
-- nothing is withdrawn from anyone. Recorded plainly rather than left for
-- someone to discover in a diff.
--
-- Additive throughout: three new columns, eight new catalogue rows, and
-- updates to values. No drop, no destructive alter, nothing removed.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── a ceiling for negotiated pricing, and the implementation fee ─────────

alter table public.subscription_plans
  add column if not exists price_cents_monthly_max   integer,
  add column if not exists implementation_fee_cents_min integer,
  add column if not exists implementation_fee_cents_max integer;

comment on column public.subscription_plans.price_cents_monthly_max is
  'Upper bound of a negotiated range. Null where the published monthly price is the price.';
comment on column public.subscription_plans.implementation_fee_cents_min is
  'One-off setup fee, lower bound. Null where implementation is not charged.';
comment on column public.subscription_plans.implementation_fee_cents_max is
  'One-off setup fee, upper bound. Null where the fee is a single figure or not charged.';

alter table public.subscription_plans
  add constraint subscription_plans_price_range_ordered
    check (
      price_cents_monthly_max is null
      or price_cents_monthly is null
      or price_cents_monthly_max >= price_cents_monthly
    ),
  add constraint subscription_plans_fee_range_ordered
    check (
      implementation_fee_cents_max is null
      or implementation_fee_cents_min is null
      or implementation_fee_cents_max >= implementation_fee_cents_min
    ),
  add constraint subscription_plans_fee_not_negative
    check (
      (implementation_fee_cents_min is null or implementation_fee_cents_min >= 0)
      and (implementation_fee_cents_max is null or implementation_fee_cents_max >= 0)
    );

-- ── the prices ───────────────────────────────────────────────────────────
--
-- Annual is eleven months for twelve, which is the discount migration 16 set
-- and this keeps. Enterprise has no annual price because it has no published
-- monthly one either.

update public.subscription_plans set
  price_cents_monthly          = 149900,
  price_cents_annual           = 1648900,
  implementation_fee_cents_min = 250000,
  implementation_fee_cents_max = 750000,
  updated_at                   = now()
where plan = 'starter';

update public.subscription_plans set
  price_cents_monthly          = 499900,
  price_cents_annual           = 5498900,
  implementation_fee_cents_min = 750000,
  implementation_fee_cents_max = 2000000,
  updated_at                   = now()
where plan = 'growth';

update public.subscription_plans set
  price_cents_monthly          = 1299900,
  price_cents_annual           = 14298900,
  implementation_fee_cents_min = 2000000,
  implementation_fee_cents_max = 5000000,
  updated_at                   = now()
where plan = 'professional';

update public.subscription_plans set
  price_cents_monthly          = 2500000,
  price_cents_monthly_max      = 7500000,
  price_cents_annual           = null,
  implementation_fee_cents_min = 5000000,
  implementation_fee_cents_max = 25000000,
  updated_at                   = now()
where plan = 'enterprise';

-- ── the eight new entitlements ───────────────────────────────────────────
--
-- Sort orders continue from 21, so the billing page lists them after the
-- existing catalogue rather than interleaved with it.

insert into public.entitlements (key, category, name, description, kind, sort_order) values
  ('digital_twin',          'Intelligence', 'Digital Twin',              'A working model of the business, run against scenarios.',      'feature', 22),
  ('microsoft_365',         'Connectors',   'Microsoft 365',             'Outlook, Teams, SharePoint, OneDrive and Excel.',              'feature', 23),
  ('google_workspace',      'Connectors',   'Google Workspace',          'Gmail, Drive, Sheets and Calendar.',                           'feature', 24),
  ('power_bi',              'Connectors',   'Power BI',                  'Reports, dashboards and datasets read into Amryn.',            'feature', 25),
  ('enterprise_connectors', 'Connectors',   'Enterprise systems',        'SAP, Dynamics 365 and Salesforce.',                            'feature', 26),
  ('custom_connectors',     'Connectors',   'Connectors built for you',  'A system of yours that nobody else connects.',                 'feature', 27),
  ('workflows',             'Operations',   'Workflows',                 'Actions that run when the numbers say they should.',           'feature', 28),
  ('ai_agents',             'Intelligence', 'AI agents',                 'Agents that carry out analysis without being asked each time.', 'feature', 29)
on conflict (key) do nothing;

-- ── who gets what ────────────────────────────────────────────────────────
--
-- The shape of the ladder: Starter is the business itself; Growth adds the
-- systems a growing company runs on; Professional adds the Microsoft and
-- analytics estate that a multi-branch operation lives in; Enterprise adds
-- the systems that require a procurement process to connect to.

insert into public.plan_entitlements (plan, entitlement_key, included, limit_value) values
  -- Digital Twin: the product's centre, included everywhere.
  ('starter',      'digital_twin',          true,  null),
  ('growth',       'digital_twin',          true,  null),
  ('professional', 'digital_twin',          true,  null),
  ('enterprise',   'digital_twin',          true,  null),

  ('starter',      'microsoft_365',         false, null),
  ('growth',       'microsoft_365',         false, null),
  ('professional', 'microsoft_365',         true,  null),
  ('enterprise',   'microsoft_365',         true,  null),

  ('starter',      'google_workspace',      false, null),
  ('growth',       'google_workspace',      false, null),
  ('professional', 'google_workspace',      true,  null),
  ('enterprise',   'google_workspace',      true,  null),

  ('starter',      'power_bi',              false, null),
  ('growth',       'power_bi',              false, null),
  ('professional', 'power_bi',              true,  null),
  ('enterprise',   'power_bi',              true,  null),

  ('starter',      'enterprise_connectors', false, null),
  ('growth',       'enterprise_connectors', false, null),
  ('professional', 'enterprise_connectors', false, null),
  ('enterprise',   'enterprise_connectors', true,  null),

  ('starter',      'custom_connectors',     false, null),
  ('growth',       'custom_connectors',     false, null),
  ('professional', 'custom_connectors',     false, null),
  ('enterprise',   'custom_connectors',     true,  null),

  ('starter',      'workflows',             false, null),
  ('growth',       'workflows',             false, null),
  ('professional', 'workflows',             true,  null),
  ('enterprise',   'workflows',             true,  null),

  ('starter',      'ai_agents',             false, null),
  ('growth',       'ai_agents',             false, null),
  ('professional', 'ai_agents',             true,  null),
  ('enterprise',   'ai_agents',             true,  null)
on conflict (plan, entitlement_key) do nothing;

-- ── the connection ceilings ──────────────────────────────────────────────
--
-- 2 / 8 / 20 / unlimited, against a brief asking for 1–2, 5–8, 10–20+ and
-- per contract. Starter and Growth already sat at the top of their band and
-- are unchanged; Professional becomes a number.

update public.plan_entitlements
   set limit_value = 20
 where entitlement_key = 'data_sources'
   and plan = 'professional';

-- subscription_plans carries its own denormalised copy, used when a
-- subscription row is created. Left in step with the entitlement matrix,
-- because two numbers that mean the same thing must not be allowed to drift.
update public.subscription_plans
   set data_source_limit = 20,
       updated_at        = now()
 where plan = 'professional';

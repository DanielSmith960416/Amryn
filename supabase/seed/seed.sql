-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software — demonstration seed
--
-- Populates one organisation, Highveld Supply Co., with twelve months of
-- plausible trading history so that every module has something true to show
-- on a fresh install. Safe to re-run: it is keyed on a fixed organisation id
-- and clears that organisation first.
--
-- The radar surfaces commercial opportunities and tenders alike: Highveld is
-- a wholesaler, and a schools supply tender is ordinary revenue to them. What
-- Amryn itself will and will not take on is a matter for Amryn's positioning,
-- not for a customer's opportunity list.
-- ═══════════════════════════════════════════════════════════════════════════

\set org_id '\'e5f6a7b8-0000-4000-8000-000000000001\''

begin;

delete from public.organisations where id = :org_id;

insert into public.organisations (id, name, slug, industry, country_code, currency_code, strategy_profile)
values (
  :org_id, 'Highveld Supply Co.', 'highveld', 'Wholesale distribution', 'ZA', 'ZAR',
  jsonb_build_object(
    'markets', jsonb_build_array('Gauteng', 'Mpumalanga', 'North West'),
    'segments', jsonb_build_array('Independent retail', 'Hospitality', 'Contract catering'),
    'capabilities', jsonb_build_array('Cold chain', 'Next-day delivery', 'Bulk pricing tiers'),
    'growth_intents', jsonb_build_array('Weekend delivery', 'Category expansion', 'Supplier consolidation')
  )
);

insert into public.subscriptions (organisation_id, plan, status, seats, data_source_limit, ai_credits_monthly)
values (:org_id, 'growth', 'active', 15, 8, 5000);

insert into public.health_score_weights (organisation_id, category, weight) values
  (:org_id, 'financial', 0.25), (:org_id, 'operational', 0.20), (:org_id, 'sales', 0.20),
  (:org_id, 'growth', 0.15), (:org_id, 'customer', 0.10), (:org_id, 'strategic', 0.10);

insert into public.opportunity_score_weights (organisation_id) values (:org_id);

-- ── structure ─────────────────────────────────────────────────────────────

insert into public.regions (id, organisation_id, name, code) values
  ('e5f6a7b8-0000-4000-8000-00000000ff01'::uuid, :org_id, 'Gauteng', 'GP'),
  ('e5f6a7b8-0000-4000-8000-00000000ff02'::uuid, :org_id, 'Mpumalanga', 'MP');

insert into public.branches (id, organisation_id, region_id, name, code, city, headcount) values
  ('e5f6a7b8-0000-4000-8000-00000000bb01'::uuid, :org_id, 'e5f6a7b8-0000-4000-8000-00000000ff01'::uuid, 'Germiston', 'GER', 'Germiston', 42),
  ('e5f6a7b8-0000-4000-8000-00000000bb02'::uuid, :org_id, 'e5f6a7b8-0000-4000-8000-00000000ff01'::uuid, 'Pretoria West', 'PTW', 'Pretoria', 31),
  ('e5f6a7b8-0000-4000-8000-00000000bb03'::uuid, :org_id, 'e5f6a7b8-0000-4000-8000-00000000ff02'::uuid, 'Nelspruit', 'NLS', 'Mbombela', 18);

insert into public.departments (organisation_id, branch_id, name, function) values
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000bb01'::uuid, 'Warehouse', 'operations'),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000bb01'::uuid, 'Sales', 'commercial'),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000bb02'::uuid, 'Sales', 'commercial'),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000bb03'::uuid, 'Distribution', 'operations');

-- ── data sources ──────────────────────────────────────────────────────────

insert into public.data_sources (id, organisation_id, name, category, provider, description) values
  ('e5f6a7b8-0000-4000-8000-00000000dd01'::uuid, :org_id, 'Sage Accounting', 'accounting', 'Sage', 'General ledger, invoices and expenses'),
  ('e5f6a7b8-0000-4000-8000-00000000dd02'::uuid, :org_id, 'Branch POS export', 'pos', 'Pilot POS', 'Daily till exports per branch'),
  ('e5f6a7b8-0000-4000-8000-00000000dd03'::uuid, :org_id, 'Customer sheet', 'spreadsheet', 'Google Sheets', 'Account owners and credit terms');

insert into public.data_connections (organisation_id, data_source_id, status, sync_schedule, last_synced_at) values
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000dd01'::uuid, 'connected', 'daily', now() - interval '4 hours'),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000dd02'::uuid, 'connected', 'daily', now() - interval '9 hours'),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000dd03'::uuid, 'error', 'weekly', now() - interval '8 days');

update public.data_connections
   set last_error = 'Sheet permissions revoked — reauthorise the connection', consecutive_errors = 3
 where data_source_id = 'e5f6a7b8-0000-4000-8000-00000000dd03'::uuid;

insert into public.data_health_checks (organisation_id, data_source_id, completeness_score, freshness_hours, error_count, missing_fields) values
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000dd01'::uuid, 98.4, 4, 0, '{}'),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000dd02'::uuid, 91.2, 9, 2, '{margin}'),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000dd03'::uuid, 62.0, 192, 11, '{credit_terms,account_owner}');

-- ── metric definitions ────────────────────────────────────────────────────

insert into public.business_metrics
  (id, organisation_id, key, label, kind, unit, higher_is_better, health_category, health_weight, target_value)
values
  ('e5f6a7b8-0000-4000-8000-00000000e001'::uuid, :org_id, 'revenue', 'Monthly revenue', 'financial', 'currency', true, 'financial', 0.40, 1400000),
  ('e5f6a7b8-0000-4000-8000-00000000e002'::uuid, :org_id, 'gross_margin', 'Gross margin', 'financial', 'percent', true, 'financial', 0.35, 32),
  ('e5f6a7b8-0000-4000-8000-00000000e003'::uuid, :org_id, 'operating_cost', 'Operating cost', 'financial', 'currency', false, 'financial', 0.25, 620000),
  ('e5f6a7b8-0000-4000-8000-00000000e004'::uuid, :org_id, 'delivery_days', 'Average delivery days', 'operational', 'days', false, 'operational', 0.55, 3.0),
  ('e5f6a7b8-0000-4000-8000-00000000e005'::uuid, :org_id, 'stock_turn', 'Stock turn', 'operational', 'ratio', true, 'operational', 0.45, 9),
  ('e5f6a7b8-0000-4000-8000-00000000e006'::uuid, :org_id, 'orders', 'Orders placed', 'sales', 'count', true, 'sales', 0.50, 1500),
  ('e5f6a7b8-0000-4000-8000-00000000e007'::uuid, :org_id, 'average_order_value', 'Average order value', 'sales', 'currency', true, 'sales', 0.50, 4000),
  ('e5f6a7b8-0000-4000-8000-00000000e008'::uuid, :org_id, 'active_customers', 'Active customers', 'customer', 'count', true, 'customer', 0.60, 380),
  ('e5f6a7b8-0000-4000-8000-00000000e009'::uuid, :org_id, 'churn_rate', 'Customer churn', 'customer', 'percent', false, 'customer', 0.40, 2.5),
  ('e5f6a7b8-0000-4000-8000-00000000e010'::uuid, :org_id, 'revenue_growth', 'Revenue growth (YoY)', 'growth', 'percent', true, 'growth', 1.00, 12);

-- ── twelve months of measurements ─────────────────────────────────────────
-- Deterministic series, not random, so the seeded narrative always matches the
-- numbers: revenue climbing, delivery slipping, costs running ahead of it.

with months as (
  select
    generate_series(
      date_trunc('month', current_date) - interval '11 months',
      date_trunc('month', current_date),
      interval '1 month'
    )::date as period_start,
    generate_series(0, 11) as n
),
series as (
  select m.period_start, m.n,
         (m.period_start + interval '1 month - 1 day')::date as period_end
  from months m
)
insert into public.metric_values
  (organisation_id, metric_id, period_start, period_end, granularity, value, data_source_id)
select :org_id, v.metric_id, s.period_start, s.period_end, 'month', v.value,
       'e5f6a7b8-0000-4000-8000-00000000dd01'::uuid
from series s
cross join lateral (values
  ('e5f6a7b8-0000-4000-8000-00000000e001'::uuid, round((840000 + s.n * 36000 + (case when s.n % 3 = 0 then 21000 else -9000 end))::numeric, 2)),
  ('e5f6a7b8-0000-4000-8000-00000000e002'::uuid, round((31.8 - s.n * 0.16)::numeric, 2)),
  -- Costs accelerate from month seven; this is the anomaly the twin should find.
  ('e5f6a7b8-0000-4000-8000-00000000e003'::uuid, round((498000 + s.n * 9000 + greatest(0, s.n - 7) * 38000)::numeric, 2)),
  ('e5f6a7b8-0000-4000-8000-00000000e004'::uuid, round((3.1 + greatest(0, s.n - 8) * 0.34)::numeric, 2)),
  ('e5f6a7b8-0000-4000-8000-00000000e005'::uuid, round((8.4 + s.n * 0.07)::numeric, 2)),
  ('e5f6a7b8-0000-4000-8000-00000000e006'::uuid, round((1180 + s.n * 27)::numeric, 2)),
  ('e5f6a7b8-0000-4000-8000-00000000e007'::uuid, round((3410 + s.n * 22)::numeric, 2)),
  ('e5f6a7b8-0000-4000-8000-00000000e008'::uuid, round((296 + s.n * 4)::numeric, 2)),
  ('e5f6a7b8-0000-4000-8000-00000000e009'::uuid, round((4.1 - s.n * 0.09)::numeric, 2)),
  ('e5f6a7b8-0000-4000-8000-00000000e010'::uuid, round((6.2 + s.n * 0.31)::numeric, 2))
) as v(metric_id, value);

-- Per-branch revenue, so branch comparison has something to compare.
with months as (
  select generate_series(
      date_trunc('month', current_date) - interval '11 months',
      date_trunc('month', current_date), interval '1 month')::date as period_start,
    generate_series(0, 11) as n
)
insert into public.metric_values
  (organisation_id, metric_id, branch_id, period_start, period_end, granularity, value)
select :org_id, 'e5f6a7b8-0000-4000-8000-00000000e001'::uuid, b.id, m.period_start,
       (m.period_start + interval '1 month - 1 day')::date, 'month',
       round((b.base + m.n * b.slope)::numeric, 2)
from months m
cross join (values
  ('e5f6a7b8-0000-4000-8000-00000000bb01'::uuid, 430000, 21000),
  ('e5f6a7b8-0000-4000-8000-00000000bb02'::uuid, 268000, 12500),
  -- Nelspruit is the branch that has stopped growing.
  ('e5f6a7b8-0000-4000-8000-00000000bb03'::uuid, 142000, 2500)
) as b(id, base, slope);

-- ── health history ────────────────────────────────────────────────────────

insert into public.business_health_scores
  (organisation_id, score, classification, category_scores, weights, calculated_for)
select :org_id,
       round((72 + n * 0.55)::numeric, 2),
       case when 72 + n * 0.55 >= 75 then 'healthy' else 'attention' end,
       jsonb_build_object(
         'financial', round((74 + n * 0.4)::numeric, 1),
         'operational', round((81 - n * 0.9)::numeric, 1),
         'sales', round((70 + n * 0.9)::numeric, 1),
         'growth', round((64 + n * 1.1)::numeric, 1),
         'customer', round((77 + n * 0.3)::numeric, 1),
         'strategic', 68.0
       ),
       '{"financial":0.25,"operational":0.20,"sales":0.20,"growth":0.15,"customer":0.10,"strategic":0.10}'::jsonb,
       (date_trunc('month', current_date) - ((11 - n) || ' months')::interval)::date
from generate_series(0, 11) as n;

-- ── what the twin found ───────────────────────────────────────────────────

insert into public.business_events (organisation_id, branch_id, kind, severity, title, detail, occurred_at) values
  (:org_id, null, 'anomaly', 'high',
   'Operating cost is rising faster than revenue',
   'Operating cost is up 27% over four months against 11% revenue growth in the same window. The gap opened in month seven and has widened every month since.',
   now() - interval '2 days'),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000bb03'::uuid, 'trend', 'medium',
   'Nelspruit revenue has flattened',
   'Nelspruit has added 1.8% over eleven months while the group added 41%. It is not declining — it has stopped moving.',
   now() - interval '4 days'),
  (:org_id, null, 'trend', 'medium',
   'Average delivery time slipped past three days',
   'Three consecutive months of deterioration, now at 4.1 days against a 3.0 target.',
   now() - interval '6 days'),
  (:org_id, null, 'milestone', 'low',
   'Churn fell below 3% for the first time',
   'Customer churn is 3.0%, down from 4.1% a year ago. The win-back campaign is the most likely cause.',
   now() - interval '9 days');

insert into public.business_insights
  (organisation_id, headline, narrative, category, direction, impact_cents, confidence, evidence)
values
  (:org_id,
   'Margin is being spent, not lost',
   'Revenue is growing and gross margin is broadly holding, but operating cost has run ahead of both since month seven. The business is trading well and paying more to do it. On current trend the cost line absorbs the whole of this year''s revenue gain within two quarters.',
   'financial', 'down', -120000000, 0.82,
   '[{"metric":"operating_cost","change":"+27% over 4 months"},{"metric":"revenue","change":"+11% over 4 months"}]'::jsonb),
  (:org_id,
   'Delivery is the operational risk worth watching',
   'Average delivery time has climbed for three months running and is now a full day past target. Delivery reliability is the reason two of the top ten accounts named for staying.',
   'operational', 'down', null, 0.74,
   '[{"metric":"delivery_days","change":"3.1 → 4.1 days"}]'::jsonb);

-- ── the market outside ────────────────────────────────────────────────────

insert into public.market_sources (organisation_id, name, kind, sector_policy, reliability) values
  (:org_id, 'Regional trade press', 'news', '{private}', 0.72),
  (:org_id, 'Company registry filings', 'company_filing', '{private}', 0.91),
  (:org_id, 'Category search demand', 'search_trend', '{private}', 0.64);

insert into public.competitors (id, organisation_id, name, markets, threat_level) values
  ('e5f6a7b8-0000-4000-8000-00000000cc01'::uuid, :org_id, 'Kruger Wholesale', '{Gauteng}', 'high'),
  ('e5f6a7b8-0000-4000-8000-00000000cc02'::uuid, :org_id, 'Nkosi Trading', '{Gauteng,Mpumalanga}', 'medium'),
  ('e5f6a7b8-0000-4000-8000-00000000cc03'::uuid, :org_id, 'Vaal Distributors', '{Gauteng}', 'medium');

insert into public.competitor_events (organisation_id, competitor_id, kind, title, detail, impact, observed_on) values
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000cc01'::uuid, 'pricing',
   'Kruger cut list prices 6% across dry goods',
   'Their delivery fee rose R120 in the same week, so the effective cut is nearer 2% for a typical basket.',
   'high', current_date - 8),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000cc02'::uuid, 'expansion',
   'Nkosi Trading opened a Benoni depot',
   'First time a direct competitor sits inside the Germiston delivery ring.',
   'high', current_date - 9),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000cc03'::uuid, 'hiring',
   'Vaal Distributors is hiring three sales representatives',
   'Roles are Gauteng North. A build-out rather than replacement hiring.',
   'medium', current_date - 11);

insert into public.market_signals
  (organisation_id, kind, sector, title, summary, relevance, confidence, keywords, observed_at)
values
  (:org_id, 'demand', 'private',
   'Weekend wholesale delivery demand up 34%',
   'Search demand for Saturday wholesale delivery across your categories has risen 34% since March. No competitor within 40km advertises weekend dispatch.',
   0.88, 0.71, '{delivery,weekend,demand}', now() - interval '3 days'),
  (:org_id, 'industry', 'private',
   'Two input suppliers dropped minimum order quantities',
   'Both of your largest input suppliers cut minimums this month to clear stock ahead of the season.',
   0.79, 0.86, '{supplier,pricing,inventory}', now() - interval '5 days'),
  (:org_id, 'market', 'private',
   'Contract catering is consolidating in Mpumalanga',
   'Three mid-sized caterers merged; the combined group is retendering its supply arrangements in the new year.',
   0.74, 0.63, '{catering,consolidation,mpumalanga}', now() - interval '7 days'),
  (:org_id, 'trend', 'private',
   'Independent retail is shifting to smaller, more frequent orders',
   'Basket sizes are falling while order frequency rises — a working-capital response, not a demand fall.',
   0.66, 0.69, '{retail,ordering,working-capital}', now() - interval '12 days');

-- ── opportunities ─────────────────────────────────────────────────────────

insert into public.opportunities
  (id, organisation_id, title, kind, sector, counterparty, summary, why_it_matters,
   recommended_action, estimated_value_cents, stage, score, classification, closes_on, is_saved)
values
  ('e5f6a7b8-0000-4000-8000-00000000aa01'::uuid, :org_id,
   'Nobody serves the East Rand on Saturdays', 'market_expansion', 'private', null,
   'Weekend delivery demand in your categories is up 34% since March and no competitor within 40km advertises Saturday dispatch.',
   'Your Saturday fleet already runs at 40% capacity, so the marginal cost of serving this is close to nil.',
   'Pilot Saturday dispatch on the Germiston route for six weeks and measure attach rate on existing accounts.',
   21000000, 'qualified', 84.2, 'high_priority', current_date + 84, true),

  ('e5f6a7b8-0000-4000-8000-00000000aa02'::uuid, :org_id,
   'Suppliers dropped minimums — buy forward', 'supplier', 'private', 'Two primary input suppliers',
   'Both largest input suppliers cut minimum order quantities this month to move stock ahead of the season.',
   'Cash position supports carrying the stock, and buying forward at current rates protects margin into Q1 against the cost trend the twin has flagged.',
   'Model a forward buy at the current rate against the next two quarters of demand before the offer closes.',
   15500000, 'analysing', 76.5, 'strong', current_date + 42, true),

  ('e5f6a7b8-0000-4000-8000-00000000aa03'::uuid, :org_id,
   'Merged catering group retenders supply', 'partnership', 'private', 'Mpumalanga catering group',
   'Three mid-sized caterers merged and the combined group is retendering its supply arrangements in the new year.',
   'Nelspruit has stopped growing and has the capacity to serve this. It is the clearest available answer to that branch.',
   'Route the introduction through the Nelspruit branch manager and prepare a cold-chain reference pack.',
   48000000, 'discovered', 71.8, 'strong', current_date + 120, false),

  ('e5f6a7b8-0000-4000-8000-00000000aa04'::uuid, :org_id,
   'Smaller, more frequent orders favour your delivery model', 'product', 'private', null,
   'Independent retail is shifting to smaller and more frequent orders as a working-capital response.',
   'Your next-day capability is the reason to consolidate onto you — but only if delivery reliability recovers first.',
   'Hold until average delivery returns under 3.5 days, then package a high-frequency tier.',
   9500000, 'discovered', 52.4, 'potential', current_date + 150, false),

  ('e5f6a7b8-0000-4000-8000-00000000aa05'::uuid, :org_id,
   'Schools nutrition supply tender reissued', 'tender', 'public', 'Ekurhuleni Metro',
   'A 24-month dry goods supply tender was reissued after the first round failed on compliance. Two of the six original bidders have re-registered.',
   'You already hold the SABS certification the last round tripped on, and the volume fits Germiston''s spare warehouse capacity.',
   'Confirm the certification is current, then register before the compliance window closes.',
   48000000, 'discovered', 68.9, 'strong', current_date + 21, false);

insert into public.opportunity_scores
  (organisation_id, opportunity_id, relevance, potential_value, strategic_alignment,
   urgency, confidence, competition, total, rationale)
values
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000aa01'::uuid, 92, 74, 88, 76, 71, 95, 84.2,
   'Directly inside a declared growth intent, uncontested locally, and served by capacity you already pay for.'),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000aa02'::uuid, 84, 68, 72, 88, 86, 60, 76.5,
   'Time-bound and well evidenced; alignment is moderate because it defends margin rather than growing the business.'),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000aa03'::uuid, 78, 91, 74, 44, 63, 55, 71.8,
   'The largest value on the radar, but the slowest, and the field will be contested.'),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000aa04'::uuid, 61, 47, 58, 33, 69, 48, 52.4,
   'Real but not yet actionable — it depends on an operational fix that is still outstanding.'),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000aa05'::uuid, 71, 88, 52, 96, 74, 68, 68.9,
   'Large and closing fast, which carries it. Strategic alignment is the weak factor: public-sector supply is not a declared growth intent, so this ranks below the weekend delivery pilot despite being worth more.');

insert into public.opportunity_activities (organisation_id, opportunity_id, kind, body) values
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000aa01'::uuid, 'stage_change', 'Moved to Qualified after the fleet utilisation check.'),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000aa02'::uuid, 'ai_analysis', 'Cross-checked against the operating-cost anomaly; the two are related.');

-- ── recommendations: inside meets outside ─────────────────────────────────

insert into public.ai_recommendations
  (organisation_id, title, summary, why_it_matters, recommended_action, impact_cents,
   impact_note, confidence, priority, status, opportunity_id, evidence)
values
  (:org_id,
   'Find where the operating cost went before anything else',
   'Operating cost has grown 27% in four months against 11% revenue growth. Nothing else on this list is worth as much as closing that gap.',
   'On the current trend the increase absorbs the whole of this year''s revenue gain within two quarters. It is the single largest movement in the business.',
   'Break operating cost down by branch and category for the last six months, starting with the month-seven step change.',
   -12000000, 'Approximately R120,000 a month at the current rate', 0.86, 'critical', 'new', null,
   '[{"source":"metric","ref":"operating_cost","note":"+27% over four months"},{"source":"metric","ref":"revenue","note":"+11% over the same window"}]'::jsonb),

  (:org_id,
   'Run the Saturday delivery pilot on the Germiston route',
   'External demand for weekend delivery is up 34% with no local competitor serving it, and your Saturday fleet runs at 40% capacity.',
   'This is the rare case where the market signal and the internal capacity point the same way. The marginal cost is close to nil, so the pilot is cheap to be wrong about.',
   'Commit six weeks of Saturday dispatch on Germiston and measure attach rate on existing accounts before extending it.',
   21000000, 'R210,000 of annualised revenue at a 30% attach rate', 0.71, 'high', 'new',
   'e5f6a7b8-0000-4000-8000-00000000aa01'::uuid,
   '[{"source":"signal","ref":"weekend delivery demand +34%"},{"source":"metric","ref":"saturday_fleet_utilisation","note":"40%"}]'::jsonb),

  (:org_id,
   'Give Nelspruit the catering retender',
   'Nelspruit has added 1.8% in eleven months against 41% for the group. The merged catering group retendering in the new year is the clearest available answer.',
   'A flat branch with spare cold-chain capacity and a large local contract coming to market is a match that will not stay open.',
   'Route the introduction through the Nelspruit branch manager and prepare the cold-chain reference pack this quarter.',
   48000000, 'R480,000 contract value over 24 months', 0.63, 'high', 'new',
   'e5f6a7b8-0000-4000-8000-00000000aa03'::uuid,
   '[{"source":"metric","ref":"branch_revenue_nelspruit","note":"+1.8% over eleven months"},{"source":"signal","ref":"catering consolidation"}]'::jsonb),

  (:org_id,
   'Recover delivery time before selling on reliability',
   'Average delivery has slipped from 3.1 to 4.1 days over three months. Two of the top ten accounts named reliability as their reason for staying.',
   'The high-frequency ordering shift is an opportunity only for a supplier who is actually reliable. Selling into it now would sell a promise the operation cannot currently keep.',
   'Hold the high-frequency tier until average delivery is back under 3.5 days; treat the recovery as the gating measure.',
   null, 'Protects revenue rather than adding it', 0.74, 'medium', 'new', null,
   '[{"source":"metric","ref":"delivery_days","note":"3.1 → 4.1 over three months"}]'::jsonb);

-- ── risk and alerts ───────────────────────────────────────────────────────

insert into public.risks (organisation_id, branch_id, title, description, category, likelihood, impact, status, mitigation, review_on) values
  (:org_id, null, 'Operating cost growth outpacing revenue',
   'Cost has grown 27% against 11% revenue over four months, with no identified driver.',
   'financial', 4, 5, 'open', 'Cost breakdown by branch and category commissioned.', current_date + 14),
  (:org_id, null, 'Delivery reliability deteriorating',
   'Average delivery time has risen for three consecutive months and is a day past target.',
   'operational', 4, 4, 'mitigating', 'Route review on Pretoria West underway.', current_date + 21),
  (:org_id, 'e5f6a7b8-0000-4000-8000-00000000bb01'::uuid, 'Competitor now inside the Germiston delivery ring',
   'Nkosi Trading opened a Benoni depot, the first direct competitor inside the ring.',
   'market', 3, 4, 'monitoring', 'Account-level pricing review for the fifteen most exposed customers.', current_date + 30),
  (:org_id, null, 'Customer sheet connection has been failing for eight days',
   'Credit terms and account owners are stale, which degrades churn and customer scoring.',
   'technology', 5, 2, 'open', 'Reauthorise the Google Sheets connection.', current_date + 3);

insert into public.alerts (organisation_id, severity, status, title, detail, source_kind) values
  (:org_id, 'critical', 'new', 'Operating cost up 27% over four months',
   'Revenue grew 11% in the same window. The gap opened in month seven.', 'engine'),
  (:org_id, 'high', 'new', 'Delivery time past target for a third month',
   'Now 4.1 days against a 3.0 target.', 'threshold'),
  (:org_id, 'high', 'new', 'Nkosi Trading opened inside your delivery ring',
   'Benoni depot, first direct competitor inside the Germiston ring.', 'radar'),
  (:org_id, 'medium', 'acknowledged', 'Customer sheet sync failing',
   'Eight consecutive days. Credit terms are stale.', 'sync'),
  (:org_id, 'low', 'new', 'Churn fell below 3%',
   'First time in the recorded history.', 'engine');

-- ── goals ─────────────────────────────────────────────────────────────────

insert into public.goals (organisation_id, title, description, metric_id, baseline_value, target_value, current_value, unit, status, due_on) values
  (:org_id, 'Reach R1.4m monthly revenue', 'Group revenue run rate by year end.',
   'e5f6a7b8-0000-4000-8000-00000000e001'::uuid, 840000, 1400000, 1236000, 'currency', 'active', current_date + 120),
  (:org_id, 'Hold gross margin above 30%', 'Protect margin through the cost pressure.',
   'e5f6a7b8-0000-4000-8000-00000000e002'::uuid, 31.8, 30.0, 30.04, 'percent', 'at_risk', current_date + 90),
  (:org_id, 'Average delivery under 3 days', 'Restore the delivery promise.',
   'e5f6a7b8-0000-4000-8000-00000000e004'::uuid, 3.1, 3.0, 4.12, 'days', 'at_risk', current_date + 60),
  (:org_id, 'Grow Nelspruit revenue 25%', 'Return the Mpumalanga branch to growth.',
   null, 142000, 177500, 169500, 'currency', 'active', current_date + 180);

insert into public.strategic_initiatives (organisation_id, title, thesis, status, starts_on, ends_on) values
  (:org_id, 'Weekend delivery', 'Serve a demand the local market does not serve, using capacity already paid for.', 'approved', current_date, current_date + 90),
  (:org_id, 'Cost transparency programme', 'Get to a branch-and-category view of operating cost that updates monthly without manual work.', 'active', current_date - 14, current_date + 60);

commit;

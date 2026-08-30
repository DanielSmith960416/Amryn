-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 07 — Sector policy belongs to the customer, not to the platform
--
-- Migration 03 defaulted market scanning to the private sector alone and the
-- recommendation layer refused to surface tenders at all. That conflated two
-- different things:
--
--   · Amryn's own commercial posture — the company does not take on
--     government-sector business. That is a fact about who Amryn sells to,
--     and it belongs in the company's positioning, not in a WHERE clause.
--
--   · What an Amryn customer should be shown. Customers are private
--     businesses, and a municipal supply tender is ordinary revenue to a
--     wholesaler. Filtering it out withheld real money from the people
--     paying for the product.
--
-- So sector scope becomes an explicit, per-organisation setting. The default
-- is to surface everything and let relevance and strategic alignment decide
-- what ranks — which is what those factors are for. An organisation that does
-- not pursue public-sector work narrows the setting once, and the radar
-- honours it everywhere.
-- ═══════════════════════════════════════════════════════════════════════════

-- A tender is its own kind of opportunity: a defined scope, a published
-- deadline and a competitive submission. Modelling it as 'market_expansion'
-- lost the shape that makes it actionable.
alter type public.opportunity_kind add value if not exists 'tender';

-- ── per-organisation sector scope ─────────────────────────────────────────
-- Which sectors this organisation wants its radar to surface. Defaults to all
-- of them: an opportunity is filtered out only because a customer chose to
-- filter it, never because the platform decided on their behalf.

alter table public.organisations
  add column if not exists sector_scope public.market_sector[]
    not null default '{private,public,mixed,unknown}';

comment on column public.organisations.sector_scope is
  'Sectors the AI OpportunityRadar® may surface for this organisation. Set by the customer. Amryn''s own commercial posture is not encoded here.';

alter table public.organisations
  add constraint sector_scope_not_empty check (cardinality(sector_scope) > 0);

-- Existing market sources were seeded private-only by the previous default.
-- Widen them to match the new posture; a customer narrows from here.
alter table public.market_sources
  alter column sector_policy set default '{private,public,mixed,unknown}';

update public.market_sources
   set sector_policy = '{private,public,mixed,unknown}'
 where sector_policy = '{private}';

-- ── honouring the setting ─────────────────────────────────────────────────
-- Enforced in the database rather than only in the query layer, so a report,
-- an export and the assistant all see the same set. A row outside the
-- organisation's chosen scope is simply not selectable.

create or replace function amryn.sector_in_scope(p_org uuid, p_sector public.market_sector)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p_sector = any (o.sector_scope) from public.organisations o where o.id = p_org),
    false
  );
$$;

grant execute on function amryn.sector_in_scope(uuid, public.market_sector) to authenticated;

drop policy if exists opportunities_read on public.opportunities;
create policy opportunities_read on public.opportunities
  for select to authenticated
  using (
    amryn.has_permission(organisation_id, 'view_opportunities')
    and amryn.can_see_branch(organisation_id, branch_id)
    and amryn.sector_in_scope(organisation_id, sector)
  );

drop policy if exists market_signals_read on public.market_signals;
create policy market_signals_read on public.market_signals
  for select to authenticated
  using (
    amryn.has_permission(organisation_id, 'view_market_intelligence')
    and amryn.sector_in_scope(organisation_id, sector)
  );

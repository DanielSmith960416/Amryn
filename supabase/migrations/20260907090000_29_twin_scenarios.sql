-- ═══════════════════════════════════════════════════════════════════════════
-- 29. Scenarios, and the runs they produce
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A scenario is a named question about the same business: what if demand rose
-- a fifth, what if we charged ten per cent more, what does the next ninety days
-- look like if nothing changes. The Twin answers all of them the same way, so
-- the only thing a scenario holds is the levers and the horizon.
--
-- ── the licence, again, and one step earlier than #70 ─────────────────────
--
-- #70 required a published figure with provenance 'simulated' to name the
-- fidelity measurement licensing it. That rule protects business_insights,
-- ai_recommendations and opportunities — the tables a customer reads.
--
-- It leaves a hole this migration would otherwise open. Once simulation runs
-- are stored in their own table, a screen can read that table directly, and
-- every P10/P50/P90 in it would reach a reader without ever passing through
-- the tables the gate protects.
--
-- So fidelity_id is `not null` here. A simulation may not even be *recorded*
-- without naming the measurement standing behind it.
--
-- That is not the same as requiring a good measurement, or any measurement at
-- all in the ordinary sense: a row saying 'not_measurable' is a perfectly
-- valid thing to name, and for most businesses it is the only one available.
-- The rule is that the question "how wrong has this been?" must have been
-- asked and answered before a simulated figure exists, even if the answer was
-- "we cannot tell yet". An unanswerable question and an unasked one look the
-- same afterwards, and only one of them is honest.
--
-- ── five hundred iterations, in the database too ──────────────────────────
--
-- The engine refuses fewer. So does the column. Two enforcements of one rule
-- because the engine's is a line somebody can edit and the column's is not,
-- and a percentile from eighty samples is a number with a confidence interval
-- nobody quoted.
--
-- Additive: two tables, one index, no change to anything existing.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.twin_scenarios (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,

  name             text not null check (name <> ''),
  description      text,

  /*
   * The levers, as multipliers on what the business already stated.
   *
   * Multipliers rather than absolute figures on purpose: a scenario that says
   * "revenue of R2m" has quietly replaced the model with an assertion, while
   * one that says "a fifth more demand" is still a question about this
   * business. The first cannot be wrong; the second can, which is what makes
   * it worth asking.
   */
  demand_multiplier numeric(6,3) not null default 1 check (demand_multiplier > 0),
  price_multiplier  numeric(6,3) not null default 1 check (price_multiplier  > 0),

  -- Three years is the ceiling. Past that the assumption that nothing outside
  -- the business changes stops being a simplification and becomes a fiction.
  horizon_days     integer not null default 90
                     check (horizon_days between 1 and 1095),

  -- "Carry on as you are". One per organisation, so every other scenario has
  -- something to be compared against.
  is_baseline      boolean not null default false,

  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint scenario_name_is_unique_per_organisation unique (organisation_id, name)
);

comment on table public.twin_scenarios is
  'A named question about the same business, held as multipliers on figures the business itself stated. A scenario asserting an absolute revenue would have replaced the model with a claim.';

create unique index twin_scenarios_one_baseline
  on public.twin_scenarios (organisation_id) where is_baseline;

create index twin_scenarios_org_idx
  on public.twin_scenarios (organisation_id, created_at desc);
create index twin_scenarios_created_by_idx
  on public.twin_scenarios (created_by) where created_by is not null;

create trigger twin_scenarios_touch
  before update on public.twin_scenarios
  for each row execute function amryn.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════

create table public.twin_simulations (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  scenario_id      uuid not null references public.twin_scenarios (id) on delete cascade,

  -- Not null, and the reason is at the top of this file.
  fidelity_id      uuid not null references public.twin_fidelity (id) on delete restrict,

  -- The seed is what makes a result arguable. Without it a figure somebody
  -- disagrees with cannot be reproduced, and the disagreement ends with the
  -- simulation saying something else the second time.
  seed             bigint not null,
  iterations       integer not null check (iterations >= 500),
  horizon_days     integer not null check (horizon_days > 0),

  revenue_p10_cents bigint not null,
  revenue_p50_cents bigint not null,
  revenue_p90_cents bigint not null,
  orders_per_day_p50 numeric(12,3),

  -- What the model believed about variation while producing this. Carried with
  -- the result rather than left in the source, so a figure can be read beside
  -- the beliefs that made it.
  assumptions      jsonb not null default '[]'::jsonb,

  duration_ms      integer check (duration_ms is null or duration_ms >= 0),
  ran_at           timestamptz not null default now(),
  created_at       timestamptz not null default now(),

  -- #65's rule, on this table too: a transposed interval reads as reasonable
  -- from either end.
  constraint simulation_interval_is_ordered
    check (revenue_p10_cents <= revenue_p50_cents
       and revenue_p50_cents <= revenue_p90_cents)
);

comment on table public.twin_simulations is
  'One run of the Twin. Records the seed so the result can be reproduced, and must name the fidelity measurement standing behind it — a run whose fidelity was never asked about cannot be stored.';
comment on column public.twin_simulations.fidelity_id is
  'Required. A measurement reading ''not_measurable'' is a valid thing to name; never having asked is not.';

create index twin_simulations_org_idx
  on public.twin_simulations (organisation_id, ran_at desc);
create index twin_simulations_scenario_idx
  on public.twin_simulations (scenario_id, ran_at desc);
create index twin_simulations_fidelity_idx
  on public.twin_simulations (fidelity_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Who may see and shape them
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Scenarios are written by people, so they carry insert and update policies —
-- unlike simulations, which only the worker produces and which nobody should
-- be able to edit after the fact. A simulated result somebody adjusted by hand
-- is worse than no simulation.

alter table public.twin_scenarios   enable row level security;
alter table public.twin_scenarios   force  row level security;
alter table public.twin_simulations enable row level security;
alter table public.twin_simulations force  row level security;

create policy twin_scenarios_read on public.twin_scenarios
  for select using (amryn.is_member(organisation_id));

create policy twin_scenarios_write on public.twin_scenarios
  for insert with check (amryn.has_permission(organisation_id, 'manage_organisation'));

create policy twin_scenarios_update on public.twin_scenarios
  for update using (amryn.has_permission(organisation_id, 'manage_organisation'))
  with check (amryn.has_permission(organisation_id, 'manage_organisation'));

create policy twin_scenarios_delete on public.twin_scenarios
  for delete using (amryn.has_permission(organisation_id, 'manage_organisation'));

create policy twin_simulations_read on public.twin_simulations
  for select using (amryn.is_member(organisation_id));

grant select, insert, update, delete on public.twin_scenarios to authenticated;
grant select on public.twin_simulations to authenticated;

create trigger twin_scenarios_refuse_lapsed
  before insert or update on public.twin_scenarios
  for each row execute function amryn.refuse_lapsed_write();
create trigger twin_simulations_refuse_lapsed
  before insert or update on public.twin_simulations
  for each row execute function amryn.refuse_lapsed_write();

notify pgrst, 'reload schema';

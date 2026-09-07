import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { ASSUMPTIONS } from './simulate';

/**
 * What the scenario studio needs to render, read through the customer's own
 * session.
 *
 * Every table here carries `amryn.is_member(organisation_id)` and forced RLS,
 * so a caller who should not see a row gets no row rather than a filtered one.
 * The tenant boundary is the database's; nothing in this file re-implements it.
 */

export interface FidelityReading {
  id: string;
  status: 'measured' | 'not_measurable' | 'stale';
  score: number | null;
  monthsAvailable: number;
  monthsRequired: number;
  errorPct: number | null;
  method: string | null;
  reason: string | null;
  measuredAt: string;
}

export interface SimulationResult {
  id: string;
  seed: string;
  iterations: number;
  horizonDays: number;
  revenueCents: { p10: number; p50: number; p90: number };
  ordersPerDayP50: number | null;
  assumptions: string[];
  ranAt: string;
  fidelity: FidelityReading | null;
}

export interface Scenario {
  id: string;
  name: string;
  description: string | null;
  demandMultiplier: number;
  priceMultiplier: number;
  horizonDays: number;
  isBaseline: boolean;
  latest: SimulationResult | null;
  /** A run this scenario has queued but not finished, if any. */
  pending: { queuedAt: string; startsAt: string } | null;
}

export interface StudioState {
  /** Off means the Twin is not switched on for this organisation. */
  enabled: boolean;
  scenarios: Scenario[];
  fidelity: FidelityReading | null;
}

/* ── the pieces ────────────────────────────────────────────────────────── */

export async function twinEnabled(organisationId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('organisation_feature_flags')
    .select('enabled')
    .eq('organisation_id', organisationId)
    .eq('flag_key', 'digital_twin_simulation')
    .maybeSingle();

  // Absent means off. That is the whole design of the flag table, and reading
  // a missing row as anything else would defeat it.
  return data?.enabled === true;
}

/**
 * The most recent measurement, whatever it says.
 *
 * `not_measurable` is a reading rather than an absence, and the studio shows
 * it as one — a Twin nobody has checked and a Twin that cannot yet be checked
 * look identical from outside, and only one of them is honest.
 */
export async function latestFidelity(organisationId: string): Promise<FidelityReading | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('twin_fidelity')
    .select('id, status, score, months_available, months_required, error_pct, method, reason, measured_at')
    .eq('organisation_id', organisationId)
    .order('measured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? toFidelity(data) : null;
}

export async function studioState(organisationId: string): Promise<StudioState> {
  const supabase = await createClient();

  const [enabled, fidelity, scenarioRows] = await Promise.all([
    twinEnabled(organisationId),
    latestFidelity(organisationId),
    supabase
      .from('twin_scenarios')
      .select('id, name, description, demand_multiplier, price_multiplier, horizon_days, is_baseline, created_at')
      .eq('organisation_id', organisationId)
      // Baseline first — every other scenario is read against it — then oldest
      // first, so the list does not reorder itself as somebody adds to it.
      .order('is_baseline', { ascending: false })
      .order('created_at', { ascending: true }),
  ]);

  const scenarios = scenarioRows.data ?? [];
  if (scenarios.length === 0) return { enabled, scenarios: [], fidelity };

  const ids = scenarios.map((s) => s.id);

  /*
   * One query for the runs rather than one per scenario. Ordered newest first
   * and reduced below, because PostgREST has no `distinct on` — and a studio
   * with eight scenarios should not cost eight round trips.
   */
  const [{ data: runs }, { data: queued }] = await Promise.all([
    supabase
      .from('twin_simulations')
      // One literal, deliberately: supabase-js parses the select at the type
      // level, and a concatenated string is just `string` to it — the whole
      // result then degrades to an error type with no column on it.
      .select('id, scenario_id, seed, iterations, horizon_days, revenue_p10_cents, revenue_p50_cents, revenue_p90_cents, orders_per_day_p50, assumptions, ran_at, twin_fidelity(id, status, score, months_available, months_required, error_pct, method, reason, measured_at)')
      .in('scenario_id', ids)
      .order('ran_at', { ascending: false }),
    supabase
      .from('job_runs')
      .select('payload, created_at, run_at')
      .eq('organisation_id', organisationId)
      .eq('kind', 'twin.simulate')
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: false }),
  ]);

  const newest = new Map<string, SimulationResult>();
  for (const run of runs ?? []) {
    if (newest.has(run.scenario_id)) continue;
    newest.set(run.scenario_id, toSimulation(run));
  }

  const inFlight = new Map<string, { queuedAt: string; startsAt: string }>();
  for (const job of queued ?? []) {
    const scenarioId = (job.payload as { scenario_id?: unknown } | null)?.scenario_id;
    if (typeof scenarioId !== 'string' || inFlight.has(scenarioId)) continue;
    inFlight.set(scenarioId, { queuedAt: job.created_at, startsAt: job.run_at });
  }

  return {
    enabled,
    fidelity,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      demandMultiplier: Number(s.demand_multiplier),
      priceMultiplier: Number(s.price_multiplier),
      horizonDays: s.horizon_days,
      isBaseline: s.is_baseline,
      latest: newest.get(s.id) ?? null,
      pending: inFlight.get(s.id) ?? null,
    })),
  };
}

/* ── shaping ───────────────────────────────────────────────────────────── */

interface FidelityRow {
  id: string;
  status: string;
  score: number | null;
  months_available: number;
  months_required: number;
  error_pct: number | string | null;
  method: string | null;
  reason: string | null;
  measured_at: string;
}

function toFidelity(row: FidelityRow): FidelityReading {
  return {
    id: row.id,
    status: row.status as FidelityReading['status'],
    score: row.score,
    monthsAvailable: row.months_available,
    monthsRequired: row.months_required,
    // numeric arrives as a string; Number('') would be 0, which would read as
    // a perfect forecast rather than a missing one.
    errorPct: row.error_pct === null ? null : Number(row.error_pct),
    method: row.method,
    reason: row.reason,
    measuredAt: row.measured_at,
  };
}

interface SimulationRow {
  id: string;
  seed: number | string;
  iterations: number;
  horizon_days: number;
  revenue_p10_cents: number | string;
  revenue_p50_cents: number | string;
  revenue_p90_cents: number | string;
  orders_per_day_p50: number | string | null;
  assumptions: unknown;
  ran_at: string;
  twin_fidelity: FidelityRow | FidelityRow[] | null;
}

function toSimulation(row: SimulationRow): SimulationResult {
  const licence = Array.isArray(row.twin_fidelity) ? (row.twin_fidelity[0] ?? null) : row.twin_fidelity;

  return {
    id: row.id,
    // bigint over the wire is a string, and a seed is an identifier rather
    // than a quantity — nothing here does arithmetic on it.
    seed: String(row.seed),
    iterations: row.iterations,
    horizonDays: row.horizon_days,
    revenueCents: {
      p10: Number(row.revenue_p10_cents),
      p50: Number(row.revenue_p50_cents),
      p90: Number(row.revenue_p90_cents),
    },
    ordersPerDayP50: row.orders_per_day_p50 === null ? null : Number(row.orders_per_day_p50),
    /*
     * The assumptions the run carried, not today's. A result read beside a
     * later version of the model's beliefs is a result read beside beliefs
     * that did not produce it — which is exactly the confusion the column was
     * added to prevent. The constant is only the fallback for a row written
     * before the column had anything in it.
     */
    assumptions: Array.isArray(row.assumptions)
      ? (row.assumptions as string[])
      : [...ASSUMPTIONS],
    ranAt: row.ran_at,
    fidelity: licence ? toFidelity(licence) : null,
  };
}

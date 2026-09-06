import { answersFrom } from './run-analysis';
import { MIN_ITERATIONS, deriveParameters, simulate } from '@/features/twin/simulate';
import type { JobHandler } from '../types';

/**
 * Runs one scenario and records what it found.
 *
 * The engine is in features/twin/simulate.ts, which has no database, no clock
 * and no Math.random. This reads the rows, hands them over, and writes the
 * result. Everything worth arguing about is next door.
 *
 * ── it refuses more often than it runs, and that is the design ────────────
 *
 * Three things can stop it, and each is reported as a named reason rather than
 * an empty result:
 *
 *   · no fidelity measurement — the licence rule from #70 and #29 means a run
 *     cannot be stored without naming one, and inventing one here would be
 *     this handler quietly granting itself the permission the whole gate
 *     exists to withhold.
 *   · the Imprint does not carry the three figures the model derives from.
 *   · the scenario has gone.
 *
 * A refusal is a successful job. Nothing is wrong with the queue when a
 * business has not said what it earns — and failing the job would retry it,
 * fail again, and eventually mark a healthy tenant as broken.
 */
const HORIZON_ITERATIONS = MIN_ITERATIONS;

interface ScenarioRow {
  id: string;
  name: string;
  demand_multiplier: string;
  price_multiplier: string;
  horizon_days: number;
}

export const simulateTwin: JobHandler = {
  kind: 'twin.simulate',
  description: 'Runs a scenario through the Twin and records the interval it produced.',
  // Five hundred iterations over a long horizon is arithmetic, not minutes,
  // but the lease is generous because a slow database is the likelier delay.
  leaseSeconds: 300,

  async run({ job, query, keepAlive, log }) {
    if (!job.organisationId) {
      throw new Error('twin.simulate is tenant work and was queued without an organisation');
    }

    const scenarioId = job.payload.scenario_id;
    const scenarios = await query<ScenarioRow>(
      typeof scenarioId === 'string'
        ? `select id, name, demand_multiplier, price_multiplier, horizon_days
             from public.twin_scenarios where id = $2 and organisation_id = $1`
        : `select id, name, demand_multiplier, price_multiplier, horizon_days
             from public.twin_scenarios where organisation_id = $1 and is_baseline`,
      typeof scenarioId === 'string' ? [job.organisationId, scenarioId] : [job.organisationId],
    );

    const scenario = scenarios[0];
    if (!scenario) {
      log('no such scenario for this organisation; nothing to run');
      return { skipped: 'scenario_missing' };
    }

    /*
     * The most recent measurement, whatever it says.
     *
     * 'not_measurable' is admitted deliberately — it is the honest state for
     * almost every business here, and naming it is exactly what the licence
     * rule asks for. What is refused is having no measurement at all, because
     * an unasked question and an unanswerable one look identical afterwards.
     */
    const fidelity = await query<{ id: string; status: string; score: number | null }>(
      `select id, status::text as status, score
         from public.twin_fidelity
        where organisation_id = $1
        order by measured_at desc
        limit 1`,
      [job.organisationId],
    );

    if (!fidelity[0]) {
      log('no fidelity measurement exists; a simulation cannot be recorded without one');
      return { skipped: 'no_fidelity_measurement' };
    }

    const layers = await query<{
      layer: string;
      state: string;
      answers: Record<string, unknown> | null;
      gaps: string[] | null;
    }>(
      `select layer::text as layer, state::text as state, answers, gaps
         from public.imprint_layers
        where organisation_id = $1`,
      [job.organisationId],
    );

    const answers = answersFrom(layers);
    const number = (field: string): number | null => {
      const raw = answers.get(field);
      if (!raw) return null;
      const value = Number(raw.replace(/[Rr\s,]/g, ''));
      return Number.isFinite(value) ? value : null;
    };

    const rands = number('annualRevenue');
    const order = number('averageOrderValue');

    const derived = deriveParameters({
      // The Imprint asks for rand; everything downstream is cents.
      annualRevenueCents: rands === null ? null : Math.round(rands * 100),
      customerCount: number('customerCount'),
      averageOrderCents: order === null ? null : Math.round(order * 100),
      repeatRatePct: number('repeatRate'),
    });

    if (!derived.ok) {
      log(`cannot simulate without ${derived.missing.join(', ')}`);
      return { skipped: 'imprint_incomplete', missing: derived.missing };
    }

    if (!(await keepAlive())) {
      log('lease lapsed before running; another worker has it');
      return { abandoned: true };
    }

    /*
     * A seed that is stable for a scenario on a night.
     *
     * Not random: two people asking the same question of the same business on
     * the same day should get the same answer, and a nightly run that reported
     * a different figure each time it was retried would be indistinguishable
     * from the business changing.
     */
    const night = new Date().toISOString().slice(0, 10);
    const seed = nightlySeed(scenario.id, night);

    const startedAt = Date.now();
    const outcome = simulate(derived.parameters, {
      days: scenario.horizon_days,
      iterations: HORIZON_ITERATIONS,
      seed,
      demandMultiplier: Number(scenario.demand_multiplier),
      priceMultiplier: Number(scenario.price_multiplier),
    });

    const inserted = await query<{ id: string }>(
      `insert into public.twin_simulations
         (organisation_id, scenario_id, fidelity_id, seed, iterations, horizon_days,
          revenue_p10_cents, revenue_p50_cents, revenue_p90_cents,
          orders_per_day_p50, assumptions, duration_ms)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
       returning id`,
      [
        job.organisationId,
        scenario.id,
        fidelity[0].id,
        seed,
        outcome.iterations,
        outcome.days,
        outcome.revenueCents.p10,
        outcome.revenueCents.p50,
        outcome.revenueCents.p90,
        outcome.ordersPerDay.p50.toFixed(3),
        JSON.stringify(outcome.assumptions),
        Date.now() - startedAt,
      ],
    );

    log(
      `"${scenario.name}" over ${scenario.horizon_days} days: ` +
        `P50 ${(outcome.revenueCents.p50 / 100).toFixed(0)} rand ` +
        `(P10 ${(outcome.revenueCents.p10 / 100).toFixed(0)}, P90 ${(outcome.revenueCents.p90 / 100).toFixed(0)}), ` +
        `fidelity ${fidelity[0].status}${fidelity[0].score === null ? '' : ` ${fidelity[0].score}/100`}`,
    );

    return {
      simulationId: inserted[0]?.id ?? null,
      scenario: scenario.name,
      seed,
      fidelityStatus: fidelity[0].status,
      fidelityScore: fidelity[0].score,
      revenueP50Cents: outcome.revenueCents.p50,
    };
  },
};

/**
 * The seed for one scenario on one night.
 *
 * Exported because it carries a promise worth being able to check: the same
 * scenario asked on the same day gives the same answer. Without it a retried
 * job would report a different figure, and a customer comparing this morning's
 * number with yesterday's could not tell a changed business from a re-run.
 *
 * FNV-1a. Not a checksum and not a hash in the security sense — it only has to
 * be stable for one input and different across scenarios.
 */
export function nightlySeed(scenarioId: string, night: string): number {
  return hash(`${scenarioId}:${night}`);
}

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

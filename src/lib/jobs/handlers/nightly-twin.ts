import type { JobHandler } from '../types';

/**
 * The nightly tick: decides who gets read tonight, and queues it.
 *
 * A platform job that fans out, rather than one job per organisation on the
 * schedule. The schedule cannot know how many tenants exist — that changes
 * while the worker is running — so it wakes one job that looks.
 *
 * ── measure before simulating, and why the delay is not a race ────────────
 *
 * A simulation cannot be recorded without naming a fidelity measurement, so
 * every organisation gets its measurement queued first and its simulation
 * queued to start a few minutes later.
 *
 * That gap is slack rather than synchronisation. The measurement is a single
 * grouped query and a pure function — milliseconds — so five minutes is
 * enormous; and if it somehow has not finished, the simulation refuses with a
 * named reason and tomorrow's tick tries again. What it must not do is guess
 * that a measurement probably exists, which is the failure the licence rule
 * was built to prevent.
 *
 * ── who is skipped, and silently ──────────────────────────────────────────
 *
 * Organisations without the digital_twin_simulation flag are not queued at
 * all. claim_jobs would refuse their work anyway on background_jobs, but a
 * queue that fills nightly with jobs nobody intends to run is a queue whose
 * depth stops meaning anything — the same reasoning as #68's enqueue.
 */
export const nightlyTwinTick: JobHandler = {
  kind: 'twin.nightly',
  description: 'Queues a fidelity measurement and a baseline simulation for each opted-in tenant.',
  leaseSeconds: 120,

  async run({ query, log }) {
    /*
     * Only organisations that have opted in *and* have a baseline scenario to
     * run. A tenant with the flag on and no scenario is not an error — it is
     * somebody who turned the Twin on and has not said what to ask it yet —
     * and queueing a simulation with nothing to simulate would fail nightly
     * and look like a fault.
     */
    const tenants = await query<{ organisation_id: string; scenario_id: string }>(
      `select s.organisation_id, s.id as scenario_id
         from public.twin_scenarios s
        where s.is_baseline
          and amryn.feature_enabled(s.organisation_id, 'digital_twin_simulation')`,
    );

    if (tenants.length === 0) {
      log('no organisation has both the Twin switched on and a baseline scenario');
      return { measured: 0, simulated: 0 };
    }

    // One slot per night per organisation. The dedupe key is what stops a
    // restart at 02:59 queueing the night twice.
    const night = new Date().toISOString().slice(0, 10);
    let measured = 0;
    let simulated = 0;

    for (const tenant of tenants) {
      const m = await query<{ id: string }>(
        `insert into public.job_runs (organisation_id, kind, payload, dedupe_key, priority)
         values ($1, 'twin.measure_fidelity', '{}'::jsonb, $2, 40)
         on conflict (dedupe_key) where dedupe_key is not null do nothing
         returning id`,
        [tenant.organisation_id, `twin-fidelity:${tenant.organisation_id}:${night}`],
      );
      if (m.length > 0) measured += 1;

      const s = await query<{ id: string }>(
        `insert into public.job_runs
           (organisation_id, kind, payload, dedupe_key, priority, run_at)
         values ($1, 'twin.simulate', $2::jsonb, $3, 50, now() + interval '5 minutes')
         on conflict (dedupe_key) where dedupe_key is not null do nothing
         returning id`,
        [
          tenant.organisation_id,
          JSON.stringify({ scenario_id: tenant.scenario_id }),
          `twin-simulate:${tenant.scenario_id}:${night}`,
        ],
      );
      if (s.length > 0) simulated += 1;
    }

    log(
      `${tenants.length} tenant${tenants.length === 1 ? '' : 's'} opted in — ` +
        `queued ${measured} measurement${measured === 1 ? '' : 's'} and ${simulated} simulation${simulated === 1 ? '' : 's'}`,
    );
    return { tenants: tenants.length, measured, simulated };
  },
};

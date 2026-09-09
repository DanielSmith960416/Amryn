import type { JobHandler } from '../types';

/**
 * The morning tick: decides who gets a brief today, and queues it.
 *
 * Same shape as the Twin's nightly fan-out, and for the same reason — a
 * schedule cannot know how many organisations exist, so one platform job wakes
 * up and looks. Adding a customer needs no change to the schedule.
 *
 * ── who is skipped ────────────────────────────────────────────────────────
 *
 * Organisations without the daily_brief flag are not queued at all. claim_jobs
 * would refuse their work anyway, but a queue that fills every morning with
 * jobs nobody intends to run is a queue whose depth stops meaning anything.
 *
 * ── one brief per organisation per morning, ever ──────────────────────────
 *
 * dedupe_key rather than singleton_key. A brief is dated, and a second brief
 * for the same Tuesday is not a re-run somebody asked for — it is the tick
 * having fired twice after a restart. The unique constraint on
 * (organisation_id, brief_date) would catch it, but a queue entry that exists
 * only to be refused is noise in the one place an operator looks.
 */
export const nightlyBriefTick: JobHandler = {
  kind: 'brief.nightly',
  description: 'Queues a morning brief for each organisation that has the brief switched on.',
  leaseSeconds: 120,

  async run({ query, log }) {
    const tenants = await query<{ id: string }>(
      `select o.id
         from public.organisations o
        where amryn.feature_enabled(o.id, 'daily_brief')`,
    );

    if (tenants.length === 0) {
      log('no organisation has the daily brief switched on');
      return { tenants: 0, queued: 0 };
    }

    const morning = new Date().toISOString().slice(0, 10);
    let queued = 0;

    for (const tenant of tenants) {
      const rows = await query<{ id: string }>(
        `insert into public.job_runs
           (organisation_id, kind, payload, dedupe_key, priority)
         values ($1, 'brief.compose', $2::jsonb, $3, 45)
         on conflict (dedupe_key) where dedupe_key is not null do nothing
         returning id`,
        [tenant.id, JSON.stringify({ brief_date: morning }), `brief:${tenant.id}:${morning}`],
      );
      if (rows.length > 0) queued += 1;
    }

    log(
      `${tenants.length} organisation${tenants.length === 1 ? '' : 's'} switched on — ` +
        `queued ${queued} brief${queued === 1 ? '' : 's'} for ${morning}`,
    );
    return { tenants: tenants.length, queued };
  },
};

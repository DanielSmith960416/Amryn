import { PermanentJobError } from '../types';
import type { JobHandler } from '../types';

/** Thirty days of successes is enough to answer "did the brief go out?". */
const DEFAULT_RETAIN_DAYS = 30;

/**
 * The queue tidying up after itself.
 *
 * Two things the lease alone cannot do. A run abandoned with no attempts left
 * is not claimable and never will be, so without this it reads as work in
 * progress for ever and any dashboard counting running jobs is wrong. And a
 * queue nobody empties becomes the largest table in the database — this one
 * gains a row every hour from the schedule below whether or not anything
 * happened.
 *
 * Failures are never deleted, at any age. They are the only record that
 * something went wrong, and the retention worth having is on the runs that
 * went right.
 */
export const sweepJobs: JobHandler = {
  kind: 'jobs.sweep',
  description: 'Closes abandoned runs and deletes successes past the retention window.',
  leaseSeconds: 120,

  async run({ job, query, log }) {
    const retainDays = retainDaysFrom(job.payload);

    const rows = await query<{ sweep_jobs: { abandoned: number; removed: number } }>(
      'select amryn.sweep_jobs(make_interval(days => $1))',
      [retainDays],
    );

    const result = rows[0]?.sweep_jobs ?? { abandoned: 0, removed: 0 };
    log(`closed ${result.abandoned} abandoned, removed ${result.removed} past ${retainDays} days`);
    return { ...result, retainDays };
  },
};

/**
 * A payload that says something impossible is a permanent failure, not a
 * transient one: retrying it twice more produces the same nonsense and buries
 * the reason under three identical errors.
 */
function retainDaysFrom(payload: Record<string, unknown>): number {
  const value = payload.retainDays;
  if (value === undefined) return DEFAULT_RETAIN_DAYS;

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    throw new PermanentJobError(
      `retainDays must be a number of days of at least 1, not ${JSON.stringify(value)}`,
    );
  }
  return Math.floor(value);
}

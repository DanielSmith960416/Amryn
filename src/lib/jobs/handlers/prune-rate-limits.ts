import type { JobHandler } from '../types';

/**
 * Deletes rate-limit windows that have gone by.
 *
 * `public.prune_rate_limits()` has existed since migration 12 and has never
 * been called. Nothing in the application was in a position to: it is
 * housekeeping with no user standing in front of it, which is precisely the
 * category of work that had nowhere to run until now.
 *
 * Left alone the table grows by a row per sign-in attempt for ever, and the
 * index that makes the check fast is the thing that degrades first — so the
 * symptom of never running this is that signing in gets slower, which is not
 * a symptom anybody traces back to a table nobody looks at.
 */
export const pruneRateLimits: JobHandler = {
  kind: 'rate_limits.prune',
  description: 'Deletes rate-limit windows older than a day.',
  leaseSeconds: 60,

  async run({ query, log }) {
    const rows = await query<{ prune_rate_limits: number }>('select public.prune_rate_limits()');
    const removed = rows[0]?.prune_rate_limits ?? 0;
    log(`pruned ${removed} rate-limit window${removed === 1 ? '' : 's'}`);
    return { removed };
  },
};

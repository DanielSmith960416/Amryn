/**
 * Reading a worker heartbeat and deciding what it means.
 *
 * Pure: given the freshest beat and the moment you are asking, it says whether
 * the worker is running. No database, no clock of its own — so the boundary
 * between "quiet" and "gone" can be argued with in a test rather than
 * discovered during an outage.
 *
 * ── the threshold, and why it is what it is ───────────────────────────────
 *
 * The worker polls every five seconds and beats on every poll, including the
 * polls where it claims nothing. So a beat older than a minute means twelve
 * missed writes in a row, which is not a slow database — it is a process that
 * is not there.
 *
 * Ninety seconds rather than sixty, because a deploy replaces the worker and
 * the new one takes a moment to boot. A threshold that fires during every
 * routine deployment is a threshold people learn to ignore, and an alert
 * nobody reads is worse than no alert: it converts a real outage into one more
 * notification to dismiss.
 */

/** Twelve missed polls is a process, not a slow query. */
export const STALE_AFTER_SECONDS = 90;

/**
 * How long a worker may be absent before this is an outage rather than a
 * restart. Two deploys back to back should not read as a fault.
 */
export const MISSING_AFTER_SECONDS = 300;

export interface Heartbeat {
  workerId: string;
  lastSeenAt: string;
  startedAt: string;
  handlers: string[];
  inFlight: number;
  revision: string | null;
  /**
   * Migrations the worker's build carries that the database has not recorded.
   * Non-empty means it is deliberately claiming nothing. Empty is healthy, and
   * is also what a worker predating the column reports.
   */
  pendingMigrations: string[];
}

export type WorkerHealth =
  | { state: 'running'; workerId: string; secondsSince: number; handlers: string[]; inFlight: number }
  | { state: 'stale'; workerId: string; secondsSince: number; detail: string }
  | { state: 'gone'; workerId: string; secondsSince: number; detail: string }
  | { state: 'never'; detail: string };

/**
 * What the freshest beat says.
 *
 * `never` is deliberately its own state rather than a very old `gone`. A
 * platform where no worker has ever beaten is one where this was just
 * deployed, or where the worker has never started at all — and telling those
 * apart from "it died an hour ago" is the difference between waiting and
 * investigating.
 */
export function workerHealth(beat: Heartbeat | null, now: Date): WorkerHealth {
  if (!beat) {
    return {
      state: 'never',
      detail:
        'No worker has ever reported in. Either this is the first deploy carrying ' +
        'heartbeats, or the worker service has never started.',
    };
  }

  const secondsSince = Math.max(0, Math.round((now.getTime() - Date.parse(beat.lastSeenAt)) / 1000));

  if (secondsSince <= STALE_AFTER_SECONDS) {
    return {
      state: 'running',
      workerId: beat.workerId,
      secondsSince,
      handlers: beat.handlers,
      inFlight: beat.inFlight,
    };
  }

  if (secondsSince <= MISSING_AFTER_SECONDS) {
    return {
      state: 'stale',
      workerId: beat.workerId,
      secondsSince,
      detail:
        `The worker last reported ${describe(secondsSince)} ago. That is longer than a poll ` +
        'and shorter than an outage — most likely a deploy replacing it. Look again in a minute.',
    };
  }

  return {
    state: 'gone',
    workerId: beat.workerId,
    secondsSince,
    detail:
      `No worker has reported for ${describe(secondsSince)}. Every schedule is stopped: the ` +
      'nightly Twin run, the morning brief, the queue sweep and the rate-limit prune. ' +
      'Check whether the worker service is crashlooping.',
  };
}

/**
 * Whether the worker is running the handlers this build expects.
 *
 * Two services deploy from one image and can end up on different commits when
 * one build fails. That is invisible from every other angle — the worker beats
 * happily, the web service serves happily — until something queues a job whose
 * handler only exists on one of them, and it fails on every attempt.
 */
export function missingHandlers(beat: Heartbeat | null, expected: readonly string[]): string[] {
  if (!beat) return [];
  return expected.filter((kind) => !beat.handlers.includes(kind));
}

function describe(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

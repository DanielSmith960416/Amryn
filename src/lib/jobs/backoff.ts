/**
 * How long to wait before trying a failed job again.
 *
 * Exponential from thirty seconds, capped at fifteen minutes. The cap is the
 * point: without one, a job on its eighth attempt is scheduled for some time
 * next week, which in practice means the failure is never seen again and never
 * fixed either.
 *
 * ── why the jitter ────────────────────────────────────────────────────────
 * A dependency that fails takes every job that touches it down together, and
 * a fixed backoff then sends all of them back at the same instant — the same
 * thundering herd that caused the outage, arriving on a schedule. Spreading
 * them over the last quarter of the window costs nothing and breaks the
 * lockstep.
 *
 * `random` is a parameter so the tests can assert the arithmetic rather than
 * assert a range and hope.
 */
const BASE_SECONDS = 30;
const CAP_SECONDS = 15 * 60;
/** How much of the delay is spread. A quarter is enough to break lockstep. */
const JITTER_FRACTION = 0.25;

export function retryDelaySeconds(attempts: number, random: () => number = Math.random): number {
  // `attempts` counts runs already made, so the first failure arrives as 1 and
  // should wait the base delay rather than double it.
  const step = Math.max(0, Math.floor(attempts) - 1);

  // Bounded before the shift: 2 ** 1024 is Infinity, and Infinity * anything
  // is not a number of seconds.
  const doublings = Math.min(step, 20);
  const window = Math.min(BASE_SECONDS * 2 ** doublings, CAP_SECONDS);

  const spread = window * JITTER_FRACTION;
  return Math.round(window - spread + spread * random());
}

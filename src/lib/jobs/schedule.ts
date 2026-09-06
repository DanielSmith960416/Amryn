/**
 * Work that runs because the clock said so, rather than because somebody asked.
 *
 * ── why not cron ──────────────────────────────────────────────────────────
 * There is no cron daemon in the container and `pg_cron` is a Supabase
 * extension that would put half the schedule in the database and half in the
 * code. The whole mechanism here is one idea instead: a schedule divides time
 * into slots, the worker works out which slot it is in, and enqueues a job
 * whose dedupe key names that slot.
 *
 * The unique index on dedupe_key does the rest. Four workers noticing the same
 * slot at the same moment produce one row and three ignored conflicts — no
 * leader election, no lock, and no schedule state to fall out of step with
 * what actually ran. A worker that was asleep at the due moment enqueues the
 * slot the moment it wakes, so a restart delays a job rather than skipping it.
 *
 * The one thing this deliberately does not do is catch up. A worker that was
 * down for six hours enqueues the current slot, not the six it missed: they
 * would all run at once against the same data, and for a nightly tick the
 * older five have nothing left to say.
 */
import { PLATFORM_SCHEDULES } from './registry';

export interface Schedule {
  /** Also the first half of the dedupe key, so renaming one re-runs it once. */
  name: string;
  kind: string;
  description: string;
  /** Lower runs first when the queue is busy. */
  priority?: number;
  payload?: Record<string, unknown>;
  cadence:
    | { everyMinutes: number }
    /** UTC, because a schedule that moves twice a year is a schedule that fails twice a year. */
    | { dailyAtUtc: `${number}${number}:${number}${number}` };
}

export interface DueJob {
  kind: string;
  dedupeKey: string;
  priority: number;
  payload: Record<string, unknown>;
  runAt: Date;
}

/**
 * The slot each schedule is currently in, as a job ready to be enqueued.
 *
 * Always returns one entry per schedule. Enqueueing is what deduplicates, not
 * this — asking "has it run yet?" here would mean reading the queue before
 * writing to it, and two workers can both read "no".
 */
export function dueJobs(now: Date, schedules: readonly Schedule[] = PLATFORM_SCHEDULES): DueJob[] {
  return schedules.map((schedule) => {
    const slot = slotStart(schedule, now);
    return {
      kind: schedule.kind,
      dedupeKey: `${schedule.name}:${slot.toISOString()}`,
      priority: schedule.priority ?? 100,
      payload: schedule.payload ?? {},
      runAt: slot,
    };
  });
}

/** The start of the slot `now` falls in. Exported for the tests and for logs. */
export function slotStart(schedule: Schedule, now: Date): Date {
  if ('everyMinutes' in schedule.cadence) {
    const size = Math.max(1, Math.floor(schedule.cadence.everyMinutes)) * 60_000;
    // Anchored to the epoch rather than to when the worker started, so two
    // workers that booted minutes apart agree on where the boundaries are.
    return new Date(Math.floor(now.getTime() / size) * size);
  }

  const [hours, minutes] = schedule.cadence.dailyAtUtc.split(':').map(Number);
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hours,
    minutes,
    0,
    0,
  );

  // Before today's due time, the slot in progress is yesterday's. Enqueueing
  // it is free — it is already spent — and it is what makes a worker that
  // starts at 02:00 not sit on a 03:15 job it has no record of.
  return new Date(today <= now.getTime() ? today : today - 86_400_000);
}

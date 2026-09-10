/**
 * Everything the worker knows how to run, and everything the clock asks for.
 *
 * One file on purpose. A queue whose handlers register themselves from wherever
 * they happen to live is a queue where "what runs here?" has no answer short of
 * reading the whole repository — and the first question anybody asks of a
 * worker at two in the morning is exactly that.
 *
 * A `kind` in the database with no handler here is not silently ignored: the
 * worker fails it permanently and says so. A job that sits queued looking
 * healthy while nothing is capable of running it is the failure mode this
 * avoids.
 */
import { composeBrief } from './handlers/compose-brief';
import { pruneRateLimits } from './handlers/prune-rate-limits';
import { verifyEmail } from './handlers/verify-email';
import { measureTwinFidelity } from './handlers/measure-fidelity';
import { nightlyBackup } from './handlers/nightly-backup';
import { nightlyBriefTick } from './handlers/nightly-brief';
import { nightlyTwinTick } from './handlers/nightly-twin';
import { runAnalysis } from './handlers/run-analysis';
import { simulateTwin } from './handlers/simulate-twin';
import { sweepJobs } from './handlers/sweep-jobs';
import type { JobHandler } from './types';
import type { Schedule } from './schedule';

const HANDLERS: readonly JobHandler[] = [
  pruneRateLimits,
  // Run on request rather than on a schedule: mail settings change when
  // somebody changes them, and polling a third party hourly to learn nothing
  // is a poor trade for a connection to their server.
  verifyEmail,
  sweepJobs,
  runAnalysis,
  measureTwinFidelity,
  nightlyTwinTick,
  simulateTwin,
  nightlyBriefTick,
  composeBrief,
  nightlyBackup,
];

const BY_KIND = new Map(HANDLERS.map((handler) => [handler.kind, handler]));

export function handlerFor(kind: string): JobHandler | undefined {
  return BY_KIND.get(kind);
}

export function registeredKinds(): string[] {
  return [...BY_KIND.keys()].sort();
}

/**
 * Work with no organisation behind it, run on the clock.
 *
 * Both of these are housekeeping the platform owes itself. Neither touches a
 * customer's records, which is why they carry no organisation and are not
 * subject to the background_jobs flag — switching a tenant off must not stop
 * the queue looking after itself.
 */
export const PLATFORM_SCHEDULES: readonly Schedule[] = [
  {
    name: 'rate-limits-prune',
    kind: pruneRateLimits.kind,
    description: pruneRateLimits.description,
    cadence: { everyMinutes: 60 },
    // Ahead of the ordinary work: it is seconds long and the table it clears
    // is read on every sign-in.
    priority: 10,
  },
  {
    name: 'jobs-sweep',
    kind: sweepJobs.kind,
    description: sweepJobs.description,
    // Deep in the South African night, and off the hour, so it is not
    // competing with everything else that finds midnight attractive.
    cadence: { dailyAtUtc: '01:15' },
    priority: 20,
  },
  {
    /*
     * The Twin's nightly tick.
     *
     * 02:30 UTC is half past four in the morning in Johannesburg — after the
     * sweep at 01:15 has tidied the queue, and long before anybody opens the
     * product to read what it found.
     *
     * It carries no organisation because it does not know how many exist: the
     * handler enumerates the tenants who opted in and fans out. That is why
     * this one schedule is here rather than one per customer, and why adding a
     * customer needs no change to this file.
     */
    name: 'twin-nightly',
    kind: nightlyTwinTick.kind,
    description: nightlyTwinTick.description,
    cadence: { dailyAtUtc: '02:30' },
    // Behind the housekeeping, ahead of nothing. It only enqueues.
    priority: 30,
  },
  {
    /*
     * The morning brief's tick.
     *
     * 03:30 UTC — half past five in Johannesburg, an hour after the Twin's
     * nightly run. The order matters and is not incidental: the brief's first
     * section compares yesterday against what the Twin predicted, and a brief
     * composed before the night's simulation would compare it against the
     * night before's. Reading yesterday against a prediction made two days ago
     * is not wrong so much as quietly stale, which is worse.
     *
     * An hour is slack rather than synchronisation. If the Twin has not
     * finished, the brief cites the most recent run it can see and says which
     * day that run was made on.
     */
    name: 'brief-nightly',
    kind: nightlyBriefTick.kind,
    description: nightlyBriefTick.description,
    cadence: { dailyAtUtc: '03:30' },
    priority: 30,
  },
  {
    /*
     * The nightly dump.
     *
     * 01:00 UTC — before the Twin's run at 02:30 and the brief's at 03:30, on
     * purpose. A backup taken before the night's writes captures the database
     * as it stood at the end of a settled day; one taken after captures it
     * mid-routine, and if the routine is what went wrong, the backup has
     * already recorded the damage.
     *
     * Priority behind the housekeeping and ahead of nothing: it is the longest
     * job here and holds a lease for as long as the dump takes, so it should
     * not sit in front of work that finishes in milliseconds.
     */
    name: 'backup-nightly',
    kind: nightlyBackup.kind,
    description: nightlyBackup.description,
    cadence: { dailyAtUtc: '01:00' },
    priority: 40,
  },
];

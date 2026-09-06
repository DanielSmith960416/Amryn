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
import { pruneRateLimits } from './handlers/prune-rate-limits';
import { measureTwinFidelity } from './handlers/measure-fidelity';
import { nightlyTwinTick } from './handlers/nightly-twin';
import { runAnalysis } from './handlers/run-analysis';
import { simulateTwin } from './handlers/simulate-twin';
import { sweepJobs } from './handlers/sweep-jobs';
import type { JobHandler } from './types';
import type { Schedule } from './schedule';

const HANDLERS: readonly JobHandler[] = [
  pruneRateLimits,
  sweepJobs,
  runAnalysis,
  measureTwinFidelity,
  nightlyTwinTick,
  simulateTwin,
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
];

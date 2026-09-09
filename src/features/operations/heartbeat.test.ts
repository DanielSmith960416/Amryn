import { describe, expect, it } from 'vitest';
import {
  MISSING_AFTER_SECONDS,
  STALE_AFTER_SECONDS,
  missingHandlers,
  workerHealth,
  type Heartbeat,
} from './heartbeat';

const NOW = new Date('2026-09-09T20:00:00Z');

function beat(secondsAgo: number, over: Partial<Heartbeat> = {}): Heartbeat {
  return {
    workerId: '9fab57a3891c/1/389f2acc',
    lastSeenAt: new Date(NOW.getTime() - secondsAgo * 1000).toISOString(),
    startedAt: new Date(NOW.getTime() - 3600 * 1000).toISOString(),
    handlers: ['analysis.run', 'brief.compose', 'jobs.sweep', 'rate_limits.prune'],
    inFlight: 0,
    revision: '86aec28',
    ...over,
  };
}

describe('workerHealth', () => {
  it('reports a worker that beat a moment ago as running', () => {
    const health = workerHealth(beat(3), NOW);
    expect(health.state).toBe('running');
    if (health.state !== 'running') return;
    expect(health.workerId).toBe('9fab57a3891c/1/389f2acc');
    expect(health.secondsSince).toBe(3);
  });

  it('does not call an idle worker unhealthy', () => {
    // The whole point: this queue is silent for sixteen hours a day. Idleness
    // is not a fault, and a check that says otherwise gets switched off.
    const health = workerHealth(beat(20, { inFlight: 0 }), NOW);
    expect(health.state).toBe('running');
  });

  it('tolerates a deploy replacing the worker', () => {
    // A threshold that fires on every routine deployment is one people learn
    // to ignore, which converts a real outage into a dismissed notification.
    expect(workerHealth(beat(STALE_AFTER_SECONDS + 30), NOW).state).toBe('stale');
  });

  it('calls it gone once no restart could explain it', () => {
    const health = workerHealth(beat(MISSING_AFTER_SECONDS + 60), NOW);
    expect(health.state).toBe('gone');
    if (health.state !== 'gone') return;
    expect(health.detail).toContain('Every schedule is stopped');
  });

  it('names what stops when the worker is gone, rather than saying "unhealthy"', () => {
    const health = workerHealth(beat(3600), NOW);
    if (health.state !== 'gone') throw new Error('expected gone');
    expect(health.detail).toContain('morning brief');
    expect(health.detail).toContain('crashlooping');
  });

  it('distinguishes never-started from died-an-hour-ago', () => {
    // Waiting is the right response to one and investigating to the other.
    const never = workerHealth(null, NOW);
    expect(never.state).toBe('never');
    if (never.state !== 'never') return;
    expect(never.detail).toContain('never started');
  });

  it('is exact at the boundaries rather than approximately right', () => {
    expect(workerHealth(beat(STALE_AFTER_SECONDS), NOW).state).toBe('running');
    expect(workerHealth(beat(STALE_AFTER_SECONDS + 1), NOW).state).toBe('stale');
    expect(workerHealth(beat(MISSING_AFTER_SECONDS), NOW).state).toBe('stale');
    expect(workerHealth(beat(MISSING_AFTER_SECONDS + 1), NOW).state).toBe('gone');
  });

  it('never reports a negative age when a clock disagrees', () => {
    // The worker's clock and the reader's are different machines.
    const health = workerHealth(beat(-30), NOW);
    expect(health.state).toBe('running');
    if (health.state !== 'running') return;
    expect(health.secondsSince).toBe(0);
  });

  it('describes a long absence in minutes and hours, not thousands of seconds', () => {
    const minutes = workerHealth(beat(600), NOW);
    if (minutes.state !== 'gone') throw new Error('expected gone');
    expect(minutes.detail).toContain('10 minutes');

    const hours = workerHealth(beat(7200), NOW);
    if (hours.state !== 'gone') throw new Error('expected gone');
    expect(hours.detail).toContain('2 hours');
  });
});

describe('missingHandlers', () => {
  it('catches a worker running an older build than the web service', () => {
    // Two services, one image, and a failed build on one of them. Invisible
    // from every other angle until a job queues with no handler to run it.
    expect(missingHandlers(beat(3), ['jobs.sweep', 'brief.nightly'])).toEqual(['brief.nightly']);
  });

  it('is quiet when the builds agree', () => {
    expect(missingHandlers(beat(3), ['jobs.sweep', 'analysis.run'])).toEqual([]);
  });

  it('claims nothing when there is no heartbeat to compare against', () => {
    // The absence of a worker is already reported; saying every handler is
    // missing as well would be two alarms for one fault.
    expect(missingHandlers(null, ['jobs.sweep'])).toEqual([]);
  });
});

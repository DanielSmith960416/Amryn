import { describe, expect, it } from 'vitest';
import { dueJobs, slotStart, type Schedule } from './schedule';
import { PLATFORM_SCHEDULES } from './registry';
import { registeredKinds } from './registry';

const hourly: Schedule = {
  name: 'hourly-thing',
  kind: 'rate_limits.prune',
  description: 'test',
  cadence: { everyMinutes: 60 },
};

const nightly: Schedule = {
  name: 'nightly-thing',
  kind: 'jobs.sweep',
  description: 'test',
  cadence: { dailyAtUtc: '01:15' },
};

describe('slotStart', () => {
  it('floors to the interval, anchored to the epoch rather than to boot time', () => {
    // Two workers that started minutes apart must agree where the boundary is.
    expect(slotStart(hourly, new Date('2026-09-06T02:59:59Z')).toISOString()).toBe(
      '2026-09-06T02:00:00.000Z',
    );
    expect(slotStart(hourly, new Date('2026-09-06T03:00:00Z')).toISOString()).toBe(
      '2026-09-06T03:00:00.000Z',
    );
  });

  it('gives the same slot for any instant inside it', () => {
    const a = slotStart(hourly, new Date('2026-09-06T02:00:01Z'));
    const b = slotStart(hourly, new Date('2026-09-06T02:44:44Z'));
    expect(a.getTime()).toBe(b.getTime());
  });

  it('handles an interval that does not divide the hour', () => {
    // Asserted as a property rather than a constant, because the anchor is the
    // epoch and not midnight — a hand-computed "quarter past" expectation here
    // would be asserting the wrong mental model and would pass only by luck.
    const every7 = { ...hourly, cadence: { everyMinutes: 7 } } as Schedule;
    const now = new Date('2026-09-06T00:20:00Z');
    const slot = slotStart(every7, now);
    const seven = 7 * 60_000;

    expect(slot.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(now.getTime() - slot.getTime()).toBeLessThan(seven);
    expect(slot.getTime() % seven).toBe(0);
    // And the next slot is exactly one interval on.
    expect(slotStart(every7, new Date(slot.getTime() + seven)).getTime() - slot.getTime()).toBe(
      seven,
    );
  });

  it('takes a zero or negative interval as one minute rather than dividing by zero', () => {
    const broken = { ...hourly, cadence: { everyMinutes: 0 } } as Schedule;
    const slot = slotStart(broken, new Date('2026-09-06T02:30:30Z'));
    expect(slot.toISOString()).toBe('2026-09-06T02:30:00.000Z');
  });

  it('uses today for a daily schedule once its time has passed', () => {
    expect(slotStart(nightly, new Date('2026-09-06T02:12:00Z')).toISOString()).toBe(
      '2026-09-06T01:15:00.000Z',
    );
  });

  it('and yesterday before it, so a worker starting at midnight does not sit on a job it has no record of', () => {
    expect(slotStart(nightly, new Date('2026-09-06T00:30:00Z')).toISOString()).toBe(
      '2026-09-05T01:15:00.000Z',
    );
  });

  it('is exact at the boundary', () => {
    expect(slotStart(nightly, new Date('2026-09-06T01:15:00Z')).toISOString()).toBe(
      '2026-09-06T01:15:00.000Z',
    );
  });

  it('crosses a month boundary without inventing a date', () => {
    expect(slotStart(nightly, new Date('2026-10-01T00:00:00Z')).toISOString()).toBe(
      '2026-09-30T01:15:00.000Z',
    );
  });

  it('is unaffected by the machine being in another timezone', () => {
    // The cadence is UTC on purpose: a schedule that moves twice a year is a
    // schedule that fails twice a year. This asserts the arithmetic never
    // touches the local zone, whatever the container is set to.
    const original = process.env.TZ;
    try {
      process.env.TZ = 'Africa/Johannesburg';
      expect(slotStart(nightly, new Date('2026-09-06T02:12:00Z')).toISOString()).toBe(
        '2026-09-06T01:15:00.000Z',
      );
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('dueJobs', () => {
  it('names the slot in the dedupe key, which is what stops four workers enqueueing four jobs', () => {
    const [job] = dueJobs(new Date('2026-09-06T02:44:00Z'), [hourly]);
    expect(job?.dedupeKey).toBe('hourly-thing:2026-09-06T02:00:00.000Z');
    expect(job?.kind).toBe('rate_limits.prune');
    expect(job?.runAt.toISOString()).toBe('2026-09-06T02:00:00.000Z');
  });

  it('returns the same key for every instant in the slot, and a new one after it', () => {
    const key = (at: string) => dueJobs(new Date(at), [hourly])[0]?.dedupeKey;
    expect(key('2026-09-06T02:00:00Z')).toBe(key('2026-09-06T02:59:59Z'));
    expect(key('2026-09-06T03:00:00Z')).not.toBe(key('2026-09-06T02:59:59Z'));
  });

  it('does not catch up: a worker down for six hours enqueues the current slot only', () => {
    // Six missed hourly slots would otherwise all run at once, against the
    // same data, and the older five would have nothing left to say.
    expect(dueJobs(new Date('2026-09-06T08:10:00Z'), [hourly])).toHaveLength(1);
  });

  it('returns one entry per schedule and defaults the priority', () => {
    const jobs = dueJobs(new Date('2026-09-06T02:44:00Z'), [hourly, nightly]);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]?.priority).toBe(100);
    expect(jobs[0]?.payload).toEqual({});
  });
});

describe('the platform schedules', () => {
  it('only ask for handlers that exist', () => {
    // A schedule naming a kind nothing can run would queue a job every hour
    // that fails every hour, which is a quiet way to fill a table.
    for (const schedule of PLATFORM_SCHEDULES) {
      expect(registeredKinds()).toContain(schedule.kind);
    }
  });

  it('have distinct names, so their dedupe keys cannot collide', () => {
    const names = PLATFORM_SCHEDULES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('produce a due job apiece at any instant', () => {
    expect(dueJobs(new Date('2026-09-06T02:44:00Z'))).toHaveLength(PLATFORM_SCHEDULES.length);
  });
});

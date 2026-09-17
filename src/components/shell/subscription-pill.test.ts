import { afterEach, describe, expect, it, vi } from 'vitest';
import { daysUntil, subscriptionLabel } from './subscription-pill';

afterEach(() => {
  vi.useRealTimers();
});

describe('a trial, which is the case this exists for', () => {
  it('leads with the number of days, because that is what makes somebody act', () => {
    expect(subscriptionLabel('open', true, 14, '2026-10-01')).toBe(
      '14 days left on trial — subscribe',
    );
  });

  it('says tomorrow and today rather than 1 and 0 days', () => {
    expect(subscriptionLabel('open', true, 1, '2026-09-18')).toBe(
      'Trial ends tomorrow — subscribe',
    );
    expect(subscriptionLabel('open', true, 0, '2026-09-17')).toBe(
      'Trial ends today — subscribe',
    );
  });

  /*
   * A trial whose end date is missing is still a trial. Saying nothing would
   * hide the one thing this component exists to show, and inventing a number
   * would be worse than having none.
   */
  it('still says so when there is no end date to count to', () => {
    expect(subscriptionLabel('open', true, null, null)).toBe('On trial — subscribe');
  });

  it('does not go negative once the date has passed', () => {
    expect(subscriptionLabel('open', true, -3, '2026-09-14')).toBe(
      'Trial ends today — subscribe',
    );
  });
});

describe('a lapsed subscription', () => {
  it('says so before anything else, trial or not', () => {
    expect(subscriptionLabel('read_only', true, 9, '2026-10-01')).toBe(
      'Subscription lapsed — renew',
    );
    expect(subscriptionLabel('read_only', false, null, null)).toBe(
      'Subscription lapsed — renew',
    );
  });
});

describe('a paying customer', () => {
  /*
   * The point of the component. A badge that is always there telling somebody
   * they are a paying customer is noise, and noise is what makes people stop
   * reading the bar it sits in.
   */
  it('is shown nothing at all', () => {
    expect(subscriptionLabel('open', false, null, null)).toBeNull();
    expect(subscriptionLabel('open', false, 200, '2027-09-01')).toBeNull();
  });

  it('is told only when the end is close enough to act on', () => {
    expect(subscriptionLabel('open', false, 31, '2026-10-18')).toBeNull();
    expect(subscriptionLabel('open', false, 9, '2026-09-26')).toMatch(/Subscription ends/);
  });

  /*
   * A subscription ending could be a cancellation or a grace period being
   * served, and this component cannot tell them apart. It states the date and
   * claims nothing about the cause — telling somebody they had cancelled when
   * they had not is worse than saying less.
   */
  it('states the date and does not guess why', () => {
    const label = subscriptionLabel('open', false, 9, '2026-09-26')!;
    expect(label).not.toMatch(/cancel/i);
    expect(label).not.toMatch(/overdue/i);
    expect(label).toMatch(/renew/);
  });
});

describe('counting the days', () => {
  it('counts calendar days, not elapsed hours', () => {
    // 23:00 today to 01:00 tomorrow is two hours and one day.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T23:00:00Z'));
    expect(daysUntil('2026-09-18T01:00:00Z')).toBe(1);
  });

  it('is zero on the day itself, whatever the time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T02:00:00Z'));
    expect(daysUntil('2026-09-17T23:59:00Z')).toBe(0);
  });

  it('has nothing to say about a missing or unreadable date', () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil('not a date')).toBeNull();
  });
});

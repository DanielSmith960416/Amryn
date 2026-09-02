import { describe, expect, it } from 'vitest';
import { Entitlements, subscriptionAccess, type ResolvedEntitlement } from './access';

/**
 * The same cases supabase/tests/19_subscription_entitlements_test.sql asserts
 * against amryn.subscription_current().
 *
 * There are deliberately two implementations of one rule: the database has to
 * decide it in order to enforce it, and the interface has to decide it before
 * a page renders in order to explain it. What makes that safe rather than
 * merely duplicated is this file — the two are held to the same table of
 * cases, so they cannot drift without one of the suites going red.
 */
const NOW = new Date('2026-06-15T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

function subscription(over: Partial<Parameters<typeof subscriptionAccess>[0] & object> = {}) {
  return {
    status: 'active' as const,
    trial_ends_at: null,
    current_period_end: days(20),
    grace_until: null,
    ...over,
  };
}

describe('subscriptionAccess', () => {
  it('lets an active subscription through', () => {
    expect(subscriptionAccess(subscription(), NOW).state).toBe('open');
  });

  it('lets a trial through until the day it ends', () => {
    const trial = subscription({ status: 'trialing', trial_ends_at: days(3) });
    expect(subscriptionAccess(trial, NOW).state).toBe('open');
    expect(subscriptionAccess(trial, NOW).trialing).toBe(true);
  });

  it('stops an expired trial without anything having to notice the date', () => {
    const trial = subscription({ status: 'trialing', trial_ends_at: days(-1) });
    expect(subscriptionAccess(trial, NOW).state).toBe('read_only');
  });

  it('falls back to the period end for a trial with no end date of its own', () => {
    const trial = subscription({ status: 'trialing', current_period_end: days(-1) });
    expect(subscriptionAccess(trial, NOW).state).toBe('read_only');
  });

  it('keeps a late payment working inside its grace period', () => {
    const late = subscription({ status: 'past_due', current_period_end: days(-2), grace_until: days(5) });
    expect(subscriptionAccess(late, NOW).state).toBe('open');
    // Working, and still worth saying something about.
    expect(subscriptionAccess(late, NOW).reason).not.toBe('');
  });

  it('stops once the grace period is spent', () => {
    const late = subscription({ status: 'past_due', current_period_end: days(-20), grace_until: days(-1) });
    expect(subscriptionAccess(late, NOW).state).toBe('read_only');
  });

  it('allows the same seven days the database does when no grace date was set', () => {
    // amryn.subscription_current() defaults to current_period_end + 7 days.
    const within = subscription({ status: 'past_due', current_period_end: days(-6), grace_until: null });
    const past = subscription({ status: 'past_due', current_period_end: days(-8), grace_until: null });
    expect(subscriptionAccess(within, NOW).state).toBe('open');
    expect(subscriptionAccess(past, NOW).state).toBe('read_only');
  });

  it('stops a cancelled subscription, and says the data is still theirs', () => {
    const access = subscriptionAccess(subscription({ status: 'cancelled' }), NOW);
    expect(access.state).toBe('read_only');
    expect(access.reason).toMatch(/still here and still yours/i);
  });

  it('treats a missing subscription as unpaid rather than as a free pass', () => {
    expect(subscriptionAccess(null, NOW).state).toBe('read_only');
  });

  it('never leaves a hold unexplained', () => {
    for (const status of ['trialing', 'past_due', 'cancelled'] as const) {
      const access = subscriptionAccess(
        subscription({ status, trial_ends_at: days(-1), current_period_end: days(-30) }),
        NOW,
      );
      expect(access.state).toBe('read_only');
      expect(access.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('Entitlements', () => {
  const resolved: ResolvedEntitlement[] = [
    { key: 'competitor_radar', category: 'Growth', name: 'Competitor radar', description: '', kind: 'feature', included: false, limit: null },
    { key: 'market_intelligence', category: 'Growth', name: 'Market intelligence', description: '', kind: 'feature', included: true, limit: null },
    { key: 'seats', category: 'Operations', name: 'People', description: '', kind: 'quota', included: true, limit: 10 },
    { key: 'data_sources', category: 'Operations', name: 'Data sources', description: '', kind: 'quota', included: true, limit: null },
    { key: 'api_access', category: 'Operations', name: 'API access', description: '', kind: 'feature', included: false, limit: null },
  ];
  const entitlements = new Entitlements(resolved);

  it('answers what the plan includes', () => {
    expect(entitlements.has('market_intelligence')).toBe(true);
    expect(entitlements.has('competitor_radar')).toBe(false);
  });

  it('treats an entitlement it has never heard of as not included', () => {
    expect(entitlements.has('sso')).toBe(false);
  });

  // The distinction the whole design turns on. A single nullable number could
  // not tell "unlimited" and "not sold" apart, which is why `included` and
  // `limit` are separate.
  it('separates unlimited from not included', () => {
    expect(entitlements.has('data_sources')).toBe(true);
    expect(entitlements.limit('data_sources')).toBeNull();
    expect(entitlements.has('api_access')).toBe(false);
    expect(entitlements.limit('api_access')).toBeNull();
  });

  it('says whether one more fits', () => {
    expect(entitlements.room('seats', 9)).toBe(true);
    expect(entitlements.room('seats', 10)).toBe(false);
    expect(entitlements.room('seats', 8, 2)).toBe(true);
    expect(entitlements.room('seats', 9, 2)).toBe(false);
  });

  it('always has room where there is no limit, and never where it is not sold', () => {
    expect(entitlements.room('data_sources', 10_000)).toBe(true);
    expect(entitlements.room('api_access', 0)).toBe(false);
  });

  it('throws with the feature named, so the message can be shown as it is', () => {
    expect(() => entitlements.assert('competitor_radar')).toThrow(/Competitor radar/);
    expect(() => entitlements.assert('market_intelligence')).not.toThrow();
  });

  it('lists features and quotas apart', () => {
    expect(entitlements.list('feature').map((e) => e.key)).toEqual([
      'competitor_radar',
      'market_intelligence',
      'api_access',
    ]);
    expect(entitlements.list('quota').map((e) => e.key)).toEqual(['seats', 'data_sources']);
  });

  it('an empty resolution claims nothing rather than everything', () => {
    const none = new Entitlements([]);
    expect(none.has('command_centre')).toBe(false);
    expect(none.room('seats', 0)).toBe(false);
  });
});

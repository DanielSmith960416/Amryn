import { describe, expect, it } from 'vitest';
import { Entitlements, type ResolvedEntitlement } from '@/lib/billing/access';
import { connectionsRemaining, mayConnect, type ConnectContext } from './access';
import type { ConnectorDefinition } from './catalogue';

/**
 * These pin the *reasons*, not just the refusals. A gate that says no for the
 * wrong reason sends the customer to the wrong remedy — most expensively, to
 * an upgrade that would not have helped.
 */

function entitlements(over: Partial<ResolvedEntitlement>[] = []): Entitlements {
  const base: ResolvedEntitlement = {
    key: 'data_sources',
    category: 'Operations',
    name: 'Data sources',
    description: '',
    kind: 'quota',
    included: true,
    limit: 8,
  };
  return new Entitlements(over.map((o) => ({ ...base, ...o }) as ResolvedEntitlement));
}

function definition(over: Partial<ConnectorDefinition> = {}): ConnectorDefinition {
  return {
    id: 'xero',
    name: 'Xero',
    description: '',
    category: 'accounting',
    market: 'global',
    priority: 'critical',
    auth: 'oauth2',
    viaNango: true,
    supportsSync: true,
    supportsWebhooks: true,
    intendedReads: [],
    intendedWrites: [],
    minimumPlan: 'growth',
    entitlement: null,
    // Connectable, so the tests below exercise the gates that follow rather
    // than stopping at the first one.
    status: 'available',
    verification: 'confirmed',
    capabilitiesSource: 'https://example.invalid/docs',
    ...over,
  };
}

function context(over: Partial<ConnectContext> = {}): ConnectContext {
  return {
    plan: 'growth',
    entitlements: entitlements([{ key: 'data_sources', limit: 8 }]),
    used: 0,
    ...over,
  };
}

describe('mayConnect', () => {
  it('allows a connector the plan reaches with room to spare', () => {
    expect(mayConnect(definition(), context())).toEqual({ allowed: true });
  });

  it('refuses an unbuilt connector before asking anything about the plan', () => {
    // The ordering that matters most. Somebody on Starter looking at a
    // connector Amryn has not built must not be told to upgrade — the upgrade
    // would not deliver it, and they would find that out after paying.
    const decision = mayConnect(
      definition({ status: 'investigating', verification: 'unconfirmed', capabilitiesSource: null }),
      context({ plan: 'starter' }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe('unavailable');
    expect(decision.remedy).toBeUndefined();
  });

  it('names the tier that would carry it', () => {
    const decision = mayConnect(definition(), context({ plan: 'starter' }));
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe('plan');
    expect(decision.detail).toContain('Growth');
    expect(decision.remedy).toContain('Growth');
  });

  it('separates a missing feature from a tier that is too low', () => {
    // SAP is reached by Enterprise on tier alone, and still gated by the
    // enterprise_connectors feature. Two different upgrades; two different
    // sentences.
    const sap = definition({ minimumPlan: 'enterprise', entitlement: 'enterprise_connectors', name: 'SAP' });
    const decision = mayConnect(
      sap,
      context({ plan: 'enterprise', entitlements: entitlements([{ key: 'data_sources', limit: null }]) }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe('entitlement');
  });

  it('refuses when every connection is in use, and says so rather than blaming the plan', () => {
    const decision = mayConnect(definition(), context({ used: 8 }));
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe('quota');
    expect(decision.detail).toContain('8');
    expect(decision.remedy).toContain('Disconnect');
  });

  it('allows the last one, and refuses the one after it', () => {
    // Off-by-one on a paid ceiling is the version of this bug a customer
    // notices: either they are sold nine, or they are refused the eighth.
    expect(mayConnect(definition(), context({ used: 7 })).allowed).toBe(true);
    expect(mayConnect(definition(), context({ used: 8 })).allowed).toBe(false);
  });

  it('never refuses on quota where the plan carries no ceiling', () => {
    const unlimited = context({
      plan: 'enterprise',
      entitlements: entitlements([{ key: 'data_sources', limit: null }]),
      used: 500,
    });
    expect(mayConnect(definition(), unlimited)).toEqual({ allowed: true });
  });

  it('refuses when the quota is not part of the plan at all', () => {
    // has() is false, so limit() is null — which must not be read as
    // "unlimited". A plan that does not sell connections sells none.
    const none = context({ entitlements: entitlements([{ key: 'data_sources', included: false }]) });
    const decision = mayConnect(definition(), none);
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe('quota');
  });
});

describe('connectionsRemaining', () => {
  it('counts down', () => {
    expect(connectionsRemaining(context({ used: 3 }))).toBe(3 + 2);
  });

  it('is null where there is no ceiling', () => {
    expect(
      connectionsRemaining(context({ entitlements: entitlements([{ key: 'data_sources', limit: null }]) })),
    ).toBeNull();
  });

  it('never goes negative, so a downgrade below what is already connected reads as none left', () => {
    expect(connectionsRemaining(context({ used: 12 }))).toBe(0);
  });
});

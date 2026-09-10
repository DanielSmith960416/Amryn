import { beforeEach, describe, expect, it } from 'vitest';
import {
  ProviderError,
  implementedProviders,
  providerFor,
  registerProvider,
  requireProvider,
  type ConnectorProvider,
} from './provider';
import { connector, type ConnectorDefinition } from './catalogue';

function stub(id: string): ConnectorProvider {
  return {
    id,
    authorise: async () => ({ url: 'https://example.invalid/oauth', state: 'x' }),
    complete: async () => ({ credentialRef: 'ref' }),
    fetch: async () => ({ records: [], cursor: null }),
    revoke: async () => {},
  };
}

function definition(over: Partial<ConnectorDefinition> = {}): ConnectorDefinition {
  return { ...connector('xero')!, ...over };
}

describe('the registry', () => {
  it('starts empty, which is the honest state today', () => {
    // No provider has been written. If this ever fails without somebody
    // meaning it, a connector has been registered without going through the
    // catalogue's verification, and the gate below is the only thing left.
    expect(implementedProviders()).toEqual([]);
  });

  it('finds what is registered and returns null rather than throwing for what is not', () => {
    registerProvider(stub('test_provider'));
    expect(providerFor('test_provider')?.id).toBe('test_provider');
    expect(providerFor('nothing_registered')).toBeNull();
  });
});

describe('requireProvider', () => {
  beforeEach(() => {
    registerProvider(stub('xero'));
  });

  it('refuses a connector with no implementation, and says that is what it is', () => {
    const sage = definition({ id: 'sage', name: 'Sage' });
    expect(() => requireProvider(sage)).toThrow(ProviderError);
    expect(() => requireProvider(sage)).toThrow(/no connector implementation/i);
  });

  it('refuses an implemented connector that is still unconfirmed', () => {
    // The two states have the same symptom and different remedies: one waits
    // for engineering, the other waits for somebody to read a page of the
    // provider's documentation. Saying which is the whole point.
    const unconfirmed = definition({ verification: 'unconfirmed' });
    expect(() => requireProvider(unconfirmed)).toThrow(/not been checked/i);
  });

  it('allows one that is both implemented and confirmed', () => {
    const ready = definition({ verification: 'confirmed', capabilitiesSource: 'https://x.invalid' });
    expect(requireProvider(ready).id).toBe('xero');
  });
});

describe('ProviderError', () => {
  it('defaults to not retryable, because most provider refusals are settled', () => {
    expect(new ProviderError('no').retryable).toBe(false);
  });

  it('carries retryable where the caller knows better', () => {
    expect(new ProviderError('rate limited', { retryable: true }).retryable).toBe(true);
  });

  it('keeps the cause without putting it in the message shown to a customer', () => {
    const cause = new Error('ECONNRESET at 10.0.0.1');
    const error = new ProviderError('We could not reach Xero just now.', { cause });
    expect(error.message).not.toContain('10.0.0.1');
    expect(error.cause).toBe(cause);
  });
});

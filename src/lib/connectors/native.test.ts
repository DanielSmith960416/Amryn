import { describe, expect, it, vi } from 'vitest';

import { CONNECTORS, connector, isConnectable } from './catalogue';
import { credentialsIn } from './credentials';
import { authorisingProvider, connectPath, implemented, syncingProvider } from './native';
import { authorisedByKey } from './provider';

describe('the implementations behind the catalogue', () => {
  it('has one for Paystack', () => {
    expect(implemented(CONNECTORS)).toEqual(['paystack']);
  });

  /*
   * The rule the catalogue enforces from its side, checked from this one: a
   * connector a customer can press Connect on must have something behind the
   * button. Marking a row 'available' without an implementation would give
   * them a form that fails after they have typed a credential into it.
   */
  it('and every connectable row has one', () => {
    const connectable = CONNECTORS.filter(isConnectable).map((c) => c.id);
    expect(connectable.sort()).toEqual(implemented(CONNECTORS).sort());
  });

  it('offers nothing for a connector nobody has built', () => {
    expect(authorisingProvider(connector('sage')!)).toBeNull();
    expect(syncingProvider(connector('sage')!, credentialsIn({}))).toBeNull();
  });
});

describe('the two surfaces get different providers', () => {
  const paystack = connector('paystack')!;

  it('gives the application one that can check a key', () => {
    const provider = authorisingProvider(paystack)!;
    expect(authorisedByKey(provider)).toBe(true);
  });

  /*
   * The property worth a test rather than a comment. The application runs as
   * the signed-in person and connection_credential is granted to service_role
   * alone, so a provider that could read credentials would be a provider that
   * fails at the database — or worse, one that needed that grant opening.
   */
  it('and one that cannot read one back, however it is called', async () => {
    const provider = authorisingProvider(paystack)!;

    await expect(
      provider.fetch({ credentialRef: 'ref-1', kind: 'transactions', cursor: null, since: null }),
    ).rejects.toThrow(/cannot be read from here/);
  });

  it('gives the worker one that can', async () => {
    const store = credentialsIn({ 'ref-1': 'sk_test_x' });
    const read = vi.spyOn(store, 'read');
    const provider = syncingProvider(paystack, store)!;

    expect(provider.id).toBe('paystack');

    /*
     * A kind this connector does not serve, deliberately: readPage returns an
     * empty page for it without calling out, so this proves the credential was
     * resolved without the test opening a socket. The earlier version let the
     * real request fail and asserted on the message, which passed for the
     * wrong reason and made a unit test depend on the network.
     */
    const page = await provider.fetch({
      credentialRef: 'ref-1',
      kind: 'refunds',
      cursor: null,
      since: null,
    });

    expect(read).toHaveBeenCalledWith('ref-1');
    expect(page).toEqual({ records: [], cursor: null });
  });
});

describe('connectPath', () => {
  it('points at the connector’s own page', () => {
    expect(connectPath(connector('paystack')!)).toBe('/data/integrations/paystack');
  });
});

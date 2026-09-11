import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { connector } from '../catalogue';
import { credentialsIn, type CredentialStore } from '../credentials';
import { ProviderError } from '../provider';
import { PER_PAGE, type PaystackRequest } from './api';
import { paystackProvider } from './provider';

const definition = connector('paystack')!;

const subject = {
  organisationId: 'f0000000-0000-0000-0000-0000000000a1',
  userId: 'e1111111-1111-1111-1111-111111111111',
  userEmail: 'owner@alpha.test',
};

function transaction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 4013709635,
    domain: 'test',
    status: 'success',
    reference: 'rXXXXXXXXXXXXXX',
    amount: 400000,
    currency: 'ZAR',
    channel: 'card',
    paid_at: '2026-08-11T09:12:00.000Z',
    created_at: '2026-08-11T09:11:40.000Z',
    fees: 12000,
    customer: { id: 89312, email: 'buyer@example.invalid', customer_code: 'CUS_xxxxx' },
    ...overrides,
  };
}

/**
 * A gateway that answers with fixtures and records who asked with what key.
 *
 * The key is recorded on purpose: several assertions below are about *which*
 * key reached Paystack, and one is about a key reaching it at all.
 */
function gateway(rows: Record<string, unknown>[] = [transaction()]) {
  const seen: { key: string; request: PaystackRequest }[] = [];
  return {
    seen,
    transport: (key: string) => async (request: PaystackRequest) => {
      seen.push({ key, request });
      return { status: true, message: 'ok', data: rows, meta: null };
    },
  };
}

function build(
  store: CredentialStore,
  rows?: Record<string, unknown>[],
): ReturnType<typeof paystackProvider> & { seen: { key: string; request: PaystackRequest }[] } {
  const stub = gateway(rows);
  const provider = paystackProvider({
    store,
    keyEntryUrl: '/data/integrations/paystack',
    transport: stub.transport,
  });
  return Object.assign(provider, { seen: stub.seen });
}

describe('invite', () => {
  it('sends the customer to a page inside Amryn, not to the gateway', async () => {
    const provider = build(credentialsIn({}));
    const invitation = await provider.invite(definition, subject);
    expect(invitation.url).toBe('/data/integrations/paystack');
  });

  /*
   * The case Invitation.expiresAt was widened for. There is no third-party
   * session with a clock on it, so an expiry here would be a deadline the
   * interface announces and nothing enforces.
   */
  it('claims no expiry, because nothing expires', async () => {
    const provider = build(credentialsIn({}));
    expect((await provider.invite(definition, subject)).expiresAt).toBeNull();
  });
});

describe('adopt', () => {
  it('proves the key works before anything is called live', async () => {
    const provider = build(credentialsIn({ 'ref-1': 'sk_test_good' }));

    await provider.adopt(definition, 'ref-1');

    expect(provider.seen).toHaveLength(1);
    expect(provider.seen[0]!.key).toBe('sk_test_good');
    expect(provider.seen[0]!.request.path).toBe('/transaction');
  });

  // One record, not fifty. The check is "does this key work", and a first
  // connection should not open by pulling a page of somebody's payments.
  it('spends the smallest documented read on it', async () => {
    const provider = build(credentialsIn({ 'ref-1': 'sk_test_good' }));
    await provider.adopt(definition, 'ref-1');
    expect(provider.seen[0]!.request.query?.perPage).toBe(1);
    expect(provider.seen[0]!.request.query?.perPage).not.toBe(PER_PAGE);
  });

  it('hands back the same handle it was given', async () => {
    const provider = build(credentialsIn({ 'ref-1': 'sk_test_good' }));
    expect((await provider.adopt(definition, 'ref-1')).credentialRef).toBe('ref-1');
  });

  /*
   * Connecting a test key and then waiting for real revenue to appear is a
   * mistake that looks exactly like a broken sync. Paystack says which set of
   * keys it is on every transaction; this is the only place it gets surfaced.
   */
  it('says out loud when the key is a test key', async () => {
    const provider = build(credentialsIn({ 'ref-1': 'sk_test_good' }));
    expect((await provider.adopt(definition, 'ref-1')).accountLabel).toBe('Paystack (test)');
  });

  it('and when it is the live one', async () => {
    const provider = build(credentialsIn({ 'ref-1': 'sk_live_good' }), [
      transaction({ domain: 'live' }),
    ]);
    expect((await provider.adopt(definition, 'ref-1')).accountLabel).toBe('Paystack (live)');
  });

  /*
   * A business that has taken no payments yet is a new business, not a bad
   * key. It connects, and carries no label rather than a guessed one.
   */
  it('accepts an account with no transactions and claims nothing about it', async () => {
    const provider = build(credentialsIn({ 'ref-1': 'sk_test_new' }), []);
    const established = await provider.adopt(definition, 'ref-1');
    expect(established.credentialRef).toBe('ref-1');
    expect(established.accountLabel).toBeUndefined();
  });

  it('refuses a handle that resolves to nothing, and does not call out', async () => {
    const provider = build(credentialsIn({}));

    await expect(provider.adopt(definition, 'ref-missing')).rejects.toThrow(ProviderError);
    expect(provider.seen).toHaveLength(0);
  });

  it('and calls that refusal final, because retrying resolves no handle', async () => {
    const provider = build(credentialsIn({}));
    await expect(provider.adopt(definition, 'ref-missing')).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('refuses a key the gateway will not accept', async () => {
    const provider = paystackProvider({
      store: credentialsIn({ 'ref-1': 'sk_test_wrong' }),
      keyEntryUrl: '/data/integrations/paystack',
      transport: () => async () => ({ status: false, message: 'Invalid key', data: null }),
    });

    await expect(provider.adopt(definition, 'ref-1')).rejects.toThrow(ProviderError);
  });
});

describe('fetch', () => {
  it('pulls a page with the key behind the handle', async () => {
    const provider = build(credentialsIn({ 'ref-1': 'sk_test_good' }));

    const page = await provider.fetch({
      credentialRef: 'ref-1',
      kind: 'transactions',
      cursor: null,
      since: null,
    });

    expect(provider.seen[0]!.key).toBe('sk_test_good');
    expect(page.records).toHaveLength(1);
    expect(page.records[0]!.kind).toBe('transactions');
  });

  it('passes an incremental sync’s watermark and cursor through', async () => {
    const provider = build(credentialsIn({ 'ref-1': 'sk_test_good' }));

    await provider.fetch({
      credentialRef: 'ref-1',
      kind: 'failed_payments',
      cursor: 'page:3',
      since: new Date('2026-02-03T04:05:06.000Z'),
    });

    expect(provider.seen[0]!.request.query).toMatchObject({
      page: 3,
      status: 'failed',
      from: '2026-02-03T04:05:06.000Z',
    });
  });

  it('refuses when the handle no longer resolves', async () => {
    const provider = build(credentialsIn({}));

    await expect(
      provider.fetch({ credentialRef: 'ref-gone', kind: 'transactions', cursor: null, since: null }),
    ).rejects.toThrow(ProviderError);
  });

  /*
   * No cache, on purpose: a cached key outlives the disconnect that was meant
   * to remove it. Two syncs must be two reads.
   */
  it('asks the store again rather than holding on to the key', async () => {
    const store = credentialsIn({ 'ref-1': 'sk_test_good' });
    const read = vi.spyOn(store, 'read');
    const provider = build(store);

    const page = { credentialRef: 'ref-1', kind: 'transactions', cursor: null, since: null };
    await provider.fetch(page);
    await provider.fetch(page);

    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe('revoke', () => {
  it('deletes Amryn’s copy', async () => {
    const store = credentialsIn({ 'ref-1': 'sk_test_good' });
    const provider = build(store);

    await provider.revoke('ref-1');

    expect(await store.read('ref-1')).toBeNull();
  });

  /*
   * Somebody who revoked the key at Paystack first and disconnected afterwards
   * has done the right thing in the wrong order, and should not meet an error.
   */
  it('is quiet about a credential that is already gone', async () => {
    const provider = build(credentialsIn({}));
    await expect(provider.revoke('ref-gone')).resolves.toBeUndefined();
  });

  /*
   * The honest limit of this method. Amryn cannot invalidate somebody's
   * Paystack key — only they can, in their dashboard — so revoke() must not
   * quietly acquire a call to the gateway that pretends otherwise.
   */
  it('does not pretend to revoke anything at the gateway', async () => {
    const provider = build(credentialsIn({ 'ref-1': 'sk_test_good' }));
    await provider.revoke('ref-1');
    expect(provider.seen).toHaveLength(0);
  });
});

/*
 * The key is borrowed, never kept.
 *
 * A provider that stashed the credential on a field would work perfectly and
 * would also survive a disconnect, a plan downgrade and a key rotation. This
 * is the cheap structural check that it does not.
 */
describe('the provider holds no credential', () => {
  const source = readFileSync(new URL('./provider.ts', import.meta.url), 'utf8');

  it('keeps nothing between calls', () => {
    expect(source).not.toMatch(/\b(cache|cached|lastKey|keyFor|memo)\b\s*[:=]/);
  });

  it('reads the store inside the one helper, so there is one place to check', () => {
    expect(source.split('store.read').length - 1).toBe(1);
  });
});

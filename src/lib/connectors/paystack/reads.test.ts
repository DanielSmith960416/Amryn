import { describe, expect, it } from 'vitest';

import { connector } from '../catalogue';
import { PER_PAGE, type PaystackRequest } from './api';
import { PAYSTACK_READS, paystackRead, readPage, toRecord } from './reads';

function transaction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 4013709635,
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

function stub(rows: Record<string, unknown>[]): {
  transport: (request: PaystackRequest) => Promise<unknown>;
  asked: PaystackRequest[];
} {
  const asked: PaystackRequest[] = [];
  return {
    asked,
    transport: async (request) => {
      asked.push(request);
      return { status: true, message: 'ok', data: rows, meta: null };
    },
  };
}

/**
 * Index with a message rather than a `!`.
 *
 * A test that asserts on a request nobody made should say so, not fail two
 * lines later reading a property of undefined.
 */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`nothing was recorded at ${index}`);
  return item;
}

describe('the kinds Amryn reads', () => {
  it('offers only what the documentation covers', () => {
    expect(PAYSTACK_READS.map((read) => read.kind)).toEqual(['transactions', 'failed_payments']);
  });

  /*
   * The catalogue is what the rest of the application reads, and this file is
   * what actually serves those kinds. If they drift, a sync asks for something
   * nobody implemented and quietly returns nothing.
   */
  it('matches the catalogue entry exactly', () => {
    const paystack = connector('paystack');
    expect(paystack).not.toBeNull();
    expect([...paystack!.intendedReads].sort()).toEqual(
      PAYSTACK_READS.map((read) => read.kind).sort(),
    );
  });

  it('writes nothing back, as the catalogue promises', () => {
    expect(connector('paystack')!.intendedWrites).toEqual([]);
  });

  it('does not answer for a kind it has not checked', () => {
    expect(paystackRead('refunds')).toBeNull();
    expect(paystackRead('payouts')).toBeNull();
  });
});

describe('toRecord', () => {
  const record = toRecord('transactions', {
    id: '4013709635',
    reference: 'rXXXXXXXXXXXXXX',
    status: 'success',
    amountMinor: 400000,
    currency: 'ZAR',
    channel: 'card',
    paidAt: '2026-08-11T09:12:00.000Z',
    createdAt: '2026-08-11T09:11:40.000Z',
    feesMinor: 12000,
    customerEmail: 'buyer@example.invalid',
    customerCode: 'CUS_xxxxx',
    raw: { id: 4013709635, authorization: { bin: '408408' } },
  });

  it('keys on the provider’s own id, so a second sync updates', () => {
    expect(record.externalId).toBe('4013709635');
  });

  it('spells the subunit out in the field name', () => {
    expect(record.attributes.amount_minor).toBe(400000);
    expect(record.attributes.fees_minor).toBe(12000);
  });

  it('carries the untouched payload for whoever maps it', () => {
    expect((record.attributes.paystack as { authorization: { bin: string } }).authorization.bin)
      .toBe('408408');
  });

  it('times a payment by when it was paid', () => {
    expect(record.updatedAt).toBe('2026-08-11T09:12:00.000Z');
  });

  /*
   * A failed payment never gets a paid_at. Timing it by that field alone would
   * leave every failure undated — which is the half of the data a business
   * most needs a date on.
   */
  it('falls back to when it was created, so a failure is still dated', () => {
    const failed = toRecord('failed_payments', {
      id: '9',
      reference: 'r',
      status: 'failed',
      amountMinor: 100,
      currency: 'ZAR',
      channel: null,
      paidAt: null,
      createdAt: '2026-08-11T09:11:40.000Z',
      feesMinor: null,
      customerEmail: null,
      customerCode: null,
      raw: {},
    });
    expect(failed.updatedAt).toBe('2026-08-11T09:11:40.000Z');
  });
});

describe('readPage', () => {
  it('pulls transactions unfiltered', async () => {
    const { transport, asked } = stub([transaction()]);

    const page = await readPage(transport, { kind: 'transactions', cursor: null, since: null });

    expect(at(asked, 0).path).toBe('/transaction');
    expect(at(asked, 0).query?.status).toBeUndefined();
    expect(page.records).toHaveLength(1);
    expect(at(page.records, 0).kind).toBe('transactions');
  });

  it('asks for failures with the documented status filter', async () => {
    const { transport, asked } = stub([transaction({ status: 'failed', paid_at: null })]);

    const page = await readPage(transport, { kind: 'failed_payments', cursor: null, since: null });

    expect(at(asked, 0).query?.status).toBe('failed');
    expect(at(page.records, 0).kind).toBe('failed_payments');
  });

  it('passes an incremental sync’s watermark through as `from`', async () => {
    const { transport, asked } = stub([]);

    await readPage(transport, {
      kind: 'transactions',
      cursor: null,
      since: new Date('2026-02-03T04:05:06.000Z'),
    });

    expect(at(asked, 0).query?.from).toBe('2026-02-03T04:05:06.000Z');
  });

  it('hands back a cursor while there is more', async () => {
    const full = Array.from({ length: PER_PAGE }, (_, i) => transaction({ id: 5000 + i }));
    const { transport } = stub(full);

    const page = await readPage(transport, { kind: 'transactions', cursor: null, since: null });
    expect(page.cursor).toBe('page:2');
  });

  it('stops at the end', async () => {
    const { transport } = stub([transaction()]);
    const page = await readPage(transport, { kind: 'transactions', cursor: null, since: null });
    expect(page.cursor).toBeNull();
  });

  /*
   * A kind this connector does not serve is a mismatch between two of our own
   * files. It finishes the sync empty rather than showing a customer an error
   * about a word they never typed.
   */
  it('returns nothing for a kind it does not serve, without calling out', async () => {
    const { transport, asked } = stub([transaction()]);

    const page = await readPage(transport, { kind: 'refunds', cursor: null, since: null });

    expect(page).toEqual({ records: [], cursor: null });
    expect(asked).toHaveLength(0);
  });
});

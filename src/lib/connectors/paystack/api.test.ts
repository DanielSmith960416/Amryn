import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProviderError } from '../provider';
import {
  cursorForPage,
  directTransport,
  envelope,
  fetchTransaction,
  listTransactions,
  pageFromCursor,
  parseBody,
  PAYSTACK_BASE_URL,
  PER_PAGE,
  quoteLongIntegers,
  readTransaction,
  type PaystackRequest,
} from './api';

/** A transaction shaped as the reference shows it, trimmed to what we read. */
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

function body(data: unknown, meta: unknown = null): unknown {
  return { status: true, message: 'Transactions retrieved', data, meta };
}

/** A transport that records what it was asked and replies with a fixture. */
function stub(replies: unknown[]): {
  transport: (request: PaystackRequest) => Promise<unknown>;
  asked: PaystackRequest[];
} {
  const asked: PaystackRequest[] = [];
  let next = 0;
  return {
    asked,
    transport: async (request) => {
      asked.push(request);
      return replies[Math.min(next++, replies.length - 1)];
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

/** The recorded fetch calls, typed once so three tests need not each cast. */
function calls(fetcher: typeof fetch): [string, RequestInit][] {
  return (fetcher as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
}

describe('envelope', () => {
  it('reads the documented shape', () => {
    const read = envelope({ status: true, message: 'ok', data: [1], meta: { perPage: 50 } });
    expect(read.ok).toBe(true);
    expect(read.message).toBe('ok');
    expect(read.data).toEqual([1]);
    expect(read.meta).toEqual({ perPage: 50 });
  });

  it('treats a false status as not ok rather than throwing', () => {
    expect(envelope({ status: false, message: 'no', data: null }).ok).toBe(false);
  });

  /*
   * `status` means three different things in this API — the envelope's
   * boolean, the HTTP code, and the transaction's own state. This is the test
   * that the envelope's one is read as a boolean and not as the string a
   * transaction carries.
   */
  it('does not mistake a transaction status for the envelope status', () => {
    expect(envelope({ status: 'success', data: [] }).ok).toBe(false);
  });

  it('refuses a body that is not an object', () => {
    expect(() => envelope('nope')).toThrow(ProviderError);
    expect(() => envelope(null)).toThrow(ProviderError);
  });
});

describe('long integer ids', () => {
  it('leaves ordinary ids alone', () => {
    expect(quoteLongIntegers('{"id":4013709635}')).toBe('{"id":4013709635}');
  });

  it('quotes an id long enough for a double to round it', () => {
    expect(quoteLongIntegers('{"id": 12345678901234567}')).toBe('{"id": "12345678901234567"}');
  });

  /*
   * The point of the whole exercise: parsed the ordinary way this id comes
   * back as a different number, with no error to notice.
   */
  it('survives a round trip that plain JSON.parse would not', () => {
    const text = '{"status":true,"data":{"id":12345678901234567}}';
    expect(String((JSON.parse(text) as { data: { id: number } }).data.id)).not.toBe(
      '12345678901234567',
    );

    const parsed = parseBody(text) as { data: { id: string } };
    expect(parsed.data.id).toBe('12345678901234567');
  });

  it('reports unreadable JSON as retryable rather than crashing', () => {
    expect(() => parseBody('{')).toThrow(ProviderError);
    try {
      parseBody('{');
    } catch (error) {
      expect((error as ProviderError).retryable).toBe(true);
    }
  });
});

describe('readTransaction', () => {
  it('reads the documented fields', () => {
    const read = readTransaction(transaction());
    expect(read.id).toBe('4013709635');
    expect(read.reference).toBe('rXXXXXXXXXXXXXX');
    expect(read.status).toBe('success');
    expect(read.amountMinor).toBe(400000);
    expect(read.currency).toBe('ZAR');
    expect(read.channel).toBe('card');
    expect(read.feesMinor).toBe(12000);
    expect(read.customerEmail).toBe('buyer@example.invalid');
    expect(read.customerCode).toBe('CUS_xxxxx');
  });

  it('keeps the amount in the subunit it arrived in', () => {
    expect(readTransaction(transaction({ amount: 400000 })).amountMinor).toBe(400000);
  });

  it('keeps the provider payload intact for whoever maps it', () => {
    const read = readTransaction(transaction({ authorization: { bin: '408408' } }));
    expect((read.raw.authorization as { bin: string }).bin).toBe('408408');
  });

  it('takes a missing optional field as a null, not a failure', () => {
    const read = readTransaction(transaction({ channel: null, fees: null, paid_at: null }));
    expect(read.channel).toBeNull();
    expect(read.feesMinor).toBeNull();
    expect(read.paidAt).toBeNull();
  });

  it('survives a transaction with no customer object', () => {
    const read = readTransaction(transaction({ customer: null }));
    expect(read.customerEmail).toBeNull();
    expect(read.customerCode).toBeNull();
  });

  /*
   * An id is the one field that cannot be defaulted: without it the next sync
   * inserts the same payment again instead of updating it.
   */
  it('refuses a transaction with no identifier', () => {
    expect(() => readTransaction(transaction({ id: null }))).toThrow(ProviderError);
  });
});

describe('cursors', () => {
  it('starts at the first page', () => {
    expect(pageFromCursor(null)).toBe(1);
    expect(pageFromCursor('')).toBe(1);
  });

  it('round trips', () => {
    expect(pageFromCursor(cursorForPage(7))).toBe(7);
  });

  it('refuses a cursor it did not issue', () => {
    expect(() => pageFromCursor('dW5kZWZpbmVkOjQwMTM3MDk2MzU=')).toThrow(ProviderError);
    expect(() => pageFromCursor('page:0')).toThrow(ProviderError);
    expect(() => pageFromCursor('page:nope')).toThrow(ProviderError);
  });
});

describe('listTransactions', () => {
  it('asks the documented endpoint with the documented parameters', async () => {
    const { transport, asked } = stub([body([transaction()])]);

    await listTransactions(transport, {
      since: new Date('2026-01-01T00:00:00.000Z'),
      status: 'failed',
    });

    expect(at(asked, 0).path).toBe('/transaction');
    expect(at(asked, 0).query).toMatchObject({
      perPage: PER_PAGE,
      page: 1,
      status: 'failed',
      from: '2026-01-01T00:00:00.000Z',
    });
  });

  it('omits the filters it was not given', async () => {
    const { transport, asked } = stub([body([])]);
    await listTransactions(transport);
    expect(at(asked, 0).query?.status).toBeUndefined();
    expect(at(asked, 0).query?.from).toBeUndefined();
  });

  it('ends the walk on a short page', async () => {
    const { transport } = stub([body([transaction()])]);
    expect((await listTransactions(transport)).cursor).toBeNull();
  });

  it('offers the next page when the page came back full', async () => {
    const full = Array.from({ length: PER_PAGE }, (_, i) => transaction({ id: 1000 + i }));
    const { transport } = stub([body(full)]);

    const page = await listTransactions(transport);
    expect(page.transactions).toHaveLength(PER_PAGE);
    expect(page.cursor).toBe(cursorForPage(2));
  });

  it('resumes where a cursor says', async () => {
    const { transport, asked } = stub([body([])]);
    await listTransactions(transport, { cursor: cursorForPage(4) });
    expect(at(asked, 0).query?.page).toBe(4);
  });

  it('refuses a response whose data is not a list', async () => {
    const { transport } = stub([body({ id: 1 })]);
    await expect(listTransactions(transport)).rejects.toThrow(ProviderError);
  });

  it('refuses a response the gateway marked unsuccessful', async () => {
    const { transport } = stub([{ status: false, message: 'nope', data: [] }]);
    await expect(listTransactions(transport)).rejects.toThrow(ProviderError);
  });
});

describe('fetchTransaction', () => {
  it('asks for one by id and escapes it', async () => {
    const { transport, asked } = stub([body(transaction())]);
    const read = await fetchTransaction(transport, 'a/b');
    expect(at(asked, 0).path).toBe('/transaction/a%2Fb');
    expect(read.id).toBe('4013709635');
  });
});

describe('directTransport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respond(status: number, payload: unknown): typeof fetch {
    return vi.fn(async () =>
      new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), { status }),
    ) as unknown as typeof fetch;
  }

  it('sends the key as a bearer header against the documented base URL', async () => {
    const fetcher = respond(200, body([]));
    vi.stubGlobal('fetch', fetcher);

    await directTransport('sk_test_example')({ path: '/transaction', query: { page: 2 } });

    const [target, init] = at(calls(fetcher), 0);
    expect(target).toBe(`${PAYSTACK_BASE_URL}/transaction?page=2`);
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_example');
  });

  /*
   * A key in a query string is a key in a request log, at Paystack's end and
   * at every proxy in between.
   */
  it('never puts the key in the URL', async () => {
    const fetcher = respond(200, body([]));
    vi.stubGlobal('fetch', fetcher);

    await directTransport('sk_test_secret')({ path: '/transaction' });

    const [target] = at(calls(fetcher), 0);
    expect(target).not.toContain('sk_test_secret');
  });

  it('drops parameters it was not given a value for', async () => {
    const fetcher = respond(200, body([]));
    vi.stubGlobal('fetch', fetcher);

    await directTransport('k')({ path: '/transaction', query: { page: 1, status: undefined } });

    const [target] = at(calls(fetcher), 0);
    expect(target).toBe(`${PAYSTACK_BASE_URL}/transaction?page=1`);
  });

  it('refuses a blank key before spending a request on it', async () => {
    const fetcher = respond(200, body([]));
    vi.stubGlobal('fetch', fetcher);

    await expect(directTransport('   ')({ path: '/transaction' })).rejects.toThrow(ProviderError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('calls a rejected key the customer’s to fix, not ours to retry', async () => {
    vi.stubGlobal('fetch', respond(401, { status: false }));
    await expect(directTransport('k')({ path: '/transaction' })).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('backs off rather than hammering a rate limit', async () => {
    vi.stubGlobal('fetch', respond(429, { status: false }));
    await expect(directTransport('k')({ path: '/transaction' })).rejects.toMatchObject({
      retryable: true,
    });
  });

  it('lets the gateway’s own trouble pass', async () => {
    vi.stubGlobal('fetch', respond(503, { status: false }));
    await expect(directTransport('k')({ path: '/transaction' })).rejects.toMatchObject({
      retryable: true,
    });
  });

  it('treats an unreachable gateway as worth another try', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      }),
    );
    await expect(directTransport('k')({ path: '/transaction' })).rejects.toMatchObject({
      retryable: true,
    });
  });

  /*
   * A gateway's error body can name another customer's reference, and a
   * ProviderError message is shown to whoever pressed the button.
   */
  it('keeps the gateway’s response body out of the message it shows', async () => {
    vi.stubGlobal('fetch', respond(400, { message: 'reference rXXXX belongs to CUS_other' }));

    try {
      await directTransport('k')({ path: '/transaction' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).not.toContain('CUS_other');
    }
  });
});

/*
 * The structural half of "read-only".
 *
 * A Paystack secret key can initialise a transaction, charge a stored
 * authorisation and take a partial debit. Amryn promises not to, and a promise
 * in a comment is worth less than a test: this fails if anybody adds a method,
 * a body or a write path to the file.
 */
describe('the client cannot move money', () => {
  const source = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');

  it('issues no method other than GET', () => {
    const methods = [...source.matchAll(/method:\s*'([A-Z]+)'/g)].map((m) => m[1]);
    expect([...new Set(methods)]).toEqual(['GET']);
  });

  it('sends no request body', () => {
    // An init member, not a parameter named `body` — hence the line anchor.
    expect(source).not.toMatch(/^\s*body\s*:/m);
  });

  it('names none of the endpoints that take money', () => {
    for (const path of ['/transaction/initialize', 'charge_authorization', 'partial_debit']) {
      const mentions = source.split(path).length - 1;
      // The header explains why they are refused; it may name them once each.
      expect(mentions, path).toBeLessThanOrEqual(1);
    }
  });
});

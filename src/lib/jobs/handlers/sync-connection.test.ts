import { describe, expect, it, vi } from 'vitest';

import type { FetchPage, FetchRequest, ConnectorProvider } from '@/lib/connectors/provider';
import { credentialStore, storeRecord, syncOneKind } from './sync-connection';

/** A recorder standing in for the worker's connection. */
function db(answers: Record<string, unknown[]> = {}) {
  const seen: { sql: string; values: readonly unknown[] }[] = [];
  const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
    seen.push({ sql, values });
    const key = Object.keys(answers).find((needle) => sql.includes(needle));
    return (key ? answers[key] : []) as never[];
  });
  return { seen, query, find: (needle: string) => seen.filter((q) => q.sql.includes(needle)) };
}

const connection = {
  id: 'conn-1',
  credential_ref: 'ref-1',
  data_source_id: 'source-1',
  provider: 'paystack',
};

function record(overrides: Record<string, unknown> = {}) {
  return {
    externalId: '4013709635',
    kind: 'transactions',
    attributes: {
      status: 'success',
      amount_minor: 400000,
      currency: 'ZAR',
      channel: 'card',
      reference: 'rXXXX',
      paid_at: '2026-08-11T09:12:00.000Z',
      created_at: '2026-08-11T09:11:40.000Z',
      ...overrides,
    },
    updatedAt: '2026-08-11T09:12:00.000Z',
  };
}

/** A provider that hands back fixed pages and remembers what it was asked. */
function gateway(pages: FetchPage[]): ConnectorProvider & { asked: FetchRequest[] } {
  const asked: FetchRequest[] = [];
  let next = 0;
  return {
    id: 'paystack',
    asked,
    invite: async () => ({ url: '/x', expiresAt: null }),
    adopt: async () => ({ credentialRef: 'ref-1' }),
    revoke: async () => {},
    fetch: async (request) => {
      asked.push(request);
      return pages[Math.min(next++, pages.length - 1)]!;
    },
  };
}

describe('the credential store on the worker', () => {
  it('exchanges a handle for a key through the one function granted to it', async () => {
    const { query, find } = db({ connection_credential: [{ secret: 'sk_test_x' }] });

    expect(await credentialStore(query).read('ref-1')).toBe('sk_test_x');
    expect(find('connection_credential')[0]!.values).toEqual(['ref-1']);
  });

  it('returns null for a handle that resolves to nothing', async () => {
    const { query } = db({ connection_credential: [] });
    expect(await credentialStore(query).read('ref-gone')).toBeNull();
  });
});

describe('storing one record', () => {
  it('writes a successful payment as income', async () => {
    const { query, find } = db();

    expect(
      await storeRecord({ record: record(), connection, organisationId: 'org-1', query }),
    ).toBe(true);

    const insert = find('financial_records')[0]!;
    expect(insert.sql).toContain('on conflict');
    expect(insert.values).toEqual([
      'org-1',
      '2026-08-11',
      'card',
      400000,
      'ZAR',
      'rXXXX',
      '4013709635',
      'source-1',
      'conn-1',
    ]);
  });

  /*
   * The one that would quietly inflate somebody's revenue. A payment that did
   * not go through is not income, and there is nowhere honest to put it yet.
   */
  it('refuses to write a payment that did not succeed', async () => {
    const { query, find } = db();

    const written = await storeRecord({
      record: record({ status: 'failed' }),
      connection,
      organisationId: 'org-1',
      query,
    });

    expect(written).toBe(false);
    expect(find('financial_records')).toHaveLength(0);
  });

  it('and an abandoned one', async () => {
    const { query } = db();
    expect(
      await storeRecord({
        record: record({ status: 'abandoned' }),
        connection,
        organisationId: 'org-1',
        query,
      }),
    ).toBe(false);
  });

  it('carries the subunit across unchanged rather than converting it', async () => {
    const { query, find } = db();
    await storeRecord({
      record: record({ amount_minor: 1 }),
      connection,
      organisationId: 'org-1',
      query,
    });
    expect(find('financial_records')[0]!.values[3]).toBe(1);
  });

  it('dates a payment by when it was paid', async () => {
    const { query, find } = db();
    await storeRecord({
      record: record({ paid_at: '2026-01-02T00:00:00.000Z', created_at: '2025-12-31T00:00:00.000Z' }),
      connection,
      organisationId: 'org-1',
      query,
    });
    expect(find('financial_records')[0]!.values[1]).toBe('2026-01-02');
  });

  it('falls back to when it was created', async () => {
    const { query, find } = db();
    await storeRecord({
      record: record({ paid_at: null, created_at: '2025-12-31T00:00:00.000Z' }),
      connection,
      organisationId: 'org-1',
      query,
    });
    expect(find('financial_records')[0]!.values[1]).toBe('2025-12-31');
  });

  /*
   * A gateway returning a record without the fields a financial row cannot be
   * without is a thing that happens. Losing the rest of the page over it would
   * be worse than skipping it.
   */
  it('skips a record with no amount rather than failing the page', async () => {
    const { query } = db();
    expect(
      await storeRecord({
        record: record({ amount_minor: null }),
        connection,
        organisationId: 'org-1',
        query,
      }),
    ).toBe(false);
  });

  it('skips one with no date at all', async () => {
    const { query } = db();
    const orphan = { ...record({ paid_at: null, created_at: null }), updatedAt: undefined };
    expect(
      await storeRecord({ record: orphan, connection, organisationId: 'org-1', query }),
    ).toBe(false);
  });

  it('defaults a missing currency rather than writing a bad code', async () => {
    const { query, find } = db();
    await storeRecord({
      record: record({ currency: 'rand' }),
      connection,
      organisationId: 'org-1',
      query,
    });
    // Null, so the statement's coalesce supplies the default.
    expect(find('financial_records')[0]!.values[4]).toBeNull();
  });
});

describe('walking one kind', () => {
  const base = {
    kind: 'transactions',
    connection,
    organisationId: 'org-1',
    startedAt: new Date('2026-09-11T10:00:00.000Z'),
    keepAlive: async () => true,
    log: () => {},
  };

  it('walks until the provider says there is no more', async () => {
    const provider = gateway([
      { records: [record()], cursor: 'page:2' },
      { records: [record()], cursor: null },
    ]);
    const { query } = db();

    const outcome = await syncOneKind({ ...base, provider, query });

    expect(provider.asked).toHaveLength(2);
    expect(outcome.unfinished).toBe(false);
  });

  it('resumes from the cursor it was left', async () => {
    const provider = gateway([{ records: [], cursor: null }]);
    const { query } = db({ 'insert into public.data_connection_syncs': [{ cursor: 'page:7', watermark: null }] });

    await syncOneKind({ ...base, provider, query });

    expect(provider.asked[0]!.cursor).toBe('page:7');
  });

  it('asks only for what changed since the last finished run', async () => {
    const provider = gateway([{ records: [], cursor: null }]);
    const { query } = db({
      'insert into public.data_connection_syncs': [
        { cursor: null, watermark: '2026-09-01T00:00:00.000Z' },
      ],
    });

    await syncOneKind({ ...base, provider, query });

    expect(provider.asked[0]!.since?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('saves the cursor after every page, not at the end', async () => {
    const provider = gateway([
      { records: [], cursor: 'page:2' },
      { records: [], cursor: 'page:3' },
      { records: [], cursor: null },
    ]);
    const { query, find } = db();

    await syncOneKind({ ...base, provider, query });

    const saves = find('set cursor = $3');
    expect(saves).toHaveLength(3);
    expect(saves[0]!.values[2]).toBe('page:2');
  });

  /*
   * The watermark is the whole reason an interrupted run is safe. Moving it on
   * a walk that did not finish means the next run asks for changes since a
   * moment it never reached, and everything between is lost — silently, with
   * both runs reporting success.
   */
  it('moves the watermark only when the walk actually finished', async () => {
    const provider = gateway([{ records: [], cursor: null }]);
    const { query, find } = db();

    await syncOneKind({ ...base, provider, query });

    const marks = find('set watermark');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.values[2]).toBe('2026-09-11T10:00:00.000Z');
  });

  it('leaves it alone when the lease is lost part way', async () => {
    const provider = gateway([{ records: [], cursor: 'page:2' }]);
    const { query, find } = db();

    const outcome = await syncOneKind({
      ...base,
      provider,
      query,
      keepAlive: vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false),
    });

    expect(outcome.unfinished).toBe(true);
    expect(find('set watermark')).toHaveLength(0);
  });

  /*
   * Checked before the request rather than after: finding out the lease lapsed
   * once the page is already in hand means two workers have both spent a
   * request against a rate-limited gateway.
   */
  it('checks the lease before spending a request', async () => {
    const provider = gateway([{ records: [], cursor: null }]);
    const { query } = db();

    await syncOneKind({ ...base, provider, query, keepAlive: async () => false });

    expect(provider.asked).toHaveLength(0);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The self-setup path opens a real database connection using a string that
 * contains the database password. These cover the two ways that leaks: an
 * error message quoting what it failed to connect to, and the value reaching a
 * browser bundle.
 *
 * `server-only` throws when imported outside a server context, so it is stubbed
 * for the test — the guard it enforces at build time is not what is under test
 * here.
 */
vi.mock('server-only', () => ({}));

const { databaseUrl, looksLikePooler, safeMessage, EXPECTED } = await import('./setup');

const SECRET = 'postgres://postgres.abcdefgh:s3cr3t-Pa55word@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

afterEach(() => {
  delete process.env.SUPABASE_DB_URL;
});

describe('databaseUrl', () => {
  it('reads the setting, trimmed', () => {
    process.env.SUPABASE_DB_URL = `  ${SECRET}  `;
    expect(databaseUrl()).toBe(SECRET);
  });

  it('treats empty as unset, as every other setting here does', () => {
    process.env.SUPABASE_DB_URL = '   ';
    expect(databaseUrl()).toBeUndefined();
  });

  it('refuses to be read in a browser', () => {
    // The value holds the database password. A stray import into a client
    // component should be a loud failure, not a quiet inclusion in the bundle.
    vi.stubGlobal('window', {});
    expect(() => databaseUrl()).toThrow(/never be called in the browser/);
    vi.unstubAllGlobals();
  });
});

describe('safeMessage', () => {
  it('never returns the connection string it was given', () => {
    process.env.SUPABASE_DB_URL = SECRET;
    const message = safeMessage(new Error(`connection to ${SECRET} failed: timeout`));
    expect(message).not.toContain(SECRET);
    expect(message).not.toContain('s3cr3t-Pa55word');
    expect(message).toContain('the configured connection string');
    // The useful half survives.
    expect(message).toContain('timeout');
  });

  it('redacts a connection string even when it is not the configured one', () => {
    // Drivers quote whatever they were handed, which after a typo need not be
    // the value this process knows about.
    const message = safeMessage(new Error('could not connect to postgresql://someone:hunter2@host/db'));
    expect(message).not.toContain('hunter2');
  });

  it('passes through a message with no credentials in it', () => {
    expect(safeMessage(new Error('relation "public.permissions" does not exist'))).toBe(
      'relation "public.permissions" does not exist',
    );
  });

  it('handles a thrown non-Error without failing', () => {
    expect(safeMessage('something odd')).toBe('something odd');
  });
});

describe('looksLikePooler', () => {
  it('recognises the pooler host, which is the one that routes from a deployment', () => {
    expect(looksLikePooler(SECRET)).toBe(true);
  });

  it('flags the direct host, which resolves to IPv6 only', () => {
    expect(looksLikePooler('postgres://postgres:pw@db.abcdefgh.supabase.co:5432/postgres')).toBe(false);
  });
});

describe('EXPECTED', () => {
  /**
   * This test used to say `expect(EXPECTED.tables).toBe(49)`, with a comment
   * claiming it was asserted against the same figures verify-remote.sql
   * checks. It was not — the numbers had been copied across, so when the
   * schema grew to 56 tables both sides were edited in neither place and the
   * test went on passing while `ready` meant a schema two migrations old.
   *
   * So it reads the other file now. EXPECTED is generated from the
   * migrations; verify-remote.sql is maintained by hand against a live
   * database. Two independent accounts of the same schema, and the test fails
   * if they ever disagree — which is what the comment always claimed.
   */
  const verifyRemote = readFileSync(
    join(process.cwd(), 'supabase/tests/verify-remote.sql'),
    'utf8',
  );

  function expectationFor(item: string): number {
    const match = verifyRemote.match(
      new RegExp(`'${item}'[^\\n]*?,\\s*'(\\d+)'`, 'i'),
    );
    if (!match) throw new Error(`No '${item}' row found in verify-remote.sql`);
    return Number(match[1]);
  }

  it('agrees with verify-remote.sql about the number of tables', () => {
    expect(EXPECTED.tables).toBe(expectationFor('Tables'));
  });

  it('agrees with verify-remote.sql about the permission catalogue', () => {
    expect(EXPECTED.permissions).toBe(expectationFor('Permission catalogue'));
  });

  it('reads real figures out of that file, not zero from a failed match', () => {
    // Without this the two tests above pass against a parse that silently
    // found nothing — the failure mode of every regex written once and
    // trusted afterwards.
    expect(expectationFor('Tables')).toBeGreaterThan(0);
    expect(expectationFor('Permission catalogue')).toBeGreaterThan(0);
  });
});

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
  it('matches what the migrations actually build', () => {
    // Asserted against the same figures verify-remote.sql checks, so the two
    // cannot drift into disagreeing about what "ready" means. It earned its
    // place immediately: migration 11 added organisation_invitations, and this
    // is what noticed that "ready" still meant 45.
    expect(EXPECTED.tables).toBe(49);
    expect(EXPECTED.permissions).toBe(30);
  });
});

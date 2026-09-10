import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  countRows,
  databaseFingerprint,
  manifestProblems,
  MAX_AGE_HOURS,
} from './backup-manifest.mjs';

const SUPABASE = 'postgresql://postgres.abc:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';
// Written out rather than derived by replacing '/postgres' — that substring
// appears first inside 'postgresql://postgres.abc', so the naive replacement
// rewrites the scheme and leaves the database name alone, and the test passes
// while asserting nothing.
const SUPABASE_STAGING =
  'postgresql://postgres.abc:pw@aws-0-eu-west-1.pooler.supabase.com:6543/staging';
const SOCKET = 'postgresql://postgres:pw@/amryn_test?host=/var/tmp/sock&port=55432';

describe('databaseFingerprint', () => {
  it('identifies a database by host and name', () => {
    expect(databaseFingerprint(SUPABASE).label).toBe(
      'aws-0-eu-west-1.pooler.supabase.com/postgres',
    );
  });

  it('distinguishes two databases on the same host', () => {
    expect(databaseFingerprint(SUPABASE).digest).not.toBe(
      databaseFingerprint(SUPABASE_STAGING).digest,
    );
  });

  it('survives the socket form, which is not a valid WHATWG URL', () => {
    expect(databaseFingerprint(SOCKET).label).toBe('/var/tmp/sock/amryn_test');
  });

  it('does not fold the password in, so rotating it keeps old backups valid', () => {
    // Hashing the raw string would make every backup taken before a password
    // change look like a backup of a different database — and the guard would
    // refuse a perfectly good one with a message about the wrong database.
    const rotated = SOCKET.replace('pw', 'a-completely-new-password');
    expect(databaseFingerprint(rotated).digest).toBe(databaseFingerprint(SOCKET).digest);
    expect(databaseFingerprint(SUPABASE.replace(':pw@', ':other@')).digest).toBe(
      databaseFingerprint(SUPABASE).digest,
    );
  });

  it('never puts the password in the label either', () => {
    expect(databaseFingerprint(SUPABASE).label).not.toMatch(/pw/);
    expect(databaseFingerprint(SOCKET).label).not.toMatch(/pw/);
  });
});

describe('manifestProblems', () => {
  let dir;
  const now = new Date('2026-09-06T12:00:00Z');

  const write = (overrides = {}, dumpBody = 'PostgreSQL database dump complete\n') => {
    const dump = join(dir, 'dump.sql');
    writeFileSync(dump, dumpBody);
    const manifest = {
      takenAt: new Date(now.getTime() - 60_000).toISOString(),
      database: databaseFingerprint(SUPABASE).digest,
      databaseLabel: databaseFingerprint(SUPABASE).label,
      dump,
      bytes: Buffer.byteLength(dumpBody),
      sha256: createHash('sha256').update(dumpBody).digest('hex'),
      rows: { organisations: 3 },
      ...overrides,
    };
    const path = join(dir, 'm.json');
    writeFileSync(path, JSON.stringify(manifest));
    return path;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'amryn-manifest-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('accepts a fresh, intact backup of the same database', () => {
    expect(manifestProblems(write(), SUPABASE, now)).toEqual([]);
  });

  it('refuses when no manifest was given at all', () => {
    expect(manifestProblems(undefined, SUPABASE, now)).toEqual(['no manifest was given']);
  });

  it('refuses a path that is not there', () => {
    expect(manifestProblems(join(dir, 'nope.json'), SUPABASE, now)[0]).toMatch(/does not exist/);
  });

  it('refuses a backup of a different database', () => {
    const problems = manifestProblems(write(), SUPABASE_STAGING, now);
    expect(problems.join(' ')).toMatch(/not aws-0-eu-west-1.pooler.supabase.com\/staging/);
  });

  it('refuses one that is too old to be "before this migration"', () => {
    const stale = new Date(now.getTime() - (MAX_AGE_HOURS + 2) * 3_600_000).toISOString();
    expect(manifestProblems(write({ takenAt: stale }), SUPABASE, now).join(' ')).toMatch(
      /hours ago/,
    );
  });

  it('refuses one whose dump has been deleted', () => {
    // A manifest is a claim about a file. Somebody clearing disk space leaves
    // the claim behind, and a claim restores nothing.
    const path = write({ dump: join(dir, 'gone.sql') });
    expect(manifestProblems(path, SUPABASE, now).join(' ')).toMatch(/is not there/);
  });

  it('refuses one whose dump changed size', () => {
    expect(manifestProblems(write({ bytes: 999_999 }), SUPABASE, now).join(' ')).toMatch(
      /not the 999999 recorded/,
    );
  });

  it('refuses one whose dump fails its checksum', () => {
    const path = write({ sha256: 'f'.repeat(64) });
    expect(manifestProblems(path, SUPABASE, now).join(' ')).toMatch(/does not match its recorded checksum/);
  });

  it('reports every reason at once rather than the first', () => {
    const stale = new Date(now.getTime() - 100 * 3_600_000).toISOString();
    const path = write({ takenAt: stale, database: 'deadbeefdeadbeef' });
    expect(manifestProblems(path, SUPABASE, now).length).toBe(2);
  });

  it('refuses a file that is not a manifest', () => {
    const path = join(dir, 'junk.json');
    writeFileSync(path, 'not json at all');
    expect(manifestProblems(path, SUPABASE, now)[0]).toMatch(/not readable as a manifest/);
  });
});

describe('countRows', () => {
  /*
   * pg_dump's shape, reduced to the part that matters: a header, a body, and a
   * `\.` terminator on its own line.
   */
  const dump = (blocks) =>
    blocks
      .map(([table, rows]) => `COPY public.${table} (id, name) FROM stdin;\n${rows.map((r) => r).join('\n')}${rows.length ? '\n' : ''}\\.\n`)
      .join('\n');

  it('counts the rows a table captured', () => {
    const contents = dump([['organisations', ['1\tAcme', '2\tBeta', '3\tGamma']]]);
    expect(countRows(contents, 'organisations')).toBe(3);
  });

  /*
   * The regression. An empty table puts its terminator on the line straight
   * after the header, and a search starting past the header steps over it and
   * counts the next table's rows as this one's. Measured against a real dump,
   * an empty organisations table read as 39.
   *
   * It is the one count that has to be right: a dump of nothing is complete,
   * correctly checksummed, the right size and worthless, and this figure is
   * the only thing that says so.
   */
  it('counts an empty table as zero, not as the next table', () => {
    const contents = dump([
      ['organisations', []],
      ['financial_records', ['1\tone', '2\ttwo', '3\tthree', '4\tfour']],
    ]);
    expect(countRows(contents, 'organisations')).toBe(0);
    expect(countRows(contents, 'financial_records')).toBe(4);
  });

  it('counts every table as zero in a dump of an empty database', () => {
    const contents = dump([
      ['organisations', []],
      ['organisation_members', []],
      ['user_profiles', []],
    ]);
    for (const table of ['organisations', 'organisation_members', 'user_profiles']) {
      expect(countRows(contents, table)).toBe(0);
    }
  });

  /* A schema-only dump has no COPY block at all, which is zero rows, not a throw. */
  it('reports a table with no COPY block at all as zero', () => {
    expect(countRows('-- schema only\n', 'organisations')).toBe(0);
  });

  /* organisation_members must not be mistaken for organisations. */
  it('does not match a table whose name merely starts the same', () => {
    const contents = dump([['organisation_members', ['1\ta', '2\tb']]]);
    expect(countRows(contents, 'organisations')).toBe(0);
  });
});

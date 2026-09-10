import { describe, expect, it } from 'vitest';
import { compareCounts, dumpIsIntact, restoreVerdict } from './restore-rules.mjs';

/**
 * The failure these guard against is not a restore that errors — it is one
 * that succeeds and delivers an empty database. That looks healthy from every
 * angle except the arithmetic.
 */

describe('compareCounts', () => {
  it('finds nothing when the restore matches', () => {
    const counts = { organisations: 1, user_profiles: 2 };
    expect(compareCounts(counts, { ...counts })).toEqual([]);
  });

  it('catches the empty restore, which is the whole point', () => {
    // psql exits zero having created the schema and none of the rows. Every
    // other signal — file size, checksum, completion marker, exit code — says
    // this worked.
    const found = compareCounts(
      { organisations: 1, user_profiles: 2, financial_records: 4 },
      { organisations: 0, user_profiles: 0, financial_records: 0 },
    );
    expect(found).toHaveLength(3);
    expect(found.every((d) => d.found === 0)).toBe(true);
  });

  it('distinguishes an absent table from an empty one', () => {
    // Different faults: an empty table restored, versus a table the dump never
    // created. The second means the schema is wrong, not the data.
    const [absent] = compareCounts({ organisations: 1 }, {});
    expect(absent.found).toBeNull();

    const [empty] = compareCounts({ organisations: 1 }, { organisations: 0 });
    expect(empty.found).toBe(0);
  });

  it('reports every disagreement, not just the first', () => {
    const found = compareCounts(
      { a: 1, b: 2, c: 3 },
      { a: 1, b: 0, c: 99 },
    );
    expect(found.map((d) => d.table)).toEqual(['b', 'c']);
  });

  it('ignores tables the manifest never claimed', () => {
    // The manifest counts a chosen few. Complaining about the other thirty-six
    // would bury the four that matter.
    expect(compareCounts({ organisations: 1 }, { organisations: 1, job_runs: 812 })).toEqual([]);
  });

  it('notices a restore that gained rows', () => {
    // Restoring into a database that was not empty. The dump is innocent and
    // the result is still not a faithful copy.
    const [extra] = compareCounts({ organisations: 1 }, { organisations: 2 });
    expect(extra).toEqual({ table: 'organisations', expected: 1, found: 2 });
  });
});

describe('restoreVerdict', () => {
  it('passes a faithful restore and says what it checked', () => {
    const verdict = restoreVerdict({ organisations: 1, user_profiles: 2 }, { organisations: 1, user_profiles: 2 });
    expect(verdict.restored).toBe(true);
    expect(verdict.tables).toBe(2);
    expect(verdict.rows).toBe(3);
  });

  it('fails an empty manifest rather than passing it', () => {
    // "Nothing was claimed, so nothing is missing" is true and is exactly the
    // reasoning that lets a broken backup chain look green.
    const verdict = restoreVerdict({}, {});
    expect(verdict.restored).toBe(false);
    expect(verdict.detail).toMatch(/proves nothing/i);
  });

  it('names every table in the failure, so one run finds the whole fault', () => {
    const verdict = restoreVerdict({ organisations: 1, financial_records: 9 }, { organisations: 1 });
    expect(verdict.restored).toBe(false);
    expect(verdict.detail).toContain('financial_records');
    expect(verdict.detail).toContain('table absent');
  });

  it('passes a legitimately empty database when the backup was empty too', () => {
    // A fresh deployment. The restore is faithful; there was nothing to lose.
    const verdict = restoreVerdict({ organisations: 0 }, { organisations: 0 });
    expect(verdict.restored).toBe(true);
  });
});

describe('dumpIsIntact', () => {
  const good = { sha256: 'a'.repeat(64), bytes: 1000 };

  it('accepts a dump that matches its manifest', () => {
    expect(dumpIsIntact(good, { sha256: good.sha256, bytes: 1000 })).toEqual({ intact: true });
  });

  it('refuses a dump with no checksum recorded', () => {
    const verdict = dumpIsIntact({ bytes: 1000 }, { sha256: 'x', bytes: 1000 });
    expect(verdict.intact).toBe(false);
    expect(verdict.reason).toMatch(/no checksum/i);
  });

  it('catches a dump truncated by a full disk', () => {
    const verdict = dumpIsIntact(good, { sha256: 'b'.repeat(64), bytes: 400 });
    expect(verdict.intact).toBe(false);
    // Says the file is wrong, not that the database is.
    expect(verdict.reason).toMatch(/changed since it was written/i);
  });

  it('catches a size mismatch even where the checksum was somehow copied', () => {
    const verdict = dumpIsIntact(good, { sha256: good.sha256, bytes: 999 });
    expect(verdict.intact).toBe(false);
    expect(verdict.reason).toContain('999');
  });
});

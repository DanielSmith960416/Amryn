import { describe, expect, it } from 'vitest';
import { describeDrift, migrationName, migrationsBehind } from './schema-drift';

const A = '20260829090000_01_foundation.sql';
const B = '20260909210000_33_worker_heartbeat.sql';
const C = '20260909220000_34_schema_drift.sql';

describe('migrationsBehind', () => {
  it('is empty when the database has everything the build carries', () => {
    expect(migrationsBehind([A, B], [A, B])).toEqual([]);
  });

  it('names what the database has not recorded', () => {
    expect(migrationsBehind([A, B, C], [A])).toEqual([B, C]);
  });

  it('keeps the shipped order, so the first one missing is the first one named', () => {
    expect(migrationsBehind([A, B, C], [B])).toEqual([A, C]);
  });

  /*
   * A database ahead of the build is a rollback, not a fault this reports.
   * The worker's handlers all exist; the schema simply has more in it than
   * this build knows about, and migrations here are additive by rule. The
   * mismatch that matters in that direction is a stale handler list, which
   * missingHandlers already answers.
   */
  it('says nothing about migrations the database has and the build does not', () => {
    expect(migrationsBehind([A], [A, B, C])).toEqual([]);
  });

  it('treats a build with no migrations as nothing to be behind on', () => {
    expect(migrationsBehind([], [A, B])).toEqual([]);
  });

  it('reports everything when the ledger is empty', () => {
    expect(migrationsBehind([A, B], [])).toEqual([A, B]);
  });
});

describe('migrationName', () => {
  it('drops the sort prefix and the extension', () => {
    expect(migrationName(C)).toBe('34_schema_drift');
  });

  it('leaves a filename that does not follow the convention alone', () => {
    expect(migrationName('hotfix.sql')).toBe('hotfix');
  });

  it('does not mistake a digit inside the name for the prefix', () => {
    expect(migrationName('20260909210000_33_worker_heartbeat.sql')).toBe(
      '33_worker_heartbeat',
    );
  });
});

describe('describeDrift', () => {
  it('says so plainly when there is no drift', () => {
    expect(describeDrift([])).toBe(
      'The database has every migration this build carries.',
    );
  });

  it('names the one missing file, in the singular', () => {
    const said = describeDrift([C]);
    expect(said).toContain('missing 1 migration this build');
    expect(said).toContain('34_schema_drift');
    expect(said).not.toContain('migrations this build');
  });

  it('names them all while the list is short enough to read', () => {
    const said = describeDrift([A, B, C]);
    expect(said).toContain('missing 3 migrations');
    expect(said).toContain(
      '01_foundation, 33_worker_heartbeat, 34_schema_drift',
    );
    expect(said).not.toContain('more');
  });

  /*
   * Past a handful the names stop being the useful part and the count starts
   * being it. The count is always exact even when the list is not.
   */
  it('truncates a long list but keeps the count honest', () => {
    const many = Array.from(
      { length: 9 },
      (_, i) => `2026090922000${i}_4${i}_change.sql`,
    );
    const said = describeDrift(many);
    expect(said).toContain('missing 9 migrations');
    expect(said).toContain('and 5 more');
    expect(said).toContain('40_change');
    expect(said).not.toContain('48_change');
  });
});

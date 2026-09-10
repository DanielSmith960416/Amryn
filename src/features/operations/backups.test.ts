import { describe, expect, it } from 'vitest';
import {
  CRITICAL_AFTER_HOURS,
  STALE_AFTER_HOURS,
  backupHealth,
  capturedNothing,
  type BackupRecord,
} from './backups';

const NOW = new Date('2026-09-10T06:00:00Z');

function backup(hoursAgo: number, over: Partial<BackupRecord> = {}): BackupRecord {
  return {
    takenAt: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
    databaseLabel: 'db.example.supabase.co/postgres',
    bytes: 4 * 1024 * 1024,
    rows: { organisations: 1, organisation_members: 2, financial_records: 40, user_profiles: 2 },
    storedAt: '/backups/2026-09-10.sql',
    ...over,
  };
}

describe('backupHealth', () => {
  it('reports a backup taken this morning as fresh', () => {
    const health = backupHealth(backup(4), NOW);
    expect(health.state).toBe('fresh');
    expect(health.detail).toContain('4 hours ago');
  });

  /*
   * The state that matters most, and the one that is true right now: a
   * procedure that exists and has never been run looks identical to one that
   * runs nightly, until somebody needs it.
   */
  it('says never, rather than treating no backup as an old one', () => {
    const health = backupHealth(null, NOW);
    expect(health.state).toBe('never');
    expect(health.detail).toContain('nothing to restore from');
  });

  it('does not fire on a punctual daily routine read a little late', () => {
    expect(backupHealth(backup(25), NOW).state).toBe('fresh');
  });

  it('takes both thresholds exactly, so the boundaries are decided here', () => {
    expect(backupHealth(backup(STALE_AFTER_HOURS), NOW).state).toBe('fresh');
    expect(backupHealth(backup(STALE_AFTER_HOURS + 0.5), NOW).state).toBe('stale');
    expect(backupHealth(backup(CRITICAL_AFTER_HOURS), NOW).state).toBe('stale');
    expect(backupHealth(backup(CRITICAL_AFTER_HOURS + 1), NOW).state).toBe('critical');
  });

  it('counts a fortnight in days rather than hours, because 336 means nothing', () => {
    const health = backupHealth(backup(24 * 14), NOW);
    expect(health.state).toBe('critical');
    expect(health.detail).toContain('14 days');
    expect(health.detail).not.toContain('336');
  });

  it('names which database it is a backup of', () => {
    const health = backupHealth(backup(2, { databaseLabel: 'staging/postgres' }), NOW);
    expect(health.detail).toContain('staging/postgres');
  });

  /* A clock that disagrees must not read as a backup from the future. */
  it('treats a backup timestamped ahead of now as brand new', () => {
    const health = backupHealth(backup(-3), NOW);
    expect(health.state).toBe('fresh');
    expect(health.detail).toContain('0 hours');
  });
});

describe('capturedNothing', () => {
  /*
   * The other half of "a file of the right shape is not a backup". backup.mjs
   * already refuses a truncated dump; this catches a complete, correctly
   * checksummed dump of nothing.
   */
  it('is true when the dump captured no organisations', () => {
    expect(capturedNothing(backup(1, { rows: { organisations: 0, user_profiles: 3 } }))).toBe(true);
  });

  it('is true when the counts are missing entirely', () => {
    expect(capturedNothing(backup(1, { rows: {} }))).toBe(true);
  });

  it('is false once there is an organisation to lose', () => {
    expect(capturedNothing(backup(1, { rows: { organisations: 1 } }))).toBe(false);
  });

  /* Size is not evidence: a schema-only dump of a large schema is not small. */
  it('does not treat a large file as proof it captured anything', () => {
    const big = backup(1, { bytes: 90 * 1024 * 1024, rows: { organisations: 0 } });
    expect(capturedNothing(big)).toBe(true);
  });
});

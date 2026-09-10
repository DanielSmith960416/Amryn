import { describe, expect, it } from 'vitest';
import {
  KEEP_AT_LEAST,
  KEEP_DAYS,
  dumpsToPrune,
  takenAtFromName,
  type StoredDump,
} from './backup-retention';

const NOW = new Date('2026-09-10T06:00:00Z');

function dump(daysAgo: number): StoredDump {
  const at = new Date(NOW.getTime() - daysAgo * 24 * 3_600_000);
  return { name: `amryn-abc123-${at.toISOString().replace(/[:.]/g, '-')}.sql`, takenAt: at.toISOString() };
}

describe('dumpsToPrune', () => {
  it('keeps everything inside the window', () => {
    const files = [dump(1), dump(5), dump(13)];
    expect(dumpsToPrune(files, NOW)).toEqual([]);
  });

  it('removes what is past the window once the floor is satisfied', () => {
    const files = [dump(1), dump(2), dump(3), dump(40)];
    expect(dumpsToPrune(files, NOW).map((f) => f.takenAt)).toEqual([dump(40).takenAt]);
  });

  /*
   * The rule this module exists for. A volume holding one ancient dump holds
   * everything standing between the product and nothing, and deleting it for
   * being old would be the most destructive thing here — quietly, on a
   * schedule, with every other signal green.
   */
  it('never deletes the only backup, however old it is', () => {
    expect(dumpsToPrune([dump(500)], NOW)).toEqual([]);
  });

  it('keeps the newest few whatever their age, before age is consulted', () => {
    const ancient = [dump(300), dump(310), dump(320), dump(330), dump(340)];
    const pruned = dumpsToPrune(ancient, NOW);
    expect(pruned).toHaveLength(ancient.length - KEEP_AT_LEAST);
    // The three newest survive.
    expect(pruned.map((f) => f.takenAt)).not.toContain(dump(300).takenAt);
    expect(pruned.map((f) => f.takenAt)).not.toContain(dump(310).takenAt);
    expect(pruned.map((f) => f.takenAt)).not.toContain(dump(320).takenAt);
  });

  it('returns them oldest first, so a partial failure removes the least useful', () => {
    const pruned = dumpsToPrune([dump(1), dump(2), dump(3), dump(30), dump(60)], NOW);
    expect(pruned.map((f) => f.takenAt)).toEqual([dump(60).takenAt, dump(30).takenAt]);
  });

  it('takes the boundary exactly', () => {
    const files = [dump(1), dump(2), dump(3), dump(KEEP_DAYS)];
    expect(dumpsToPrune(files, NOW)).toEqual([]);
    expect(dumpsToPrune([dump(1), dump(2), dump(3), dump(KEEP_DAYS + 1)], NOW)).toHaveLength(1);
  });

  /* An unreadable name is a reason to leave a file alone, not to remove it. */
  it('never proposes deleting a file whose date it could not read', () => {
    const odd: StoredDump = { name: 'something-else.sql', takenAt: 'not a date' };
    expect(dumpsToPrune([odd, dump(1), dump(2), dump(3), dump(90)], NOW).map((f) => f.name)).not.toContain(
      'something-else.sql',
    );
  });

  it('does nothing with nothing', () => {
    expect(dumpsToPrune([], NOW)).toEqual([]);
  });
});

describe('takenAtFromName', () => {
  it('reads back the timestamp backup.mjs writes', () => {
    expect(takenAtFromName('amryn-6f22932b494c7b6e-2026-09-10T07-19-28-086Z.sql')).toBe(
      '2026-09-10T07:19:28.086Z',
    );
  });

  it('is null for anything else, so unknown files are left alone', () => {
    expect(takenAtFromName('notes.txt')).toBeNull();
    expect(takenAtFromName('amryn-abc.sql')).toBeNull();
    expect(takenAtFromName('amryn-abc-2026-09-10T07-19-28-086Z.sql.manifest.json')).toBeNull();
  });

  it('round-trips into a date the pruner can order by', () => {
    const iso = takenAtFromName('amryn-x-2026-01-02T03-04-05-006Z.sql');
    expect(iso).not.toBeNull();
    expect(new Date(iso!).getUTCFullYear()).toBe(2026);
  });
});

import { describe, expect, it } from 'vitest';
import { volumeHealth } from './volume';

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

const at = (freeGb: number, totalGb = 5) => ({
  path: '/backups',
  totalBytes: totalGb * GB,
  freeBytes: freeGb * GB,
});

describe('room for the next backup', () => {
  it('says nothing alarming when the worker has never reported', () => {
    // A worker on an older build writes no figure. Absent is not the same as
    // full, and reading it as full would put a red check on every deployment
    // the moment this ships.
    expect(volumeHealth(null, 4 * MB).state).toBe('unknown');
    expect(volumeHealth({ path: '/backups', totalBytes: 0, freeBytes: 0 }, null).state).toBe(
      'unknown',
    );
  });

  it('is content with plenty of room', () => {
    const health = volumeHealth(at(4), 4 * MB);
    expect(health.state).toBe('roomy');
    expect(health.detail).toContain('/backups');
  });

  it('counts the room in backups, not in percent', () => {
    // The sentence a person can act on. "62% used" is a number nobody does
    // anything about.
    expect(volumeHealth(at(4), 4 * MB).detail).toMatch(/room for about \d+ more backups/);
  });

  it('calls it tight when only a couple more dumps fit, however empty the disk looks', () => {
    // 55% free and room for two. A percentage threshold would call this
    // healthy, and the volume would fill in two nights.
    const health = volumeHealth({ path: '/backups', totalBytes: 100 * MB, freeBytes: 55 * MB }, 20 * MB);
    expect(health.state).toBe('tight');
    expect(health.detail).toContain('2 more backups');
  });

  it('calls it full when the next dump will not fit at all', () => {
    const health = volumeHealth({ path: '/backups', totalBytes: 100 * MB, freeBytes: 3 * MB }, 20 * MB);
    expect(health.state).toBe('full');
    expect(health.detail).toContain('does not fit');
  });

  it('still catches a volume filling with something that is not backups', () => {
    // No backup has ever been recorded, so there is no ratio to reason with —
    // and the disk is still nearly full.
    const health = volumeHealth(at(0.1), null);
    expect(health.state).toBe('full');
  });

  it('warns on a low fraction even when the dumps are tiny', () => {
    const health = volumeHealth(at(0.5), 1 * MB);
    expect(health.state).toBe('tight');
  });

  it('does not report more free than the volume holds', () => {
    // A nonsense reading should not produce a nonsense sentence. Clamped
    // rather than trusted, because this number crosses a process boundary.
    const health = volumeHealth({ path: '/backups', totalBytes: 1 * GB, freeBytes: 9 * GB }, null);
    expect(health.state).toBe('roomy');
    expect(health.detail).toContain('0 KB of 1.0 GB used');
  });
});

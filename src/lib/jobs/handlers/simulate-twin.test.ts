import { describe, expect, it } from 'vitest';
import { nightlySeed } from './simulate-twin';

const SCENARIO = 'b2000000-0000-4000-8000-000000000001';
const OTHER = 'b2000000-0000-4000-8000-000000000002';

describe('nightlySeed', () => {
  it('is the same for one scenario on one night', () => {
    // The promise this keeps: a retried job reports the same figure. Without
    // it a customer comparing this morning's number with yesterday's cannot
    // tell a changed business from a re-run.
    expect(nightlySeed(SCENARIO, '2026-09-07')).toBe(nightlySeed(SCENARIO, '2026-09-07'));
  });

  it('changes with the night, so tomorrow is a fresh draw', () => {
    expect(nightlySeed(SCENARIO, '2026-09-07')).not.toBe(nightlySeed(SCENARIO, '2026-09-08'));
  });

  it('differs between scenarios asked on the same night', () => {
    // Two questions about one business must not share a draw, or their
    // difference would partly be an artefact of the randomness rather than of
    // the levers.
    expect(nightlySeed(SCENARIO, '2026-09-07')).not.toBe(nightlySeed(OTHER, '2026-09-07'));
  });

  it('stays inside the range a seeded generator accepts', () => {
    for (const night of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      const seed = nightlySeed(SCENARIO, night);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
  });
});

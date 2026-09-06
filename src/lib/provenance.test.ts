import { describe, expect, it } from 'vitest';
import {
  PROVENANCE,
  PROVENANCE_FIRMNESS,
  PROVENANCE_LABEL,
  PROVENANCE_MEANING,
  isProvenance,
  needsRange,
  type Provenance,
} from './provenance';

describe('the provenance vocabulary', () => {
  it('covers every kind with a label and a meaning', () => {
    // A kind added to the enum and not here would render as blank beside a
    // number, which reads as the figure having no provenance at all.
    for (const kind of PROVENANCE) {
      expect(PROVENANCE_LABEL[kind], kind).toBeTruthy();
      expect(PROVENANCE_MEANING[kind].length, kind).toBeGreaterThan(20);
      expect(PROVENANCE_FIRMNESS[kind], kind).toBeTypeOf('number');
    }
  });

  it('uses plain words rather than the enum names', () => {
    // "Derived" is jargon on a page. The tag exists to tell a reader whether
    // to trust the number, which it cannot do in a word they have to decode.
    expect(PROVENANCE_LABEL.derived).toBe('Calculated');
    expect(PROVENANCE_LABEL.fact).toBe('Reported');
  });

  it('requires a range for exactly the uncertain kinds', () => {
    // The same rule migration 25 enforces. If these ever disagreed, a screen
    // would ask for a range the database does not hold, or omit one it does.
    expect(needsRange('estimated')).toBe(true);
    expect(needsRange('simulated')).toBe(true);
    expect(needsRange('fact')).toBe(false);
    expect(needsRange('derived')).toBe(false);
  });

  it('ranks a measurement above a calculation above a guess', () => {
    expect(PROVENANCE_FIRMNESS.fact).toBeGreaterThan(PROVENANCE_FIRMNESS.derived);
    expect(PROVENANCE_FIRMNESS.derived).toBeGreaterThan(PROVENANCE_FIRMNESS.simulated);
    expect(PROVENANCE_FIRMNESS.simulated).toBeGreaterThan(PROVENANCE_FIRMNESS.estimated);
  });

  it('recognises its own kinds and nothing else', () => {
    expect(isProvenance('estimated')).toBe(true);
    expect(isProvenance('guessed')).toBe(false);
    expect(isProvenance('')).toBe(false);
  });

  it('matches the database enum exactly', () => {
    // Both lists are short and the cost of them drifting is a row that cannot
    // be rendered, so this pins them together rather than trusting a comment.
    const fromDatabase: Provenance[] = ['fact', 'derived', 'estimated', 'simulated'];
    expect([...PROVENANCE].sort()).toEqual([...fromDatabase].sort());
  });
});

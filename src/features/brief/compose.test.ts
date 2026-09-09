import { describe, expect, it } from 'vitest';
import { MAX_ITEMS, compose, type Candidate, type Section } from './compose';

const SECTIONS: Section[] = ['yesterday', 'today', 'radar', 'open_items', 'trajectory'];

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    section: 'today',
    headline: 'Something happened',
    detail: 'And here is what it was.',
    impactCents: null,
    provenance: 'fact',
    sourceTable: 'ai_recommendations',
    sourceId: '11111111-1111-4111-8111-111111111111',
    ...over,
  };
}

describe('compose', () => {
  it('keeps at most five items however many are offered', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      candidate({ headline: `Item ${i}`, impactCents: i * 1000 }),
    );
    expect(compose(many, SECTIONS).items).toHaveLength(MAX_ITEMS);
  });

  it('ranks by absolute impact, so a shortfall is as loud as a gain', () => {
    const brief = compose(
      [
        candidate({ headline: 'Small gain', impactCents: 50_00 }),
        candidate({ headline: 'Large shortfall', impactCents: -400_000_00 }),
        candidate({ headline: 'Medium gain', impactCents: 9_000_00 }),
      ],
      SECTIONS,
    );

    expect(brief.items.map((i) => i.headline)).toEqual([
      'Large shortfall',
      'Medium gain',
      'Small gain',
    ]);
    expect(brief.items.map((i) => i.rank)).toEqual([1, 2, 3]);
  });

  it('lets a radar signal with no rand figure beat a trajectory item with none', () => {
    // Both score zero on money. Without section weight the order would be
    // whichever the caller happened to build first.
    const brief = compose(
      [
        candidate({ section: 'trajectory', headline: 'Goal on track', sourceTable: 'goals' }),
        candidate({ section: 'radar', headline: 'A competitor moved', sourceTable: 'market_signals' }),
      ],
      SECTIONS,
    );

    expect(brief.items[0]!.headline).toBe('A competitor moved');
  });

  it('is stable: the same candidates in a different order give the same brief', () => {
    const built = [
      candidate({ section: 'radar', headline: 'B', sourceTable: 'market_signals' }),
      candidate({ section: 'radar', headline: 'A', sourceTable: 'market_signals' }),
    ];
    const forwards = compose(built, SECTIONS).items.map((i) => i.headline);
    const backwards = compose([...built].reverse(), SECTIONS).items.map((i) => i.headline);
    expect(forwards).toEqual(backwards);
  });

  it('drops a simulated figure that names no fidelity measurement, and says so', () => {
    const brief = compose(
      [candidate({ section: 'yesterday', provenance: 'simulated', impactCents: 999_999_00 })],
      SECTIONS,
    );

    expect(brief.items).toHaveLength(0);
    expect(brief.empty.find((e) => e.section === 'yesterday')?.reason).toContain(
      'no accuracy measurement',
    );
  });

  it('keeps a simulated figure that does name one', () => {
    const brief = compose(
      [
        candidate({
          section: 'yesterday',
          provenance: 'simulated',
          fidelityId: '22222222-2222-4222-8222-222222222222',
        }),
      ],
      SECTIONS,
    );

    expect(brief.items).toHaveLength(1);
    expect(brief.items[0]!.provenance).toBe('simulated');
  });

  it('drops an item that cannot name its source', () => {
    const brief = compose([candidate({ sourceId: '' })], SECTIONS);
    expect(brief.items).toHaveLength(0);
    expect(brief.empty.find((e) => e.section === 'today')?.reason).toContain(
      'could not name the record',
    );
  });

  it('distinguishes a section with nothing to say from one that was crowded out', () => {
    const loud = Array.from({ length: 5 }, (_, i) =>
      candidate({ section: 'today', headline: `Loud ${i}`, impactCents: 1_000_000_00 }),
    );
    const quiet = candidate({
      section: 'trajectory',
      headline: 'Quiet',
      sourceTable: 'goals',
      impactCents: 1_00,
    });

    const brief = compose([...loud, quiet], SECTIONS);

    expect(brief.empty.find((e) => e.section === 'trajectory')?.reason).toContain('filled the brief');
    expect(brief.empty.find((e) => e.section === 'radar')?.reason).toBe('Nothing to report.');
  });

  it('reports every section that ran and produced nothing', () => {
    const brief = compose([], SECTIONS);
    expect(brief.items).toHaveLength(0);
    expect(brief.empty.map((e) => e.section).sort()).toEqual([...SECTIONS].sort());
  });

  it('says nothing about a section that was not run', () => {
    // A section nobody looked at must not be reported as one that found
    // nothing — that is the exact confusion empty_sections exists to prevent.
    const brief = compose([], ['today']);
    expect(brief.empty.map((e) => e.section)).toEqual(['today']);
  });

  it('numbers ranks from one with no gaps, because the database requires it', () => {
    const brief = compose(
      [
        candidate({ headline: 'A', impactCents: 300 }),
        candidate({ headline: 'B', impactCents: 200 }),
        candidate({ headline: 'C', impactCents: 100 }),
      ],
      SECTIONS,
    );
    expect(brief.items.map((i) => i.rank)).toEqual([1, 2, 3]);
  });
});

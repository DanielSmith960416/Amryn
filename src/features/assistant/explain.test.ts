import { describe, expect, it } from 'vitest';
import { explain, hasCaveats, type Chain } from './explain';

function chain(over: Partial<Chain> = {}): Chain {
  return {
    figure: {
      table: 'business_insights',
      id: '11111111-1111-4111-8111-111111111111',
      label: 'Gross margin is slipping in Polokwane',
      provenance: 'derived',
      isProvisional: false,
      range: null,
    },
    run: null,
    fidelity: null,
    citedFrom: null,
    ...over,
  };
}

const saysOf = (steps: ReturnType<typeof explain>) => steps.map((s) => s.says).join(' ');
const linksOf = (steps: ReturnType<typeof explain>) => steps.map((s) => s.link);

describe('explain', () => {
  it('always starts with where the figure came from', () => {
    expect(linksOf(explain(chain()))[0]).toBe('Where it came from');
  });

  it('distinguishes a recorded figure from a calculated one', () => {
    expect(saysOf(explain(chain({ figure: { ...chain().figure, provenance: 'fact' } })))).toContain(
      'a figure you recorded',
    );
    expect(saysOf(explain(chain()))).toContain('calculated from figures you gave');
  });

  it('marks an estimate as a caveat and a recorded fact as not', () => {
    const estimated = explain(chain({ figure: { ...chain().figure, provenance: 'estimated' } }));
    const fact = explain(chain({ figure: { ...chain().figure, provenance: 'fact' } }));
    expect(estimated[0]!.caveat).toBe(true);
    expect(fact[0]!.caveat).toBe(false);
  });

  it('says the middle of a range is not a prediction', () => {
    const steps = explain(
      chain({ figure: { ...chain().figure, provenance: 'estimated', range: { p10: 100_00, p50: 200_00, p90: 300_00 } } }),
    );
    expect(saysOf(steps)).toContain('R200');
    expect(saysOf(steps)).toContain('is the middle');
  });

  describe('a simulated figure', () => {
    const simulated = { ...chain().figure, provenance: 'simulated' as const };

    it('reports a measured accuracy as how wrong the model has been', () => {
      const steps = explain(
        chain({
          figure: simulated,
          fidelity: { id: 'f', status: 'measured', score: 92, monthsAvailable: 12, errorPct: 8.37 },
        }),
      );
      expect(saysOf(steps)).toContain('92/100');
      expect(saysOf(steps)).toContain('how wrong this model has been');
    });

    it('flags a poor accuracy score as a caveat and a good one as not', () => {
      const poor = explain(
        chain({
          figure: simulated,
          fidelity: { id: 'f', status: 'measured', score: 41, monthsAvailable: 9, errorPct: 59 },
        }),
      );
      const good = explain(
        chain({
          figure: simulated,
          fidelity: { id: 'f', status: 'measured', score: 92, monthsAvailable: 12, errorPct: 8.4 },
        }),
      );
      expect(poor.find((s) => s.link === 'How close the Twin gets')!.caveat).toBe(true);
      expect(good.find((s) => s.link === 'How close the Twin gets')!.caveat).toBe(false);
    });

    it('says plainly when accuracy cannot be measured yet', () => {
      const steps = explain(
        chain({
          figure: simulated,
          fidelity: { id: 'f', status: 'not_measurable', score: null, monthsAvailable: 2, errorPct: null },
        }),
      );
      expect(saysOf(steps)).toContain('Nobody can say yet');
      expect(saysOf(steps)).toContain('talking to itself');
    });

    it('shouts when the licence it was written under has gone', () => {
      // The database refuses a simulated figure with no measurement, so an
      // unresolved link means the measurement was deleted afterwards.
      const steps = explain(chain({ figure: simulated, fidelity: null }));
      expect(saysOf(steps)).toContain('no longer on record');
      expect(steps.find((s) => s.link === 'How close the Twin gets')!.caveat).toBe(true);
    });
  });

  it('explains provisional as fixed to the figure rather than recomputed', () => {
    const steps = explain(chain({ figure: { ...chain().figure, isProvisional: true } }));
    expect(saysOf(steps)).toContain('stays true even if the Imprint is finished tomorrow');
  });

  it('treats an unscored Imprint as counting against the figure', () => {
    const steps = explain(
      chain({
        run: {
          id: 'r', trigger: 'imprint.completed', qualityScore: null,
          isProvisional: true, expansionSuppressed: true, gaps: [], finishedAt: null,
        },
      }),
    );
    expect(saysOf(steps)).toContain('counts against it rather than for it');
    expect(steps.find((s) => s.link === 'The reading that produced it')!.caveat).toBe(true);
  });

  it('lists what the reading did not have, and says nothing was assumed', () => {
    const steps = explain(
      chain({
        run: {
          id: 'r', trigger: 'imprint.completed', qualityScore: 82,
          isProvisional: false, expansionSuppressed: false,
          gaps: ['averageOrderValue', 'repeatRate'], finishedAt: '2026-09-07T04:00:00Z',
        },
      }),
    );
    expect(saysOf(steps)).toContain('averageOrderValue, repeatRate');
    expect(saysOf(steps)).toContain('Nothing was assumed in their place');
  });

  it('says when a reading refused to discuss expansion', () => {
    const steps = explain(
      chain({
        run: {
          id: 'r', trigger: 'imprint.completed', qualityScore: 44,
          isProvisional: true, expansionSuppressed: true, gaps: [], finishedAt: '2026-09-07T04:00:00Z',
        },
      }),
    );
    expect(saysOf(steps)).toContain('refused to discuss expansion');
  });

  it('does not demand a reading for a figure somebody typed in', () => {
    const steps = explain(chain({ figure: { ...chain().figure, provenance: 'fact' } }));
    expect(linksOf(steps)).not.toContain('The reading that produced it');
  });

  it('says so when a calculated figure has no reading on record', () => {
    expect(saysOf(explain(chain()))).toContain('No reading is on record');
  });

  it('reports a citation that no longer resolves rather than glossing it', () => {
    const steps = explain(
      chain({ citedFrom: { table: 'ai_recommendations', id: 'x', resolved: false } }),
    );
    expect(saysOf(steps)).toContain('no longer there');
    expect(saysOf(steps)).toContain('cannot be checked against its source');
    expect(steps.find((s) => s.link === 'The record it cites')!.caveat).toBe(true);
  });

  it('names the cited record in the reader’s words, not the table’s', () => {
    const steps = explain(
      chain({ citedFrom: { table: 'market_signals', id: 'x', resolved: true } }),
    );
    expect(saysOf(steps)).toContain('a signal seen outside your business');
  });

  it('invents nothing when the whole chain is unresolved', () => {
    // Every step must be about what is known or explicitly unknown. Nothing
    // may assert a source the caller could not produce.
    const steps = explain(chain({ figure: { ...chain().figure, provenance: 'fact' } }));
    expect(steps).toHaveLength(1);
  });
});

describe('hasCaveats', () => {
  it('is false for a recorded figure with a clean reading', () => {
    const steps = explain(
      chain({
        figure: { ...chain().figure, provenance: 'fact' },
      }),
    );
    expect(hasCaveats(steps)).toBe(false);
  });

  it('is true the moment anything limits the figure', () => {
    const steps = explain(chain({ figure: { ...chain().figure, isProvisional: true } }));
    expect(hasCaveats(steps)).toBe(true);
  });
});

import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ScoredOpportunity } from '@/lib/intelligence/types';
import { OpportunityDial, blipsFor } from './opportunity-dial';

afterEach(cleanup);

function opportunity(over: Partial<ScoredOpportunity> = {}): ScoredOpportunity {
  return {
    id: 'OPP-1',
    date: '2026-09-17',
    title: 'Scale online storage bundles',
    category: 'Product',
    source: 'Amryn',
    estValue: 0,
    provenance: 'estimated',
    probability: 0.5,
    strategicFit: 0.5,
    urgency: 0.5,
    effort: 0.5,
    owner: '—',
    status: 'Evaluating',
    score: 50,
    rawScore: 50,
    atCeiling: false,
    classification: 'MEDIUM',
    ...over,
  } as ScoredOpportunity;
}

describe('where each blip sits', () => {
  it('puts the most urgent at the hub and the least at the rim', () => {
    const [urgent, patient] = blipsFor([
      opportunity({ id: 'A', urgency: 1 }),
      opportunity({ id: 'B', urgency: 0 }),
    ]);
    // Distance from the centre, which is what the caption promises the reader.
    expect(Math.hypot(urgent!.cx - 150, urgent!.cy - 150)).toBeCloseTo(18, 5);
    expect(Math.hypot(patient!.cx - 150, patient!.cy - 150)).toBeCloseTo(132, 5);
  });

  it('sizes the dot by revenue at stake', () => {
    const [big, small] = blipsFor([
      opportunity({ id: 'A', estValue: 1_000_000 }),
      opportunity({ id: 'B', estValue: 250_000 }),
    ]);
    expect(big!.r).toBeGreaterThan(small!.r);
    // Area, not radius, carries the value: a quarter of the money is half the
    // radius. A dot scaled linearly on value reads as four times the deal.
    expect(small!.r - 4).toBeCloseTo((big!.r - 4) / 2, 5);
  });

  /*
   * Northstar's first import produced exactly this: six opportunities, none of
   * them priced. Dividing by a maximum of nought would have put NaN into every
   * cx and collapsed the dial to an empty ring, which looks like no data at
   * all rather than like data without prices.
   */
  it('survives a workbook where nothing has been valued', () => {
    const blips = blipsFor([
      opportunity({ id: 'A', estValue: 0 }),
      opportunity({ id: 'B', estValue: 0 }),
    ]);
    for (const b of blips) {
      expect(Number.isFinite(b.cx)).toBe(true);
      expect(Number.isFinite(b.cy)).toBe(true);
      expect(b.r).toBeCloseTo(4, 5);
    }
  });
});

describe('when the sweep reaches each blip', () => {
  const many = blipsFor(Array.from({ length: 12 }, (_, i) => opportunity({ id: `O${i}` })));

  it('answers the first one as the revolution begins', () => {
    expect(many[0]!.ping).toBeCloseTo(0, 5);
  });

  /*
   * The golden angle passes a full turn at the third blip, so an unwrapped
   * fraction would give it a delay longer than the animation itself — and CSS
   * would hold that dot silent for a whole revolution before it ever answered.
   */
  it('wraps past a full turn rather than running off the end', () => {
    for (const b of many) {
      expect(b.ping).toBeGreaterThanOrEqual(0);
      expect(b.ping).toBeLessThan(1);
    }
    // The unwrapped figure for the fourth blip, to show the wrap is doing work
    // rather than being a no-op on angles that never exceed a turn.
    expect((3 * 2.39996) / (Math.PI * 2)).toBeGreaterThan(1);
  });

  it('follows the angle rather than the order of the list', () => {
    /*
     * The fourth blip has wrapped past twelve o'clock, so it sits closer to the
     * sweep's start than the second and third do and answers before both —
     * 0.15 of a revolution against 0.38 and 0.76. An index-based stagger would
     * make these three climb in order, which is the tell that the delays were
     * invented rather than read off the picture.
     */
    expect(many[3]!.ping).toBeLessThan(many[1]!.ping);
    expect(many[3]!.ping).toBeLessThan(many[2]!.ping);
    expect(many[1]!.ping).toBeLessThan(many[2]!.ping);
  });
});

describe('the dial as something to use', () => {
  const opportunities = [
    opportunity({ id: 'OPP-A', title: 'Scale online storage bundles', estValue: 120_000, score: 72, classification: 'HIGH' }),
    opportunity({ id: 'OPP-B', title: 'Improve Northside margin', estValue: 40_000, score: 38, classification: 'MONITOR' }),
  ];

  /*
   * The report this change answers came from a phone, where the old <title>
   * tooltip did nothing whatsoever. A link is the one control that works by
   * pointer, by thumb and by keyboard without three implementations.
   */
  it('makes every blip a link to its own entry', () => {
    render(<OpportunityDial opportunities={opportunities} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]!.getAttribute('href')).toBe('#opportunity-OPP-A');
    expect(links[1]!.getAttribute('href')).toBe('#opportunity-OPP-B');
  });

  it('names each one, with its figures, for anyone not looking at it', () => {
    render(<OpportunityDial opportunities={opportunities} />);
    expect(
      screen.getByRole('link', { name: /Scale online storage bundles.*R120,000.*72 of 100.*HIGH/ }),
    ).toBeTruthy();
  });

  it('reads out the opportunity under the pointer', () => {
    render(<OpportunityDial opportunities={opportunities} />);
    expect(screen.queryByText('R120,000')).toBeNull();

    fireEvent.pointerEnter(screen.getAllByRole('link')[0]!);
    expect(screen.getByText('R120,000')).toBeTruthy();
    expect(screen.getByText('Scale online storage bundles')).toBeTruthy();
  });

  // Same details on focus as on hover, or the keyboard route is a link to
  // somewhere with no way to know what is at the other end.
  it('reads out the same on keyboard focus', () => {
    render(<OpportunityDial opportunities={opportunities} />);
    fireEvent.focus(screen.getAllByRole('link')[1]!);
    expect(screen.getByText('Improve Northside margin')).toBeTruthy();
  });

  it('goes back to the key once the pointer leaves', () => {
    render(<OpportunityDial opportunities={opportunities} />);
    const first = screen.getAllByRole('link')[0]!;
    fireEvent.pointerEnter(first);
    fireEvent.pointerLeave(first);
    expect(screen.getByText(/Distance from centre/)).toBeTruthy();
  });

  /*
   * role="img" would have been the obvious label for a chart and would have
   * hidden all of the above from a screen reader, which is the failure this
   * change exists to fix.
   */
  it('does not present itself as a flat picture', () => {
    const { container } = render(<OpportunityDial opportunities={opportunities} />);
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('group');
  });

  it('draws nothing but the rings when there is nothing to show', () => {
    render(<OpportunityDial opportunities={[]} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText(/Distance from centre/)).toBeTruthy();
  });
});

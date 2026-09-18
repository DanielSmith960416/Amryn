import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { HealthComponent, HealthScore } from '@/lib/intelligence/types';
import { HealthExplorer, segmentsFor } from './health-explorer';

afterEach(cleanup);

function part(
  component: string,
  weight: number,
  rawScore: number,
  derived = true,
  description = 'What this measures.',
): HealthComponent {
  return { component, weight, rawScore, weightedScore: rawScore * weight, derived, description };
}

const components = [
  part('Financial Health', 0.25, 82),
  part('Operational Health', 0.2, 68, false, 'Delivery, utilisation and returns.'),
  part('Strategic Health', 0.1, 59, false, 'Progress against the objectives on record.'),
];

const health: HealthScore = {
  components,
  overall: components.reduce((sum, c) => sum + c.weightedScore, 0),
  status: 'HEALTHY',
};

describe('where each component sits on the ring', () => {
  const segments = segmentsFor(components);

  it('lays the arcs end to end, so together they are the filled arc', () => {
    expect(segments[0]!.offset).toBe(0);
    expect(segments[1]!.offset).toBeCloseTo(segments[0]!.length, 10);
    expect(segments[2]!.offset).toBeCloseTo(segments[0]!.length + segments[1]!.length, 10);
  });

  it('gives each component an arc in proportion to what it contributes', () => {
    // Financial contributes 20.5 points and Strategic 5.9 — near enough
    // three and a half times the arc.
    expect(segments[0]!.length / segments[2]!.length).toBeCloseTo(
      components[0]!.weightedScore / components[2]!.weightedScore,
      6,
    );
  });

  /*
   * The whole point of the ring: the arcs have to add up to the dial, or the
   * picture says the score is made of something other than these components.
   */
  it('spans exactly the score, no more and no less', () => {
    const circumference = 2 * Math.PI * 52;
    const total = segments.reduce((sum, s) => sum + s.length, 0);
    expect(total).toBeCloseTo((health.overall / 100) * circumference, 6);
  });

  it('does not let a negative component eat into its neighbour', () => {
    // A component cannot contribute less than nothing to a total, and an arc
    // of negative length would silently shift every arc after it.
    const withNegative = segmentsFor([part('Odd', 0.2, -30)]);
    expect(withNegative[0]!.length).toBe(0);
  });
});

describe('the dial and the list, linked', () => {
  it('shows the whole score until a component is singled out', () => {
    render(<HealthExplorer health={health} />);
    expect(screen.getByText('/100')).toBeTruthy();
    expect(screen.getByText('HEALTHY')).toBeTruthy();
  });

  /*
   * The number that was missing. The list showed "82 × 25%" and never the
   * product, so eight raw scores appeared to have nothing to do with the
   * total above them.
   */
  it('states the multiplication for the component being pointed at', () => {
    render(<HealthExplorer health={health} />);
    expect(screen.queryByText(/= 20\.5/)).toBeNull();
    fireEvent.pointerEnter(screen.getAllByRole('listitem')[0]!);
    expect(screen.getByText(/= 20\.5/)).toBeTruthy();
  });

  it('turns the centre into that component’s contribution', () => {
    render(<HealthExplorer health={health} />);
    fireEvent.pointerEnter(screen.getAllByRole('listitem')[0]!);
    expect(screen.getByText('20.5')).toBeTruthy();
    expect(screen.getByText('points')).toBeTruthy();
    // The status badge is about the whole score, so it gives way.
    expect(screen.queryByText('HEALTHY')).toBeNull();
  });

  it('says what the component measures, in the model’s own words', () => {
    render(<HealthExplorer health={health} />);
    fireEvent.pointerEnter(screen.getAllByRole('listitem')[1]!);
    expect(screen.getByText('Delivery, utilisation and returns.')).toBeTruthy();
  });

  it('goes back to the whole score once the pointer leaves', () => {
    render(<HealthExplorer health={health} />);
    const row = screen.getAllByRole('listitem')[0]!;
    fireEvent.pointerEnter(row);
    fireEvent.pointerLeave(row);
    expect(screen.getByText('/100')).toBeTruthy();
    expect(screen.getByText('HEALTHY')).toBeTruthy();
  });

  // The list is the only route to any of this without a pointer.
  it('does the same on keyboard focus', () => {
    render(<HealthExplorer health={health} />);
    fireEvent.focus(screen.getAllByRole('button')[2]!);
    expect(screen.getByText(/= 5\.9/)).toBeTruthy();
  });

  it('names each component and its arithmetic for a screen reader', () => {
    render(<HealthExplorer health={health} />);
    expect(
      screen.getByRole('button', {
        name: /Financial Health: 82 of 100, weighted 25%, contributing 20\.5 points/,
      }),
    ).toBeTruthy();
  });

  it('still marks a component whose figure is assumed rather than measured', () => {
    render(<HealthExplorer health={health} />);
    expect(screen.getAllByText('assumed')).toHaveLength(2);
  });
});

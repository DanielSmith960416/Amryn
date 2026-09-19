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

  /*
   * The ring itself, which for a day was a picture of the interaction rather
   * than part of it: the rows responded and the arcs did not, while the file's
   * own comment claimed both did.
   */
  it('answers when the ring is pointed at, not only the list', () => {
    const { container } = render(<HealthExplorer health={health} />);
    const arc = container.querySelector('[data-segment="Financial Health"]')!;
    expect(arc).toBeTruthy();

    fireEvent.pointerEnter(arc);
    expect(screen.getByText('20.5')).toBeTruthy();
    expect(screen.getByText('points')).toBeTruthy();

    fireEvent.pointerLeave(arc);
    expect(screen.getByText('/100')).toBeTruthy();
  });

  it('gives every component with something to contribute a band to point at', () => {
    const { container } = render(<HealthExplorer health={health} />);
    expect(container.querySelectorAll('[data-segment]')).toHaveLength(components.length);
  });

  /*
   * A component contributing nothing occupies no arc, so a band for it would
   * be an invisible target sitting on top of its neighbour's.
   */
  it('gives no band to a component that contributes nothing', () => {
    const withEmpty: HealthScore = {
      ...health,
      components: [...components, part('Nothing Health', 0, 0)],
    };
    const { container } = render(<HealthExplorer health={withEmpty} />);
    expect(container.querySelector('[data-segment="Nothing Health"]')).toBeNull();
  });

  /*
   * The reason the ring could not have worked by accident. The centre readout
   * is absolutely positioned across the whole square, so without this it sits
   * over the arcs and takes every pointer event aimed at them.
   */
  it('does not let the centre readout swallow the ring', () => {
    const { container } = render(<HealthExplorer health={health} />);
    const overlay = container.querySelector('.absolute.inset-0')!;
    expect(overlay.className).toContain('pointer-events-none');
  });

  it('still marks a component whose figure is assumed rather than measured', () => {
    render(<HealthExplorer health={health} />);
    expect(screen.getAllByText('assumed')).toHaveLength(2);
  });
});

/*
 * The Command Centre's rail has no room for eight rows, and the page links
 * through to where they are. Without them the ring is the only route to any
 * of this, so what was a convenience there becomes the whole interface here.
 */
describe('the compact dial, with no breakdown beneath it', () => {
  it('shows no rows', () => {
    render(<HealthExplorer health={health} breakdown={false} />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('still answers when the ring is pointed at', () => {
    const { container } = render(<HealthExplorer health={health} breakdown={false} />);
    fireEvent.pointerEnter(container.querySelector('[data-segment="Financial Health"]')!);
    expect(screen.getByText('20.5')).toBeTruthy();
    expect(screen.getByText('Financial')).toBeTruthy();
  });

  /*
   * The dial's centre is showing the product in two-rem type. A line beneath
   * it reading "= 20.5" would be the same number twice, a centimetre apart —
   * so the line states the working and the dial states the result.
   */
  it('does not print the contribution twice', () => {
    const { container } = render(<HealthExplorer health={health} breakdown={false} />);
    fireEvent.pointerEnter(container.querySelector('[data-segment="Financial Health"]')!);
    expect(screen.getAllByText('20.5')).toHaveLength(1);
  });

  /*
   * The arithmetic has nowhere else to go here, so the line under the dial
   * carries it — the same multiplication the row would have stated.
   */
  it('states the working under the dial, where the rows would have', () => {
    const { container } = render(<HealthExplorer health={health} breakdown={false} />);
    fireEvent.pointerEnter(container.querySelector('[data-segment="Financial Health"]')!);
    expect(screen.getByText(/82 × 25%/)).toBeTruthy();
  });

  it('says so where the figure is assumed rather than measured', () => {
    const { container } = render(<HealthExplorer health={health} breakdown={false} />);
    fireEvent.pointerEnter(container.querySelector('[data-segment="Operational Health"]')!);
    expect(screen.getByText(/assumed/)).toBeTruthy();
  });

  /*
   * The route the rows were carrying. With them gone the bands take the tab
   * stops, or the dial is reachable by pointer and by nothing else.
   */
  it('puts the ring in the tab order, since nothing else is', () => {
    const { container } = render(<HealthExplorer health={health} breakdown={false} />);
    const bands = container.querySelectorAll('[data-segment]');
    expect(bands.length).toBe(components.length);
    for (const band of bands) {
      expect(band.getAttribute('tabindex')).toBe('0');
      expect(band.getAttribute('aria-label')).toMatch(/of 100, weighted .*, contributing/);
    }
  });

  it('answers on focus, not only on hover', () => {
    const { container } = render(<HealthExplorer health={health} breakdown={false} />);
    fireEvent.focus(container.querySelector('[data-segment="Strategic Health"]')!);
    expect(screen.getByText(/59 × 10%/)).toBeTruthy();
  });

  /*
   * A focusable control inside aria-hidden content is reachable by tab and
   * announced as nothing, which is worse than not being reachable at all.
   */
  it('does not hide the ring from a screen reader once it holds focus', () => {
    const { container } = render(<HealthExplorer health={health} breakdown={false} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(svg.getAttribute('role')).toBe('group');
  });

  // And the reverse: with the rows carrying it, the ring stays out of the way.
  it('leaves the ring out of the tab order when the rows are there', () => {
    const { container } = render(<HealthExplorer health={health} />);
    for (const band of container.querySelectorAll('[data-segment]')) {
      expect(band.getAttribute('tabindex')).toBeNull();
    }
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});

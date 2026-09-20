import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CompositionDonut, segmentsFor, pct, type Slice } from './composition-donut';

afterEach(cleanup);

const CIRCUMFERENCE = 2 * Math.PI * 54;

function slice(key: string, value: number, display = `${value}`): Slice {
  return { key, label: key, value, display };
}

const pipeline: Slice[] = [
  slice('Active', 600_000, 'R600k'),
  slice('Evaluating', 300_000, 'R300k'),
  slice('Planning', 100_000, 'R100k'),
];

describe('dividing the circle', () => {
  const segments = segmentsFor(pipeline);

  it('gives each part the share of the ring it has of the total', () => {
    expect(segments[0]!.share).toBeCloseTo(0.6, 10);
    expect(segments[1]!.share).toBeCloseTo(0.3, 10);
    expect(segments[2]!.share).toBeCloseTo(0.1, 10);
  });

  it('lays the arcs end to end so they close the circle', () => {
    expect(segments[0]!.offset).toBe(0);
    expect(segments[1]!.offset).toBeCloseTo(0.6 * CIRCUMFERENCE, 8);
    expect(segments[2]!.offset).toBeCloseTo(0.9 * CIRCUMFERENCE, 8);
  });

  /*
   * The arithmetic that keeps the last segment from lapping the first. Taking
   * the gap out of each arc leaves the offsets on the full share, so the ring
   * closes exactly; adding a gap between them would push the total past one
   * revolution and overlap the start.
   */
  it('takes the gap out of each arc rather than adding it between them', () => {
    const drawn = segments.reduce((sum, s) => sum + s.length, 0);
    expect(drawn).toBeCloseTo(CIRCUMFERENCE - 2 * segments.length, 6);
    const lastEnd = segments[2]!.offset + segments[2]!.length;
    expect(lastEnd).toBeLessThanOrEqual(CIRCUMFERENCE);
  });

  it('leaves a sliver visible rather than a negative arc', () => {
    // A part worth a thousandth of the whole is thinner than the 2px cut.
    const [big, tiny] = segmentsFor([slice('Big', 100_000), slice('Tiny', 100)]);
    expect(tiny!.length).toBeGreaterThan(0);
    expect(big!.length).toBeGreaterThan(tiny!.length);
  });

  it('draws one part as a whole ring with no cut in it', () => {
    const [only] = segmentsFor([slice('All of it', 42)]);
    expect(only!.length).toBeCloseTo(CIRCUMFERENCE, 10);
    expect(only!.share).toBe(1);
  });
});

describe('which colour a part gets', () => {
  /*
   * The defect this replaced. Sorting by size and colouring by position means
   * a branch that slips a place swaps colour with the one that passed it —
   * the chart repaints itself over a change in the data it is meant to report.
   */
  it('follows the part, not its size', () => {
    const before = segmentsFor([slice('Cape Town', 900), slice('Durban', 500)]);
    const after = segmentsFor([slice('Cape Town', 400), slice('Durban', 500)]);

    const colourOf = (segs: ReturnType<typeof segmentsFor>, key: string) =>
      segs.find((s) => s.key === key)!.colour;

    expect(colourOf(after, 'Cape Town')).toBe(colourOf(before, 'Cape Town'));
    expect(colourOf(after, 'Durban')).toBe(colourOf(before, 'Durban'));
  });

  it('draws the parts in the order given, not biggest first', () => {
    const segments = segmentsFor([slice('Active', 100), slice('Evaluating', 900)]);
    expect(segments.map((s) => s.key)).toEqual(['Active', 'Evaluating']);
  });

  /*
   * Slots 2 and 4 are ΔE 0.7 apart under deuteranopia — indistinguishable to a
   * green-blind reader — and are safe only because slot 3 always sits between
   * them. A three-part chart that took slots 1, 2 and 4 would put that pair
   * side by side, so assignment must run in sequence with no gaps.
   */
  it('assigns the slots in sequence, never skipping one', () => {
    const three = segmentsFor([slice('A', 3), slice('B', 2), slice('C', 1)]);
    expect(three.map((s) => s.colour)).toEqual([
      'var(--series-1)',
      'var(--series-2)',
      'var(--series-3)',
    ]);
  });

  it('does not let a dropped zero shift the slots of the parts after it', () => {
    const withZero = segmentsFor([slice('A', 3), slice('Nothing', 0), slice('C', 1)]);
    expect(withZero.map((s) => s.key)).toEqual(['A', 'C']);
    // C takes slot 2 — the slot the dropped part would have had is not held open.
    expect(withZero[1]!.colour).toBe('var(--series-2)');
  });
});

describe('when there are more parts than the ring can hold', () => {
  const branch = (n: number) => slice(`Branch ${n}`, 100 - n * 5);
  const seven = Array.from({ length: 7 }, (_, i) => branch(i + 1));

  /*
   * The boundary is four, not six, and the reason is that there are four
   * series colours. Six was the first guess and a screenshot disproved it: the
   * fifth and sixth parts fell past the end of the palette onto the tail's
   * grey, and the ring came back with three grey arcs — one meaning
   * "everything else" and two meaning real branches with names.
   */
  it('names four parts and folds the rest into one tail', () => {
    const segments = segmentsFor(seven);
    expect(segments).toHaveLength(5);
    expect(segments.slice(0, 4).map((s) => s.key)).toEqual([
      'Branch 1',
      'Branch 2',
      'Branch 3',
      'Branch 4',
    ]);
    expect(segments[4]!.key).toBe('__rest');
    expect(segments[4]!.label).toBe('3 more');
  });

  it('gives exactly one arc the grey, never two', () => {
    for (const count of [4, 5, 6, 7, 12]) {
      const segments = segmentsFor(Array.from({ length: count }, (_, i) => branch(i + 1)));
      const greys = segments.filter((s) => s.colour === 'var(--series-rest)');
      expect(greys.length, `${count} parts`).toBeLessThanOrEqual(1);
    }
  });

  it('still accounts for every part, so the shares reach a whole', () => {
    const total = segmentsFor(seven).reduce((sum, s) => sum + s.share, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  /*
   * Five is the one count that needs no tail: the fifth part takes the grey
   * and keeps its own name in the rows, which is one grey and reads correctly.
   * Folding it would replace a name with "1 more" and save nothing.
   */
  it('does not fold a fifth part, which would cost it its name', () => {
    const segments = segmentsFor([branch(1), branch(2), branch(3), branch(4), branch(5)]);
    expect(segments).toHaveLength(5);
    expect(segments.some((s) => s.key === '__rest')).toBe(false);
    expect(segments[4]!.label).toBe('Branch 5');
  });

  it('never folds a single part into a tail, at any count', () => {
    for (const count of [5, 6, 7, 8, 20]) {
      const segments = segmentsFor(Array.from({ length: count }, (_, i) => branch(i + 1)));
      const tail = segments.find((s) => s.key === '__rest');
      expect(tail?.label, `${count} parts`).not.toBe('1 more');
    }
  });

  it('gives the tail the grey, not a series colour', () => {
    expect(segmentsFor(seven)[4]!.colour).toBe('var(--series-rest)');
  });
});

describe('a composition of nothing', () => {
  it('has no segments when every part is zero', () => {
    expect(segmentsFor([slice('A', 0), slice('B', 0)])).toEqual([]);
  });

  it('has no segments when there are no parts at all', () => {
    expect(segmentsFor([])).toEqual([]);
  });

  /*
   * Rendering nothing rather than an empty ring: a grey circle labelled with a
   * total of zero looks like a chart that failed to load, and the card around
   * it can say something truer about why there is nothing to show.
   */
  it('renders nothing rather than an empty ring', () => {
    const { container } = render(
      <CompositionDonut slices={[]} total="R0" totalLabel="pipeline" caption="Nothing yet." />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('the ring as something to read', () => {
  function draw() {
    return render(
      <CompositionDonut
        slices={pipeline}
        total="R1.0m"
        totalLabel="pipeline"
        caption="The pipeline, split by stage."
      />,
    );
  }

  it('shows the whole total until a part is singled out', () => {
    draw();
    expect(screen.getByText('R1.0m')).toBeTruthy();
    expect(screen.getByText('pipeline')).toBeTruthy();
  });

  it('names the part being pointed at, and states its figure', () => {
    const { container } = draw();
    fireEvent.pointerEnter(container.querySelector('[data-segment="Active"]')!);
    // The figure, in the same units as the total it replaced — and once, not
    // beside the row already saying it.
    expect(screen.getAllByText('R600k')).toHaveLength(2); // centre + its row
    expect(screen.queryByText('R1.0m')).toBeNull();
  });

  it('goes back to the total once the pointer leaves', () => {
    const { container } = draw();
    const arc = container.querySelector('[data-segment="Active"]')!;
    fireEvent.pointerEnter(arc);
    fireEvent.pointerLeave(arc);
    expect(screen.getByText('R1.0m')).toBeTruthy();
  });

  /*
   * The rule that makes the chart usable without a pointer: every figure is
   * printed in the rows beneath, so nothing is reachable only by hovering.
   */
  it('prints every part’s figure and share without anyone pointing at anything', () => {
    draw();
    for (const [label, display, share] of [
      ['Active', 'R600k', '60%'],
      ['Evaluating', 'R300k', '30%'],
      ['Planning', 'R100k', '10%'],
    ]) {
      const row = screen.getByRole('button', { name: new RegExp(label!) });
      expect(row.textContent).toContain(display);
      expect(row.textContent).toContain(share);
    }
  });

  it('answers to the rows on keyboard focus, which the ring cannot give', () => {
    draw();
    fireEvent.focus(screen.getByRole('button', { name: /Evaluating/ }));
    expect(screen.queryByText('R1.0m')).toBeNull();
    expect(screen.getAllByText('R300k')).toHaveLength(2);
  });

  /*
   * The reason the ring could not have worked by accident: the readout is
   * absolutely positioned across the whole square, so without this it covers
   * the arcs and takes every pointer event meant for them.
   */
  it('does not let the centre readout swallow the ring', () => {
    const { container } = draw();
    const overlay = container.querySelector('.absolute.inset-0')!;
    expect(overlay.className).toContain('pointer-events-none');
  });

  it('describes what the ring is for a screen reader', () => {
    draw();
    expect(screen.getByTitle('The pipeline, split by stage.')).toBeTruthy();
  });
});

describe('printing a share', () => {
  it('rounds to a whole point', () => {
    expect(pct(0.605)).toBe('61%');
    expect(pct(0.5)).toBe('50%');
  });

  /*
   * A part worth a fifth of a point is present, and "0%" says it is not. The
   * distinction matters on a pipeline: a deal worth a thousand rand against a
   * million is small, not absent.
   */
  it('says "<1%" rather than nothing for something small but real', () => {
    expect(pct(0.002)).toBe('<1%');
  });

  it('still says 0% for an actual nothing', () => {
    expect(pct(0)).toBe('0%');
  });
});

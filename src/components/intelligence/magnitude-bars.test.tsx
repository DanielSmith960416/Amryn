import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MagnitudeBars, measure, type Bar } from './magnitude-bars';

afterEach(cleanup);

function bar(key: string, value: number, display = `${value}`): Bar {
  return { key, label: key, value, display };
}

const branches = [
  bar('Sandton', 4_120_000, 'R4.1m'),
  bar('Cape Town', 3_050_000, 'R3.1m'),
  bar('Durban', 1_870_000, 'R1.9m'),
  bar('Gqeberha', 640_000, 'R640k'),
];

describe('setting the scale', () => {
  const measured = measure(branches);

  /*
   * Scaling to the largest rather than to the total is what makes the chart
   * worth the space. Four branches averaging a quarter each would never fill
   * more than a quarter of the card on a share-of-total scale, and every
   * difference worth seeing would be squeezed into it.
   */
  it('gives the largest the full width', () => {
    expect(measured[0]!.width).toBe(100);
  });

  it('keeps every ratio between bars exactly right', () => {
    // Cape Town is 3.05/4.12 of Sandton, and the bar says so.
    expect(measured[1]!.width).toBeCloseTo((3_050_000 / 4_120_000) * 100, 8);
    expect(measured[3]!.width).toBeCloseTo((640_000 / 4_120_000) * 100, 8);
  });

  it('states each one’s share of the whole as well as of the leader', () => {
    const total = branches.reduce((sum, b) => sum + b.value, 0);
    expect(measured[0]!.share).toBeCloseTo(4_120_000 / total, 10);
    expect(measured.reduce((sum, b) => sum + b.share, 0)).toBeCloseTo(1, 10);
  });

  it('orders them largest first', () => {
    const shuffled = [branches[2]!, branches[0]!, branches[3]!, branches[1]!];
    expect(measure(shuffled).map((b) => b.key)).toEqual([
      'Sandton',
      'Cape Town',
      'Durban',
      'Gqeberha',
    ]);
  });

  /*
   * A branch worth a thousandth of the leader is still a branch that traded.
   * Rounding it to no width at all would say it did not.
   */
  it('leaves a real but tiny value visible', () => {
    const [, tiny] = measure([bar('Big', 1_000_000), bar('Tiny', 500)]);
    expect(tiny!.width).toBeGreaterThan(0);
  });

  it('drops what has no magnitude rather than drawing a nothing', () => {
    expect(measure([bar('A', 100), bar('Closed', 0)]).map((b) => b.key)).toEqual(['A']);
    expect(measure([bar('A', 0)])).toEqual([]);
    expect(measure([])).toEqual([]);
  });
});

describe('the bars as something to read', () => {
  function draw() {
    return render(<MagnitudeBars bars={branches} caption="Revenue by branch." />);
  }

  /*
   * Every figure printed, always. A value reachable only by hovering is a
   * value nobody on a keyboard, a phone or a printout can read — and this
   * chart's numbers are the whole point of it.
   */
  it('prints every figure without anyone pointing at anything', () => {
    draw();
    for (const display of ['R4.1m', 'R3.1m', 'R1.9m', 'R640k']) {
      expect(screen.getByText(display)).toBeTruthy();
    }
  });

  it('names each bar and its share for a screen reader', () => {
    draw();
    expect(screen.getByRole('button', { name: /Sandton: R4\.1m, 43% of the total/ })).toBeTruthy();
  });

  /*
   * The row is the target, not the bar. Gqeberha's bar is about a sixth of
   * the leader's; a hit area that size is one only a mouse can use.
   */
  it('makes the whole row the target, not the bar', () => {
    draw();
    const row = screen.getByRole('button', { name: /Gqeberha/ });
    expect(row.className).toContain('w-full');
  });

  it('answers on focus, not only on hover', () => {
    const { container } = draw();
    const row = screen.getByRole('button', { name: /Durban/ });
    fireEvent.focus(row);
    expect(row.className).toContain('bg-[var(--card-inset)]');
    // And the others give way, so the one in hand is the one being read.
    const dimmed = [...container.querySelectorAll('[style*="opacity: 0.35"]')];
    expect(dimmed.length).toBe(branches.length - 1);
  });

  it('puts them all back once nothing is singled out', () => {
    const { container } = draw();
    const row = screen.getByRole('button', { name: /Durban/ });
    fireEvent.focus(row);
    fireEvent.blur(row);
    expect(container.querySelectorAll('[style*="opacity: 0.35"]')).toHaveLength(0);
  });

  /*
   * One hue for every bar. A ramp would re-encode length as colour — spending
   * the only free channel on what the bar already says — and would fail the
   * palette checks by construction, since a ramp spans the lightness band.
   */
  it('gives every bar the same colour', () => {
    const { container } = draw();
    const fills = [...container.querySelectorAll('[style*="--series-1"]')];
    expect(fills).toHaveLength(branches.length);
  });

  it('renders nothing rather than an empty frame', () => {
    const { container } = render(<MagnitudeBars bars={[]} caption="Nothing." />);
    expect(container.firstChild).toBeNull();
  });
});

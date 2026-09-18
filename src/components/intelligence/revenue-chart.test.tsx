import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { MonthDerived } from '@/lib/intelligence/types';
import { RevenueChart, bandFor, MEASURES } from './revenue-chart';

afterEach(cleanup);

function month(name: string, revenue: number, grossProfit: number, netProfit: number): MonthDerived {
  return {
    month: name,
    revenue,
    cogs: revenue - grossProfit,
    opex: grossProfit - netProfit,
    cashIn: revenue,
    cashOut: revenue - netProfit,
    accountsReceivable: 0,
    accountsPayable: 0,
    newCustomers: 0,
    totalCustomers: 0,
    returns: 0,
    marketingSpend: 0,
    grossProfit,
    grossMargin: revenue === 0 ? 0 : grossProfit / revenue,
    netProfit,
    netMargin: revenue === 0 ? 0 : netProfit / revenue,
    netCash: netProfit,
  } as MonthDerived;
}

const months = [
  month('January', 742_000, 468_000, 198_000),
  month('February', 698_000, 436_000, 171_000),
  month('July', 604_000, 351_000, -18_000),
  month('September', 869_000, 561_000, 258_000),
];

describe('the band a series is drawn in', () => {
  it('pads the range so the line never touches the frame', () => {
    const band = bandFor([100, 200]);
    expect(band.top).toBeGreaterThan(200);
    expect(band.bottom).toBeLessThan(100);
  });

  /*
   * The floor is the padded minimum, not zero — which is the behaviour this
   * chart has always had, and is left alone here deliberately. A trend line
   * pinned to zero flattens the month-to-month movement it exists to show.
   *
   * The clamp only bites when the padding would take a positive series below
   * zero, which is a floor that would mean nothing.
   */
  it('floors a positive series just under its minimum, and never below zero', () => {
    const tight = bandFor([742_000, 698_000, 869_000]);
    expect(tight.bottom).toBeGreaterThan(0);
    expect(tight.bottom).toBeLessThan(698_000);
    expect(tight.zero).toBeNull();

    // The clamp bites only where the minimum is under a tenth of the range,
    // so the padding would take the floor below zero — and a revenue axis
    // starting below zero would be claiming a month that cannot exist.
    expect(bandFor([50, 1_000]).bottom).toBe(0);
  });

  /*
   * The defect this function exists for. The floor used to be clamped at zero
   * for every series, so July's loss would have been drawn sitting flat on the
   * baseline — a business that merely broke even rather than one that lost
   * eighteen thousand rand.
   */
  it('lets a loss below the line, and marks where the line is', () => {
    const band = bandFor([198_000, 171_000, -18_000, 258_000]);
    expect(band.bottom).toBeLessThan(-18_000);
    expect(band.zero).toBe(0);
  });

  it('draws a flat series as a line rather than a divide', () => {
    const band = bandFor([50_000, 50_000, 50_000]);
    expect(band.top).toBeGreaterThan(band.bottom);
  });

  it('survives a series of nothing but zeroes', () => {
    const band = bandFor([0, 0]);
    expect(Number.isFinite(band.top)).toBe(true);
    expect(Number.isFinite(band.bottom)).toBe(true);
    expect(band.top).toBeGreaterThan(band.bottom);
  });
});

describe('the three measures', () => {
  it('reads each one off the month the model already computed', () => {
    const july = months[2]!;
    expect(MEASURES.find((m) => m.key === 'revenue')!.of(july)).toBe(604_000);
    expect(MEASURES.find((m) => m.key === 'grossProfit')!.of(july)).toBe(351_000);
    expect(MEASURES.find((m) => m.key === 'netProfit')!.of(july)).toBe(-18_000);
  });
});

describe('the chart as something to read', () => {
  it('opens on the latest reported month, before anyone points at anything', () => {
    render(<RevenueChart months={months} currency="ZAR" />);
    expect(screen.getByText('September')).toBeTruthy();
    expect(screen.getByText('latest reported')).toBeTruthy();
    expect(screen.getByText(/R869,000/)).toBeTruthy();
  });

  /*
   * All three regardless of which is plotted. Making the switch a prerequisite
   * for a number would turn a choice about the picture into a gate on the data.
   */
  it('states every measure, not only the one being drawn', () => {
    render(<RevenueChart months={months} currency="ZAR" />);
    expect(screen.getByText(/R869,000/)).toBeTruthy();
    expect(screen.getByText(/R561,000/)).toBeTruthy();
    expect(screen.getByText(/R258,000/)).toBeTruthy();
  });

  it('switches which series is drawn', () => {
    render(<RevenueChart months={months} currency="ZAR" />);
    const net = screen.getByRole('button', { name: 'Net profit' });
    expect(net.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(net);
    expect(net.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Revenue' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('names the plotted measure and its range for a screen reader', () => {
    render(<RevenueChart months={months} currency="ZAR" />);
    expect(screen.getByRole('img', { name: /Revenue by month from January to September/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Net profit' }));
    expect(screen.getByRole('img', { name: /Net profit by month/ })).toBeTruthy();
  });

  it('refuses to draw a trend through one point', () => {
    render(<RevenueChart months={[months[0]!]} currency="ZAR" />);
    expect(screen.getByText(/At least two reported months/)).toBeTruthy();
  });

  /*
   * Unreported months arrive as zeroes. Plotting them would draw a year that
   * collapses to nothing in October rather than one still in progress.
   */
  it('plots only the months that were reported', () => {
    const withBlanks = [...months, month('October', 0, 0, 0), month('November', 0, 0, 0)];
    render(<RevenueChart months={withBlanks} currency="ZAR" />);
    expect(screen.getByRole('img', { name: /from January to September/ })).toBeTruthy();
  });
});

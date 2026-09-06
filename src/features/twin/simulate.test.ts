import { describe, expect, it } from 'vitest';
import {
  ASSUMPTIONS,
  MIN_ITERATIONS,
  createRandom,
  deriveParameters,
  percentile,
  simulate,
} from './simulate';
import type { TwinInputs } from './simulate';

// A business stating R1.2m on 300 customers at R400 an order: 3,000 orders a
// year, ten a customer, all three figures its own.
const STATED: TwinInputs = {
  annualRevenueCents: 120_000_000,
  customerCount: 300,
  averageOrderCents: 40_000,
  repeatRatePct: 60,
};

const params = () => {
  const derived = deriveParameters(STATED);
  if (!derived.ok) throw new Error('fixture should derive');
  return derived.parameters;
};

describe('deriveParameters', () => {
  it('derives order frequency rather than assuming it', () => {
    // The parameter a simulation is most tempted to invent. R1.2m at R400 an
    // order is 3,000 orders, and that is arithmetic on stated figures.
    expect(params().ordersPerYear).toBe(3000);
  });

  it('refuses, naming every figure it is missing', () => {
    const derived = deriveParameters({
      annualRevenueCents: null,
      customerCount: null,
      averageOrderCents: 40_000,
      repeatRatePct: null,
    });
    expect(derived.ok).toBe(false);
    if (!derived.ok) expect(derived.missing).toEqual(['annualRevenue', 'customerCount']);
  });

  it('treats zero as missing rather than as a business with no customers', () => {
    // A zero here makes the derivation degenerate. Reporting "you have no
    // customers" to somebody who skipped the question is worse than reporting
    // that they skipped it.
    const derived = deriveParameters({ ...STATED, customerCount: 0 });
    expect(derived.ok).toBe(false);
    if (!derived.ok) expect(derived.missing).toContain('customerCount');
  });

  it('treats an absent repeat rate as everybody alike, not as nobody returning', () => {
    const derived = deriveParameters({ ...STATED, repeatRatePct: null });
    expect(derived.ok).toBe(true);
    if (derived.ok) expect(derived.parameters.repeatingShare).toBe(0);
  });
});

describe('createRandom', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('gives a different sequence for a different seed', () => {
    expect(createRandom(1)()).not.toBe(createRandom(2)());
  });

  it('stays inside [0, 1)', () => {
    const random = createRandom(7);
    for (let i = 0; i < 5000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('percentile', () => {
  it('interpolates rather than jumping between neighbours', () => {
    // Nearest-rank would report 2 or 3 here and flip between them as the
    // sample changed, so two runs of one scenario would disagree for no reason
    // a reader could see.
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it('returns the ends at the ends', () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
    expect(percentile([10, 20, 30], 1)).toBe(30);
  });

  it('survives a single sample and an empty one', () => {
    expect(percentile([5], 0.9)).toBe(5);
    expect(Number.isNaN(percentile([], 0.5))).toBe(true);
  });
});

describe('simulate', () => {
  it('refuses fewer iterations than a percentile deserves', () => {
    expect(() => simulate(params(), { days: 30, iterations: 100, seed: 1 })).toThrow(
      /at least 500 iterations/,
    );
    expect(() => simulate(params(), { days: 0, iterations: MIN_ITERATIONS, seed: 1 })).toThrow(
      /at least one day/,
    );
  });

  it('is exactly reproducible from its seed', () => {
    // The property that makes a simulated figure arguable. Without it, the
    // first disagreement about a number ends with "it said something else
    // this time".
    const a = simulate(params(), { days: 30, iterations: MIN_ITERATIONS, seed: 99 });
    const b = simulate(params(), { days: 30, iterations: MIN_ITERATIONS, seed: 99 });
    expect(a.revenueCents).toEqual(b.revenueCents);
  });

  it('gives a different answer for a different seed, and a similar one', () => {
    const a = simulate(params(), { days: 90, iterations: MIN_ITERATIONS, seed: 1 });
    const b = simulate(params(), { days: 90, iterations: MIN_ITERATIONS, seed: 2 });
    expect(a.revenueCents.p50).not.toBe(b.revenueCents.p50);
    // Different draws of the same business, so within a few percent.
    expect(Math.abs(a.revenueCents.p50 - b.revenueCents.p50) / a.revenueCents.p50).toBeLessThan(0.05);
  });

  it('produces an ordered interval, never a transposed one', () => {
    const out = simulate(params(), { days: 90, iterations: MIN_ITERATIONS, seed: 3 });
    expect(out.revenueCents.p10).toBeLessThanOrEqual(out.revenueCents.p50);
    expect(out.revenueCents.p50).toBeLessThanOrEqual(out.revenueCents.p90);
  });

  it('centres on what the stated figures imply', () => {
    // 3,000 orders a year at R400 is R1.2m. Over 365 days the P50 should land
    // near that — if it does not, the derivation is wrong rather than the
    // randomness.
    const out = simulate(params(), { days: 365, iterations: MIN_ITERATIONS, seed: 11 });
    const impliedCents = 120_000_000;
    expect(Math.abs(out.revenueCents.p50 - impliedCents) / impliedCents).toBeLessThan(0.1);
  });

  it('never reports negative revenue', () => {
    // A normal draw far below the mean would otherwise produce a negative sale,
    // and a handful across five hundred iterations drags the P10 below anything
    // the business could actually experience.
    const thin = deriveParameters({ ...STATED, customerCount: 2, annualRevenueCents: 80_000 });
    if (!thin.ok) throw new Error('should derive');
    const out = simulate(thin.parameters, { days: 30, iterations: MIN_ITERATIONS, seed: 5 });
    expect(out.revenueCents.p10).toBeGreaterThanOrEqual(0);
  });

  it('moves with demand and with price, in the direction stated', () => {
    const base = simulate(params(), { days: 90, iterations: MIN_ITERATIONS, seed: 7 });
    const busier = simulate(params(), {
      days: 90, iterations: MIN_ITERATIONS, seed: 7, demandMultiplier: 1.2,
    });
    const dearer = simulate(params(), {
      days: 90, iterations: MIN_ITERATIONS, seed: 7, priceMultiplier: 1.2,
    });
    expect(busier.revenueCents.p50).toBeGreaterThan(base.revenueCents.p50);
    expect(dearer.revenueCents.p50).toBeGreaterThan(base.revenueCents.p50);
  });

  it('carries its assumptions with its answer', () => {
    // A simulation whose assumptions live only in its source is one nobody can
    // argue with specifically.
    const out = simulate(params(), { days: 30, iterations: MIN_ITERATIONS, seed: 1 });
    expect(out.assumptions).toEqual(ASSUMPTIONS);
    expect(out.assumptions.length).toBeGreaterThan(0);
    expect(out.seed).toBe(1);
    expect(out.iterations).toBe(MIN_ITERATIONS);
  });
});

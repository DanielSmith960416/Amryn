import { describe, expect, it } from 'vitest';
import { CONCENTRATION_THRESHOLD, answersFrom, findingsFrom } from './run-analysis';

const layers = (answers: Record<string, unknown>, state = 'answered') => [
  { layer: 'commercial', state, answers, gaps: null },
];

describe('answersFrom', () => {
  it('flattens every layer into one map of field to what was typed', () => {
    const flat = answersFrom([
      { layer: 'commercial', state: 'answered', answers: { annualRevenue: '1200000' }, gaps: null },
      { layer: 'customers', state: 'answered', answers: { biggestCustomerShare: '30' }, gaps: null },
    ]);
    expect(flat.get('annualRevenue')).toBe('1200000');
    expect(flat.get('biggestCustomerShare')).toBe('30');
  });

  it('ignores a layer the customer skipped', () => {
    // Skipping is a legitimate answer and it is not an answer. Reading a value
    // out of a skipped layer would let a figure somebody abandoned drive a
    // finding they never stood behind.
    expect(answersFrom(layers({ annualRevenue: '1200000' }, 'skipped')).size).toBe(0);
  });

  it('ignores blanks and nulls rather than treating them as zero', () => {
    const flat = answersFrom(layers({ annualRevenue: '  ', grossMarginTarget: null }));
    expect(flat.size).toBe(0);
  });
});

describe('findingsFrom', () => {
  it('says nothing at all about an empty Imprint, and records what it wanted', () => {
    const { findings, gaps } = findingsFrom(new Map());
    expect(findings).toHaveLength(0);
    // The whole point of gaps: silence about a business we cannot see must be
    // distinguishable from silence about a business with nothing wrong.
    expect(gaps).toContain('biggestCustomerShare');
    expect(gaps).toContain('grossMarginTarget');
    expect(gaps).toContain('monthlyFixedCosts');
    expect(gaps).toContain('revenueTargetAnnual');
  });

  it('reads money the way people type it', () => {
    const { findings } = findingsFrom(
      new Map([['annualRevenue', 'R1 200 000'], ['biggestCustomerShare', '30']]),
    );
    // 30% of 1 200 000 = 360 000, in cents.
    expect(findings[0]?.impactCents).toBe(36_000_000);
  });

  it('raises concentration only above the stated threshold', () => {
    const under = findingsFrom(new Map([['biggestCustomerShare', String(CONCENTRATION_THRESHOLD - 1)]]));
    expect(under.findings.some((f) => f.category === 'customer')).toBe(false);

    const over = findingsFrom(new Map([['biggestCustomerShare', String(CONCENTRATION_THRESHOLD)]]));
    expect(over.findings.some((f) => f.category === 'customer')).toBe(true);
  });

  it('states the share as fact when it cannot price it, rather than guessing revenue', () => {
    const { findings, gaps } = findingsFrom(new Map([['biggestCustomerShare', '40']]));
    const finding = findings.find((f) => f.category === 'customer');
    expect(finding?.provenance).toBe('fact');
    expect(finding?.impactCents).toBeNull();
    expect(gaps).toContain('annualRevenue');
  });

  it('carries no uncertainty range on arithmetic over two stated figures', () => {
    // #65 requires an interval on anything estimated or simulated. Multiplying
    // two numbers the business gave us is neither, and inventing a range for
    // it would be inventing uncertainty that does not exist.
    const { findings } = findingsFrom(
      new Map([['annualRevenue', '1000000'], ['biggestCustomerShare', '50']]),
    );
    const finding = findings.find((f) => f.category === 'customer');
    expect(finding?.provenance).toBe('derived');
    expect(finding?.interval).toBeNull();
  });

  it('reports a shortfall when fixed costs outrun gross profit', () => {
    const { findings } = findingsFrom(
      new Map([
        ['annualRevenue', '1000000'],
        ['grossMarginTarget', '20'],      // gross profit 200 000
        ['monthlyFixedCosts', '25000'],   // a year is 300 000
      ]),
    );
    const finding = findings.find((f) => f.category === 'financial');
    expect(finding?.impactCents).toBe(-10_000_000); // -100 000, in cents
    expect(finding?.direction).toBe('down');
    expect(finding?.headline).toContain('exceed');
  });

  it('computes the growth a target implies, in both directions', () => {
    const up = findingsFrom(new Map([['annualRevenue', '1000000'], ['revenueTargetAnnual', '1250000']]));
    expect(up.findings.find((f) => f.category === 'growth')?.headline).toContain('25%');

    const down = findingsFrom(new Map([['annualRevenue', '1000000'], ['revenueTargetAnnual', '900000']]));
    expect(down.findings.find((f) => f.category === 'growth')?.direction).toBe('down');
  });

  it('never divides by a revenue of zero', () => {
    const { findings, gaps } = findingsFrom(
      new Map([['annualRevenue', '0'], ['revenueTargetAnnual', '500000']]),
    );
    expect(findings.some((f) => f.category === 'growth')).toBe(false);
    expect(gaps).not.toContain('revenueTargetAnnual');
  });

  it('every figure it produces traces to an answer somebody typed', () => {
    const { findings } = findingsFrom(
      new Map([
        ['annualRevenue', '1000000'],
        ['biggestCustomerShare', '40'],
        ['grossMarginTarget', '30'],
        ['monthlyFixedCosts', '10000'],
        ['revenueTargetAnnual', '1200000'],
      ]),
    );
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.evidence.length).toBeGreaterThan(0);
      for (const item of finding.evidence) expect(item.startsWith('imprint:')).toBe(true);
      // Nothing here is estimated or simulated, so nothing may carry a range.
      expect(['fact', 'derived']).toContain(finding.provenance);
    }
  });
});

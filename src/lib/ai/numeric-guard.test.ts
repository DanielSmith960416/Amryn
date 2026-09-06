import { describe, expect, it } from 'vitest';
import { describeInvented, guardNumbers, numbersIn } from './numeric-guard';

const clean = (output: string, context: string) => guardNumbers(output, context).ok;
const invented = (output: string, context: string) =>
  guardNumbers(output, context).invented.map((m) => m.text);

describe('numbersIn', () => {
  it('reads thousands separators, both kinds', () => {
    expect(numbersIn('R4,235,000 and R4 235 000').map((n) => n.value)).toEqual([4235000, 4235000]);
  });

  it('applies scale suffixes', () => {
    expect(numbersIn('4.2m, 850k, 1.1bn').map((n) => n.value)).toEqual([4_200_000, 850_000, 1_100_000_000]);
  });

  it('reads percentages as their face value', () => {
    // "27%" is the number 27. The guard compares it to the 27 the engine put
    // in the context, not to 0.27.
    expect(numbersIn('up 27%').map((n) => n.value)).toEqual([27]);
  });

  it('does not read a version number as a quantity', () => {
    // The lookbehind stops "v2.15.1" fragmenting into numbers that then have
    // to be explained away.
    expect(numbersIn('see v2.15.1').map((n) => n.text)).not.toContain('15');
  });
});

describe('guardNumbers', () => {
  const context = 'Revenue now 4235000, was 3811000, +11%. Operating cost +27%. Branches: 4.';

  it('passes output that only restates what it was given', () => {
    expect(clean('Revenue reached 4235000, up 11% on 3811000.', context)).toBe(true);
  });

  it('catches a figure that was never supplied', () => {
    expect(invented('Revenue reached 5100000 this year.', context)).toEqual(['5100000']);
  });

  it('catches an invented percentage, which is the common case', () => {
    // The dangerous one: a plausible growth figure in the house voice, on a
    // page somebody is about to act on.
    expect(invented('Margin improved 19% over the period.', context)).toEqual(['19%']);
  });

  it('allows rounding, because that is better writing and not invention', () => {
    expect(clean('Revenue is about 4.2m.', context)).toBe(true);
    expect(clean('Revenue is roughly 4.24m.', context)).toBe(true);
  });

  it('but not rounding so loose it is a different number', () => {
    // 4.5m does not round from 4.235m at one decimal place. A guard that let
    // this through would let through anything in the neighbourhood.
    expect(invented('Revenue is about 4.5m.', context)).toEqual(['4.5m']);
  });

  it('holds an exact figure to an exact standard', () => {
    // Precision is a claim in itself: writing 4,235,112 asserts the last three
    // digits, and the context does not support them.
    expect(invented('Revenue was exactly 4235112.', context)).toEqual(['4235112']);
  });

  it('accepts a currency prefix on either side of the comparison', () => {
    expect(clean('Revenue reached R4,235,000.', context)).toBe(true);
  });

  it('ignores the small integers that carry ordinary prose', () => {
    expect(clean('There are 2 things to do, and the first matters most.', context)).toBe(true);
  });

  it('does not use that exemption to wave through a small claim', () => {
    // 12 is a small integer and "12% growth" is exactly the shape of claim
    // this exists to catch, so the exemption has to stay tiny.
    expect(invented('Growth of 12% is expected.', context)).toEqual(['12%']);
  });

  it('lets a year through, and not a number pretending to be one', () => {
    const year = new Date().getUTCFullYear();
    expect(clean(`Since ${year} the trend has held.`, context)).toBe(true);
    expect(invented('Since 1850 the trend has held.', context)).toEqual(['1850']);
  });

  it('reports every invented figure, not just the first', () => {
    const result = guardNumbers('It rose 19% to 5100000.', context);
    expect(result.invented).toHaveLength(2);
    expect(describeInvented(result)).toBe('19%, 5100000');
  });

  it('passes prose with no numbers at all', () => {
    expect(clean('Costs are running ahead of revenue and that is the finding.', context)).toBe(true);
  });

  it('treats an empty context as supplying nothing', () => {
    // The failure mode worth naming: if the context were ever empty because a
    // caller passed the wrong argument, a permissive guard would pass
    // everything silently. This must reject instead.
    expect(clean('Revenue reached 4235000.', '')).toBe(false);
  });

  it('matches a figure written with a different scale to the same value', () => {
    // The engine renders 4200000; the model writes "4.2m". Same number.
    expect(clean('Revenue is 4.2m.', 'Revenue now 4200000.')).toBe(true);
  });
});

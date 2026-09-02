import { describe, expect, it } from 'vitest';
import {
  calculateHealthScore,
  classify,
  DEFAULT_HEALTH_WEIGHTS,
  metricAchievement,
  normaliseWeights,
  scoreMetric,
  type HealthMetricInput,
} from './health-score';

const metric = (over: Partial<HealthMetricInput> = {}): HealthMetricInput => ({
  key: 'revenue',
  label: 'Revenue',
  category: 'financial',
  weight: 1,
  value: 100,
  target: 100,
  higherIsBetter: true,
  ...over,
});

describe('metricAchievement', () => {
  it('is the plain ratio when higher is better', () => {
    expect(metricAchievement(120, 100, true)).toBe(1.2);
  });

  it('inverts when lower is better, so beating a cost target scores above 1', () => {
    expect(metricAchievement(500, 620, false)).toBeCloseTo(1.24, 2);
    expect(metricAchievement(700, 620, false)).toBeCloseTo(0.886, 3);
  });

  it('treats a zero or negative lower-is-better value as fully achieved', () => {
    expect(metricAchievement(0, 620, false)).toBeGreaterThan(1);
  });

  it('refuses to divide by a zero target', () => {
    expect(metricAchievement(100, 0, true)).toBeNull();
  });
});

describe('scoreMetric', () => {
  it('scores exactly on target as 80, not 100', () => {
    expect(scoreMetric(metric({ value: 100, target: 100 }))).toBe(80);
  });

  it('awards the full 100 at 25% above target', () => {
    expect(scoreMetric(metric({ value: 125, target: 100 }))).toBe(100);
  });

  it('does not exceed 100 however far past target', () => {
    expect(scoreMetric(metric({ value: 10_000, target: 100 }))).toBe(100);
  });

  it('scales linearly below target', () => {
    expect(scoreMetric(metric({ value: 50, target: 100 }))).toBe(40);
    expect(scoreMetric(metric({ value: 0, target: 100 }))).toBe(0);
  });

  it('never goes negative when a value undershoots into the negative', () => {
    expect(scoreMetric(metric({ value: -500, target: 100 }))).toBe(0);
  });

  it('returns null for a metric with no usable target, rather than guessing', () => {
    expect(scoreMetric(metric({ target: null }))).toBeNull();
    expect(scoreMetric(metric({ target: 0 }))).toBeNull();
    expect(scoreMetric(metric({ value: Number.NaN }))).toBeNull();
  });
});

describe('classify', () => {
  it('uses the boundaries from the specification', () => {
    expect(classify(95)).toBe('excellent');
    expect(classify(90)).toBe('excellent');
    expect(classify(89.9)).toBe('healthy');
    expect(classify(75)).toBe('healthy');
    expect(classify(74.9)).toBe('attention');
    expect(classify(60)).toBe('attention');
    expect(classify(59.9)).toBe('at_risk');
    expect(classify(40)).toBe('at_risk');
    expect(classify(39.9)).toBe('critical');
    expect(classify(0)).toBe('critical');
  });
});

describe('normaliseWeights', () => {
  it('returns the specification defaults when nothing is overridden', () => {
    expect(normaliseWeights()).toEqual(DEFAULT_HEALTH_WEIGHTS);
  });

  it('always sums to 1, even when the overrides do not', () => {
    const weights = normaliseWeights({ financial: 0.5, operational: 0.5, sales: 0.5 });
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('ignores negative and non-finite overrides', () => {
    const weights = normaliseWeights({ financial: -3, sales: Number.NaN });
    expect(weights.financial).toBeGreaterThan(0);
    expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('falls back to the defaults if every weight is zeroed out', () => {
    const zeroed = {
      financial: 0, operational: 0, sales: 0, growth: 0, customer: 0, strategic: 0,
    };
    expect(normaliseWeights(zeroed)).toEqual(DEFAULT_HEALTH_WEIGHTS);
  });
});

describe('calculateHealthScore', () => {
  it('scores an all-on-target business at 80', () => {
    const result = calculateHealthScore([
      metric({ key: 'revenue', category: 'financial' }),
      metric({ key: 'delivery', category: 'operational' }),
      metric({ key: 'orders', category: 'sales' }),
      metric({ key: 'growth', category: 'growth' }),
      metric({ key: 'customers', category: 'customer' }),
      metric({ key: 'goals', category: 'strategic' }),
    ]);
    expect(result.score).toBe(80);
    expect(result.classification).toBe('healthy');
    expect(result.missingCategories).toEqual([]);
  });

  it('renormalises over the categories that have data', () => {
    // Only financial data connected, and it is exactly on target. The score
    // should be 80, not 80 × 0.25.
    const result = calculateHealthScore([metric({ category: 'financial' })]);
    expect(result.score).toBe(80);
    expect(result.missingCategories).toHaveLength(5);
    expect(result.categories).toHaveLength(1);
  });

  it('weights categories against each other', () => {
    // Financial perfect, operational at zero. Default weights are 0.25 and 0.20,
    // renormalised to 0.5556 and 0.4444 across the two present categories.
    const result = calculateHealthScore([
      metric({ key: 'a', category: 'financial', value: 125, target: 100 }),
      metric({ key: 'b', category: 'operational', value: 0, target: 100 }),
    ]);
    expect(result.score).toBeCloseTo(100 * (0.25 / 0.45), 1);
  });

  it('averages within a category by metric weight', () => {
    const result = calculateHealthScore([
      metric({ key: 'a', category: 'financial', weight: 3, value: 125, target: 100 }),
      metric({ key: 'b', category: 'financial', weight: 1, value: 0, target: 100 }),
    ]);
    // (100 × 0.75) + (0 × 0.25)
    expect(result.score).toBe(75);
  });

  it('ignores metrics with no target instead of scoring them zero', () => {
    const withNoise = calculateHealthScore([
      metric({ category: 'financial' }),
      metric({ key: 'untargeted', category: 'financial', target: null }),
    ]);
    expect(withNoise.score).toBe(80);
    expect(withNoise.categories[0]?.metricCount).toBe(1);
  });

  it('returns zero, not NaN, when there is nothing to score', () => {
    const result = calculateHealthScore([]);
    expect(result.score).toBe(0);
    expect(result.classification).toBe('critical');
    expect(result.missingCategories).toHaveLength(6);
  });

  it('lists contributions worst-first so the weakest metric leads', () => {
    const result = calculateHealthScore([
      metric({ key: 'strong', category: 'financial', value: 125 }),
      metric({ key: 'weak', category: 'financial', value: 20 }),
    ]);
    expect(result.contributions[0]?.key).toBe('weak');
    expect(result.contributions.at(-1)?.key).toBe('strong');
  });

  it('has contributions that sum to the overall score', () => {
    const result = calculateHealthScore([
      metric({ key: 'a', category: 'financial', value: 90, weight: 2 }),
      metric({ key: 'b', category: 'financial', value: 110, weight: 1 }),
      metric({ key: 'c', category: 'sales', value: 60 }),
      metric({ key: 'd', category: 'operational', value: 500, target: 620, higherIsBetter: false }),
    ]);
    const summed = result.contributions.reduce((sum, c) => sum + c.contribution, 0);
    expect(summed).toBeCloseTo(result.score, 1);
  });

  it('honours a custom weighting', () => {
    const metrics = [
      metric({ key: 'a', category: 'financial', value: 125 }),
      metric({ key: 'b', category: 'operational', value: 0 }),
    ];
    const financialHeavy = calculateHealthScore(metrics, { financial: 0.9, operational: 0.1 });
    const operationalHeavy = calculateHealthScore(metrics, { financial: 0.1, operational: 0.9 });
    expect(financialHeavy.score).toBeGreaterThan(operationalHeavy.score);
    expect(financialHeavy.score).toBeCloseTo(90, 0);
  });

  it('is deterministic — the same input always gives the same score', () => {
    const metrics = [
      metric({ key: 'a', value: 137, target: 119 }),
      metric({ key: 'b', category: 'sales', value: 4.3, target: 9.1 }),
    ];
    const first = calculateHealthScore(metrics);
    for (let i = 0; i < 25; i += 1) {
      expect(calculateHealthScore(metrics)).toEqual(first);
    }
  });
});

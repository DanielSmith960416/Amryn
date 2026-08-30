import { describe, expect, it } from 'vitest';
import {
  calculateOpportunityScore,
  classifyOpportunity,
  DEFAULT_OPPORTUNITY_WEIGHTS,
  explainOpportunityScore,
  normaliseOpportunityWeights,
  scoreCompetition,
  scoreUrgency,
  scoreValue,
  type OpportunityScoreInput,
} from './opportunity-score';

const NOW = new Date('2026-06-01T00:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const input = (over: Partial<OpportunityScoreInput> = {}): OpportunityScoreInput => ({
  relevance: 0.8,
  estimatedValueCents: 20_000_000,
  strategicAlignment: 0.7,
  closesOn: days(60),
  confidence: 0.7,
  competitorCount: 1,
  valueBenchmarkCents: 20_000_000,
  asOf: NOW,
  ...over,
});

describe('scoreUrgency', () => {
  it('maxes out inside a fortnight', () => {
    expect(scoreUrgency(days(1), NOW)).toBe(100);
    expect(scoreUrgency(days(14), NOW)).toBe(100);
  });

  it('decays towards a floor over six months', () => {
    expect(scoreUrgency(days(180), NOW)).toBe(10);
    expect(scoreUrgency(days(365), NOW)).toBe(10);
    const midpoint = scoreUrgency(days(97), NOW);
    expect(midpoint).toBeGreaterThan(50);
    expect(midpoint).toBeLessThan(60);
  });

  it('is zero once the window has closed', () => {
    expect(scoreUrgency(days(-1), NOW)).toBe(0);
  });

  it('treats an unknown deadline as real but not pressing', () => {
    const unknown = scoreUrgency(null, NOW);
    expect(unknown).toBeGreaterThan(scoreUrgency(days(180), NOW));
    expect(unknown).toBeLessThan(scoreUrgency(days(30), NOW));
  });

  it('decreases monotonically as the deadline recedes', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let d = 0; d <= 200; d += 7) {
      const score = scoreUrgency(days(d), NOW);
      expect(score).toBeLessThanOrEqual(previous);
      previous = score;
    }
  });
});

describe('scoreValue', () => {
  it('scores an opportunity at the benchmark in the middle of the range', () => {
    expect(scoreValue(1_000_000, 1_000_000)).toBe(66);
  });

  it('rewards larger opportunities without letting size dominate', () => {
    const atBenchmark = scoreValue(1_000_000, 1_000_000);
    const tenTimes = scoreValue(10_000_000, 1_000_000);
    const hundredTimes = scoreValue(100_000_000, 1_000_000);
    expect(tenTimes).toBeGreaterThan(atBenchmark);
    expect(hundredTimes).toBe(100);
    // Ten times the value is not ten times the score.
    expect(tenTimes / atBenchmark).toBeLessThan(2);
  });

  it('scales to the organisation, not to an absolute figure', () => {
    const forASmallBusiness = scoreValue(2_000_000, 200_000);
    const forALargeGroup = scoreValue(2_000_000, 200_000_000);
    expect(forASmallBusiness).toBeGreaterThan(forALargeGroup);
  });

  it('gives an unquantified opportunity a low score rather than none', () => {
    expect(scoreValue(null, 1_000_000)).toBe(20);
    expect(scoreValue(0, 1_000_000)).toBe(20);
  });

  it('never leaves the 0-100 range', () => {
    expect(scoreValue(1, 100_000_000_000)).toBeGreaterThanOrEqual(0);
    expect(scoreValue(100_000_000_000, 1)).toBeLessThanOrEqual(100);
  });

  it('survives a zero benchmark', () => {
    expect(scoreValue(1_000_000, 0)).toBeLessThanOrEqual(100);
  });
});

describe('scoreCompetition', () => {
  it('rewards an uncontested field', () => {
    expect(scoreCompetition(0)).toBe(100);
  });

  it('falls as competitors appear and floors at five', () => {
    expect(scoreCompetition(1)).toBe(84);
    expect(scoreCompetition(4)).toBe(36);
    expect(scoreCompetition(5)).toBe(20);
    expect(scoreCompetition(50)).toBe(20);
  });

  it('ignores nonsensical counts', () => {
    expect(scoreCompetition(-3)).toBe(100);
  });
});

describe('classifyOpportunity', () => {
  it('uses the bands from the specification', () => {
    expect(classifyOpportunity(80)).toBe('high_priority');
    expect(classifyOpportunity(79.9)).toBe('strong');
    expect(classifyOpportunity(60)).toBe('strong');
    expect(classifyOpportunity(59.9)).toBe('potential');
    expect(classifyOpportunity(40)).toBe('potential');
    expect(classifyOpportunity(39.9)).toBe('monitor');
  });
});

describe('calculateOpportunityScore', () => {
  it('rates a perfect opportunity at 100', () => {
    const result = calculateOpportunityScore(
      input({
        relevance: 1,
        strategicAlignment: 1,
        confidence: 1,
        competitorCount: 0,
        closesOn: days(7),
        estimatedValueCents: 10_000_000_000,
        valueBenchmarkCents: 1_000_000,
      }),
    );
    expect(result.total).toBe(100);
    expect(result.classification).toBe('high_priority');
  });

  it('rates a hopeless opportunity at the floor', () => {
    const result = calculateOpportunityScore(
      input({
        relevance: 0,
        strategicAlignment: 0,
        confidence: 0,
        competitorCount: 10,
        closesOn: days(-5),
        estimatedValueCents: null,
      }),
    );
    expect(result.total).toBeLessThan(10);
    expect(result.classification).toBe('monitor');
  });

  it('always stays inside 0-100', () => {
    const cases: OpportunityScoreInput[] = [
      input({ relevance: 5, strategicAlignment: 9, confidence: 4 }),
      input({ relevance: -2, strategicAlignment: -1, confidence: -1 }),
      input({ estimatedValueCents: Number.MAX_SAFE_INTEGER }),
    ];
    for (const c of cases) {
      const { total } = calculateOpportunityScore(c);
      expect(total).toBeGreaterThanOrEqual(0);
      expect(total).toBeLessThanOrEqual(100);
    }
  });

  it('ranks a relevant, urgent, uncontested opportunity above a vague large one', () => {
    const focused = calculateOpportunityScore(
      input({ relevance: 0.95, closesOn: days(10), competitorCount: 0, estimatedValueCents: 20_000_000 }),
    );
    const vague = calculateOpportunityScore(
      input({ relevance: 0.3, closesOn: days(200), competitorCount: 6, estimatedValueCents: 400_000_000 }),
    );
    expect(focused.total).toBeGreaterThan(vague.total);
  });

  it('responds to reweighting', () => {
    const lowValueHighRelevance = input({ relevance: 1, estimatedValueCents: 100_000 });
    const relevanceLed = calculateOpportunityScore(lowValueHighRelevance, { relevance: 0.8 });
    const valueLed = calculateOpportunityScore(lowValueHighRelevance, { potential_value: 0.8 });
    expect(relevanceLed.total).toBeGreaterThan(valueLed.total);
  });

  it('names its drivers strongest first', () => {
    const result = calculateOpportunityScore(input({ relevance: 1, confidence: 0.1 }));
    const points = result.drivers.map((d) => d.points);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
  });

  it('has weighted factors that sum to the total', () => {
    const result = calculateOpportunityScore(input());
    const summed = result.drivers.reduce((sum, d) => sum + d.points, 0);
    expect(summed).toBeCloseTo(result.total, 1);
  });

  it('is deterministic for a fixed asOf', () => {
    const fixed = input();
    const first = calculateOpportunityScore(fixed);
    for (let i = 0; i < 20; i += 1) {
      expect(calculateOpportunityScore(fixed)).toEqual(first);
    }
  });
});

describe('normaliseOpportunityWeights', () => {
  it('returns the specification defaults untouched', () => {
    expect(normaliseOpportunityWeights()).toEqual(DEFAULT_OPPORTUNITY_WEIGHTS);
  });

  it('rescales any override set to sum to 1', () => {
    const weights = normaliseOpportunityWeights({ relevance: 10, urgency: 10 });
    expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});

describe('explainOpportunityScore', () => {
  it('names the leading factors and the weakest one', () => {
    const result = calculateOpportunityScore(input({ relevance: 1, competitorCount: 6 }));
    const text = explainOpportunityScore(result);
    expect(text).toContain('markets');
    expect(text).toContain('uncontested');
    expect(text).toMatch(/\d+ out of 100/);
  });
});

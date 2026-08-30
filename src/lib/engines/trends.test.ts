import { describe, expect, it } from 'vitest';
import {
  analyseTrend,
  detectAnomalies,
  detectDivergence,
  detectStepChange,
  isFavourable,
  type SeriesPoint,
} from './trends';

/** Build a monthly series from bare numbers. */
const series = (values: readonly number[]): SeriesPoint[] =>
  values.map((value, i) => ({
    period: `2026-${String((i % 12) + 1).padStart(2, '0')}-01`,
    value,
  }));

describe('analyseTrend', () => {
  it('needs at least two points', () => {
    expect(analyseTrend([])).toBeNull();
    expect(analyseTrend(series([100]))).toBeNull();
  });

  it('reads a rising series as up', () => {
    const trend = analyseTrend(series([100, 110, 120, 130, 140]));
    expect(trend?.direction).toBe('up');
    expect(trend?.slope).toBe(10);
    expect(trend?.changePercent).toBe(40);
    expect(trend?.isMonotonic).toBe(true);
  });

  it('reads a falling series as down', () => {
    const trend = analyseTrend(series([140, 130, 120, 110, 100]));
    expect(trend?.direction).toBe('down');
    expect(trend?.slope).toBe(-10);
    expect(trend?.changePercent).toBeCloseTo(-28.57, 1);
  });

  it('calls a series that barely moves flat, not up', () => {
    const trend = analyseTrend(series([1000, 1001, 1000, 1002, 1001]));
    expect(trend?.direction).toBe('flat');
    expect(trend?.isSignificant).toBe(false);
  });

  it('judges significance relative to scale, not absolute size', () => {
    // The same absolute slope: meaningful for a small metric, noise for a large one.
    const small = analyseTrend(series([10, 20, 30, 40]));
    const large = analyseTrend(series([100_000, 100_010, 100_020, 100_030]));
    expect(small?.isSignificant).toBe(true);
    expect(large?.isSignificant).toBe(false);
  });

  it('does not call a series monotonic when it wobbles', () => {
    const trend = analyseTrend(series([100, 130, 120, 160, 190]));
    expect(trend?.direction).toBe('up');
    expect(trend?.isMonotonic).toBe(false);
  });

  it('reports no percentage change from a zero baseline rather than infinity', () => {
    const trend = analyseTrend(series([0, 50, 100]));
    expect(trend?.changePercent).toBeNull();
    expect(Number.isFinite(trend?.slope ?? Number.NaN)).toBe(true);
  });

  it('survives a series of all zeroes', () => {
    const trend = analyseTrend(series([0, 0, 0, 0]));
    expect(trend?.direction).toBe('flat');
    expect(trend?.normalisedSlope).toBe(0);
  });
});

describe('detectAnomalies', () => {
  it('says nothing about a series too short to judge', () => {
    expect(detectAnomalies(series([100, 102, 98, 101]))).toEqual([]);
  });

  it('finds a single spike in an otherwise steady series', () => {
    const found = detectAnomalies(series([100, 102, 98, 101, 99, 260, 100, 101]));
    expect(found).toHaveLength(1);
    expect(found[0]?.value).toBe(260);
    expect(found[0]?.direction).toBe('above');
    expect(found[0]?.deviations).toBeGreaterThan(2);
  });

  it('finds a collapse as readily as a spike', () => {
    const found = detectAnomalies(series([100, 102, 98, 101, 99, 12, 100, 101]));
    expect(found[0]?.direction).toBe('below');
  });

  it('leaves a healthy steady series alone', () => {
    expect(detectAnomalies(series([100, 103, 97, 101, 99, 102, 98, 100]))).toEqual([]);
  });

  it('does not flag steady growth as anomalous', () => {
    const growing = series(Array.from({ length: 24 }, (_, i) => 100 + i * 5));
    expect(detectAnomalies(growing)).toEqual([]);
  });

  it('stops flagging once the trailing window catches up to a new level', () => {
    // Steps to a new plateau and stays there for a long time.
    const stepped = series([...Array(6).fill(100), ...Array(12).fill(200)]);
    const found = detectAnomalies(stepped, { window: 6 });
    expect(found.length).toBeLessThanOrEqual(2);
    expect(found.every((a) => a.direction === 'above')).toBe(true);
  });

  it('is quiet on a perfectly flat series, which has no spread to measure', () => {
    expect(detectAnomalies(series(Array(12).fill(100)))).toEqual([]);
  });

  it('respects a stricter threshold', () => {
    // History here is very tight (sd ≈ 1.6), so 140 sits about 25 deviations
    // out — the threshold has to clear that to silence it.
    const points = series([100, 102, 98, 101, 99, 140, 100, 101]);
    expect(detectAnomalies(points, { threshold: 2 }).length).toBeGreaterThan(0);
    expect(detectAnomalies(points, { threshold: 30 })).toEqual([]);
  });

  it('scales the threshold to the series\' own volatility', () => {
    // The same 40% jump against a noisy history is not remarkable.
    const noisy = series([60, 140, 70, 130, 80, 140, 100, 101]);
    expect(detectAnomalies(noisy)).toEqual([]);
  });
});

describe('detectStepChange', () => {
  it('needs enough points on both sides', () => {
    expect(detectStepChange(series([100, 100, 200, 200]))).toBeNull();
  });

  it('finds where the level shifted', () => {
    const step = detectStepChange(series([100, 102, 99, 101, 160, 162, 159, 161]));
    expect(step).not.toBeNull();
    expect(step?.index).toBe(4);
    expect(step?.direction).toBe('up');
    expect(step?.changePercent).toBeCloseTo(59.7, 0);
  });

  it('finds a downward step', () => {
    const step = detectStepChange(series([200, 202, 199, 201, 100, 102, 99, 101]));
    expect(step?.direction).toBe('down');
  });

  it('ignores a shift too small to be worth a conversation', () => {
    expect(detectStepChange(series([100, 101, 99, 100, 104, 105, 103, 104]))).toBeNull();
  });

  it('reports nothing for a stable series', () => {
    expect(detectStepChange(series([100, 101, 99, 100, 101, 99, 100, 101]))).toBeNull();
  });

  it('honours a custom minimum', () => {
    const gentle = series([100, 101, 99, 100, 112, 113, 111, 112]);
    expect(detectStepChange(gentle, 50)).toBeNull();
    expect(detectStepChange(gentle, 5)).not.toBeNull();
  });
});

describe('detectDivergence', () => {
  it('finds spend rising while results fall', () => {
    const spend = series([100, 110, 120, 127]);
    const leads = series([100, 96, 92, 89]);
    const divergence = detectDivergence(spend, leads);
    expect(divergence).not.toBeNull();
    expect(divergence?.changeA).toBe(27);
    expect(divergence?.changeB).toBe(-11);
    expect(divergence?.gap).toBe(38);
    expect(divergence?.direction).toBe('a_outpacing_b');
  });

  it('reports the other direction when the second series leads', () => {
    const divergence = detectDivergence(series([100, 98, 95]), series([100, 130, 160]));
    expect(divergence?.direction).toBe('b_outpacing_a');
  });

  it('stays silent when two metrics move together', () => {
    expect(detectDivergence(series([100, 110, 120]), series([100, 108, 118]))).toBeNull();
  });

  it('compares over the shorter of the two histories', () => {
    const long = series([500, 400, 300, 200, 100, 110, 120]);
    const short = series([100, 96, 92]);
    const divergence = detectDivergence(long, short);
    // Only the last three of the long series count, where it rose.
    expect(divergence?.changeA).toBeGreaterThan(0);
  });

  it('needs three comparable periods', () => {
    expect(detectDivergence(series([100, 200]), series([100, 50]))).toBeNull();
  });

  it('declines to divide by a zero baseline', () => {
    expect(detectDivergence(series([0, 100, 200]), series([100, 90, 80]))).toBeNull();
  });
});

describe('isFavourable', () => {
  it('knows that rising revenue is good and rising cost is not', () => {
    expect(isFavourable('up', true)).toBe(true);
    expect(isFavourable('up', false)).toBe(false);
    expect(isFavourable('down', false)).toBe(true);
    expect(isFavourable('down', true)).toBe(false);
  });

  it('has no opinion about a flat metric', () => {
    expect(isFavourable('flat', true)).toBeNull();
  });
});

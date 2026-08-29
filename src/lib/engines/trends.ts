/**
 * Change detection for the AI DigitalTwin® (specification §8).
 *
 * Four questions, each answered by a pure function over a metric series:
 *
 *   analyseTrend      Which way is this going, and does the move mean anything?
 *   detectAnomalies   Which individual readings do not belong?
 *   detectStepChange  Did the level shift at a point, rather than drift?
 *   detectDivergence  Did two metrics that normally move together come apart?
 *
 * Everything is deterministic and free of I/O, so the twin's findings can be
 * regression-tested and reproduced from stored data at any later date.
 */
import { linearSlope, mean, percentChange, roundTo, standardDeviation } from '@/lib/utils/number';
import type { Enums } from '@/types/database';

export type TrendDirection = Enums['trend_direction'];

export interface SeriesPoint {
  /** Period start, ISO date. Points are assumed evenly spaced and sorted. */
  period: string;
  value: number;
}

export interface TrendAnalysis {
  direction: TrendDirection;
  /** Change per period, in the metric's own unit. */
  slope: number;
  /** Total change across the window, as a percentage of the first value. */
  changePercent: number | null;
  /** Slope as a share of the mean — comparable across metrics of any scale. */
  normalisedSlope: number;
  /** Whether the movement is large enough to be worth reporting. */
  isSignificant: boolean;
  /** True when every step moves the same way. */
  isMonotonic: boolean;
  first: number;
  last: number;
  mean: number;
  periods: number;
}

/**
 * A period-on-period move smaller than this share of the mean is noise for
 * reporting purposes. Chosen so that a metric drifting under 1.5% a period does
 * not fill the intelligence feed.
 */
const SIGNIFICANCE_THRESHOLD = 0.015;

export function analyseTrend(points: readonly SeriesPoint[]): TrendAnalysis | null {
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const avg = mean(values);
  const slope = linearSlope(values);
  const normalisedSlope = avg === 0 ? 0 : slope / Math.abs(avg);

  const isSignificant = Math.abs(normalisedSlope) >= SIGNIFICANCE_THRESHOLD;
  const direction: TrendDirection = !isSignificant ? 'flat' : slope > 0 ? 'up' : 'down';

  let monotonicUp = true;
  let monotonicDown = true;
  for (let i = 1; i < values.length; i += 1) {
    const previous = values[i - 1] ?? 0;
    const current = values[i] ?? 0;
    if (current < previous) monotonicUp = false;
    if (current > previous) monotonicDown = false;
  }

  return {
    direction,
    slope: roundTo(slope, 4),
    changePercent: percentChange(first, last) === null ? null : roundTo(percentChange(first, last)!, 2),
    normalisedSlope: roundTo(normalisedSlope, 6),
    isSignificant,
    isMonotonic: monotonicUp || monotonicDown,
    first,
    last,
    mean: roundTo(avg, 4),
    periods: values.length,
  };
}

export interface Anomaly {
  period: string;
  value: number;
  /** How many standard deviations from the expected value. */
  deviations: number;
  expected: number;
  direction: 'above' | 'below';
}

export interface AnomalyOptions {
  /** Readings beyond this many standard deviations are flagged. */
  threshold?: number;
  /** Periods of history used to form the expectation. */
  window?: number;
}

/**
 * Flags readings that do not fit their own recent history.
 *
 * The expectation is built from a trailing window rather than the whole series,
 * so a metric that has legitimately changed level stops flagging every reading
 * once the window has caught up. A short series returns nothing rather than
 * inventing significance from four data points.
 */
export function detectAnomalies(
  points: readonly SeriesPoint[],
  options: AnomalyOptions = {},
): Anomaly[] {
  const threshold = options.threshold ?? 2;
  const window = options.window ?? 6;
  const minimumHistory = 4;

  if (points.length < minimumHistory + 1) return [];

  const anomalies: Anomaly[] = [];

  for (let i = minimumHistory; i < points.length; i += 1) {
    const point = points[i];
    if (!point) continue;

    const history = points.slice(Math.max(0, i - window), i).map((p) => p.value);
    if (history.length < minimumHistory) continue;

    const expected = mean(history);
    const deviation = standardDeviation(history);

    // A perfectly flat history has no spread to measure against; any change is
    // then either exact or a step, and detectStepChange is the right tool.
    if (deviation === 0) continue;

    const deviations = (point.value - expected) / deviation;
    if (Math.abs(deviations) >= threshold) {
      anomalies.push({
        period: point.period,
        value: point.value,
        deviations: roundTo(deviations, 2),
        expected: roundTo(expected, 2),
        direction: deviations > 0 ? 'above' : 'below',
      });
    }
  }

  return anomalies;
}

export interface StepChange {
  /** The first period at the new level. */
  period: string;
  index: number;
  meanBefore: number;
  meanAfter: number;
  changePercent: number | null;
  direction: 'up' | 'down';
}

/**
 * Finds the single point at which the series' level shifted.
 *
 * A gradual drift and a step change look similar in a slope but call for very
 * different conversations: drift is a trend to manage, a step is an event with
 * a cause and a date. This splits the series at every candidate point and keeps
 * the split with the largest difference in means, provided that difference
 * clears `minChangePercent`.
 */
export function detectStepChange(
  points: readonly SeriesPoint[],
  minChangePercent = 10,
): StepChange | null {
  const minimumSide = 3;
  if (points.length < minimumSide * 2) return null;

  let best: StepChange | null = null;
  let bestGap = 0;

  for (let split = minimumSide; split <= points.length - minimumSide; split += 1) {
    const before = points.slice(0, split).map((p) => p.value);
    const after = points.slice(split).map((p) => p.value);
    const meanBefore = mean(before);
    const meanAfter = mean(after);
    const gap = Math.abs(meanAfter - meanBefore);

    if (gap > bestGap) {
      const period = points[split]?.period;
      if (!period) continue;
      bestGap = gap;
      best = {
        period,
        index: split,
        meanBefore: roundTo(meanBefore, 2),
        meanAfter: roundTo(meanAfter, 2),
        changePercent:
          percentChange(meanBefore, meanAfter) === null
            ? null
            : roundTo(percentChange(meanBefore, meanAfter)!, 2),
        direction: meanAfter > meanBefore ? 'up' : 'down',
      };
    }
  }

  if (!best) return null;
  if (best.changePercent === null || Math.abs(best.changePercent) < minChangePercent) return null;
  return best;
}

export interface Divergence {
  changeA: number;
  changeB: number;
  /** Percentage points separating the two movements. */
  gap: number;
  direction: 'a_outpacing_b' | 'b_outpacing_a';
}

/**
 * Detects two metrics coming apart — the shape behind findings like "marketing
 * spend rose 27% while lead generation fell 11%".
 *
 * Both series are compared over the same trailing window, so a divergence is
 * never an artefact of one metric having a longer history than the other.
 */
export function detectDivergence(
  seriesA: readonly SeriesPoint[],
  seriesB: readonly SeriesPoint[],
  minGapPercent = 15,
): Divergence | null {
  const periods = Math.min(seriesA.length, seriesB.length);
  if (periods < 3) return null;

  const tailA = seriesA.slice(-periods);
  const tailB = seriesB.slice(-periods);

  const changeA = percentChange(tailA[0]?.value ?? 0, tailA[periods - 1]?.value ?? 0);
  const changeB = percentChange(tailB[0]?.value ?? 0, tailB[periods - 1]?.value ?? 0);
  if (changeA === null || changeB === null) return null;

  const gap = changeA - changeB;
  if (Math.abs(gap) < minGapPercent) return null;

  return {
    changeA: roundTo(changeA, 2),
    changeB: roundTo(changeB, 2),
    gap: roundTo(Math.abs(gap), 2),
    direction: gap > 0 ? 'a_outpacing_b' : 'b_outpacing_a',
  };
}

/**
 * Whether a movement is good news, given which way the metric should go.
 * Kept separate from direction so the UI never has to reason about it.
 */
export function isFavourable(direction: TrendDirection, higherIsBetter: boolean): boolean | null {
  if (direction === 'flat') return null;
  return higherIsBetter ? direction === 'up' : direction === 'down';
}

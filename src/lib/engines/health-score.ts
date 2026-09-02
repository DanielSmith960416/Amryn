/**
 * Business Health Score (specification §26).
 *
 * The score answers one question — "is this business in good shape?" — and it
 * has to answer it the same way every month, or the trend line means nothing.
 * So the calculation is deterministic, pure, and explains itself: every score
 * carries the metrics that produced it and what each contributed.
 *
 * Shape of the calculation:
 *
 *   metric value  →  achievement against target  →  0-100 metric score
 *   metric scores →  weighted mean within category  →  category score
 *   category scores → weighted mean across categories → overall score
 *
 * Weights are configurable per organisation. Categories with no data are
 * dropped and the remaining weights renormalised, so an organisation that has
 * connected only its accounting system still gets an honest score rather than
 * one dragged to zero by the data it has not connected yet.
 */
import { clamp, roundTo } from '@/lib/utils/number';
import type { Enums } from '@/types/database';

export type HealthCategory = Enums['health_category'];

export const HEALTH_CATEGORIES: readonly HealthCategory[] = [
  'financial',
  'operational',
  'sales',
  'growth',
  'customer',
  'strategic',
] as const;

/** Default weighting from the specification. Sums to 1. */
export const DEFAULT_HEALTH_WEIGHTS: Readonly<Record<HealthCategory, number>> = {
  financial: 0.25,
  operational: 0.2,
  sales: 0.2,
  growth: 0.15,
  customer: 0.1,
  strategic: 0.1,
};

export type HealthClassification = 'excellent' | 'healthy' | 'attention' | 'at_risk' | 'critical';

/** One metric as the score calculation needs to see it. */
export interface HealthMetricInput {
  key: string;
  label: string;
  category: HealthCategory;
  /** Relative importance inside its category. Renormalised, so any scale works. */
  weight: number;
  value: number;
  target: number | null;
  higherIsBetter: boolean;
}

export interface MetricContribution {
  key: string;
  label: string;
  category: HealthCategory;
  value: number;
  target: number;
  /** 0-100 score for this metric alone. */
  score: number;
  /** Share of the overall score this metric accounted for, in points. */
  contribution: number;
  /** How far past (or short of) target, as a ratio. 1.0 is exactly on target. */
  achievement: number;
}

export interface CategoryScore {
  category: HealthCategory;
  score: number;
  weight: number;
  metricCount: number;
}

export interface HealthScoreResult {
  score: number;
  classification: HealthClassification;
  categories: CategoryScore[];
  contributions: MetricContribution[];
  /** Categories that were dropped for want of data, so the UI can say so. */
  missingCategories: HealthCategory[];
  weights: Record<HealthCategory, number>;
}

/**
 * Hitting target scores 80, not 100 — a business exactly on plan is healthy,
 * not exceptional. The remaining 20 points are earned by beating target, and
 * are fully earned at 25% above it.
 */
const ON_TARGET_SCORE = 80;
const OUTPERFORMANCE_CEILING = 0.25;

export function scoreMetric(input: HealthMetricInput): number | null {
  const { value, target, higherIsBetter } = input;
  if (target === null || !Number.isFinite(target) || target === 0) return null;
  if (!Number.isFinite(value)) return null;

  const achievement = metricAchievement(value, target, higherIsBetter);
  if (achievement === null) return null;

  if (achievement <= 1) {
    return clamp(achievement * ON_TARGET_SCORE, 0, ON_TARGET_SCORE);
  }
  const overshoot = clamp((achievement - 1) / OUTPERFORMANCE_CEILING, 0, 1);
  return ON_TARGET_SCORE + overshoot * (100 - ON_TARGET_SCORE);
}

/**
 * How much of the target was achieved. For metrics where lower is better the
 * ratio inverts, so "operating cost of 500 against a 620 target" achieves 1.24
 * rather than 0.81.
 */
export function metricAchievement(
  value: number,
  target: number,
  higherIsBetter: boolean,
): number | null {
  if (target === 0) return null;
  if (higherIsBetter) {
    return value / target;
  }
  // Zero or negative cost is not a meaningful ratio; treat it as fully achieved.
  if (value <= 0) return 1 + OUTPERFORMANCE_CEILING;
  return target / value;
}

export function classify(score: number): HealthClassification {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'healthy';
  if (score >= 60) return 'attention';
  if (score >= 40) return 'at_risk';
  return 'critical';
}

export function calculateHealthScore(
  metrics: readonly HealthMetricInput[],
  weightOverrides?: Partial<Record<HealthCategory, number>>,
): HealthScoreResult {
  const weights = normaliseWeights(weightOverrides);

  const contributions: MetricContribution[] = [];
  const categories: CategoryScore[] = [];
  const missingCategories: HealthCategory[] = [];

  // 1. Score each category from the metrics that carry a usable target.
  const scoredByCategory = new Map<HealthCategory, { score: number; weight: number }[]>();

  for (const metric of metrics) {
    const score = scoreMetric(metric);
    if (score === null) continue;
    const bucket = scoredByCategory.get(metric.category) ?? [];
    bucket.push({ score, weight: Math.max(metric.weight, 0) });
    scoredByCategory.set(metric.category, bucket);
  }

  for (const category of HEALTH_CATEGORIES) {
    const bucket = scoredByCategory.get(category);
    if (!bucket || bucket.length === 0) {
      missingCategories.push(category);
      continue;
    }
    categories.push({
      category,
      score: roundTo(weightedMean(bucket), 2),
      weight: weights[category],
      metricCount: bucket.length,
    });
  }

  // 2. Renormalise across the categories that actually have data.
  const presentWeight = categories.reduce((sum, c) => sum + c.weight, 0);
  const overall =
    presentWeight === 0
      ? 0
      : categories.reduce((sum, c) => sum + c.score * (c.weight / presentWeight), 0);

  // 3. Attribute the overall score back to individual metrics, so the card can
  //    show what is actually holding the number up or dragging it down.
  for (const metric of metrics) {
    const score = scoreMetric(metric);
    if (score === null || metric.target === null) continue;

    const bucket = scoredByCategory.get(metric.category) ?? [];
    const categoryWeightTotal = bucket.reduce((sum, m) => sum + m.weight, 0);
    const withinCategory =
      categoryWeightTotal === 0
        ? 1 / Math.max(bucket.length, 1)
        : Math.max(metric.weight, 0) / categoryWeightTotal;
    const categoryShare = presentWeight === 0 ? 0 : weights[metric.category] / presentWeight;

    contributions.push({
      key: metric.key,
      label: metric.label,
      category: metric.category,
      value: metric.value,
      target: metric.target,
      score: roundTo(score, 2),
      contribution: roundTo(score * withinCategory * categoryShare, 2),
      achievement: roundTo(
        metricAchievement(metric.value, metric.target, metric.higherIsBetter) ?? 0,
        4,
      ),
    });
  }

  contributions.sort((a, b) => a.score - b.score);

  const rounded = roundTo(clamp(overall, 0, 100), 2);
  return {
    score: rounded,
    classification: classify(rounded),
    categories,
    contributions,
    missingCategories,
    weights,
  };
}

function weightedMean(items: readonly { score: number; weight: number }[]): number {
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  if (totalWeight === 0) {
    return items.reduce((sum, i) => sum + i.score, 0) / items.length;
  }
  return items.reduce((sum, i) => sum + i.score * (i.weight / totalWeight), 0);
}

/**
 * Fills gaps from the defaults and rescales so the weights sum to 1. An
 * organisation that sets three weights to 0.5 each gets a valid weighting
 * rather than a score above 100.
 */
export function normaliseWeights(
  overrides?: Partial<Record<HealthCategory, number>>,
): Record<HealthCategory, number> {
  const merged = { ...DEFAULT_HEALTH_WEIGHTS } as Record<HealthCategory, number>;
  if (overrides) {
    for (const category of HEALTH_CATEGORIES) {
      const value = overrides[category];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        merged[category] = value;
      }
    }
  }

  const total = HEALTH_CATEGORIES.reduce((sum, c) => sum + merged[c], 0);
  if (total === 0) return { ...DEFAULT_HEALTH_WEIGHTS };

  const result = {} as Record<HealthCategory, number>;
  for (const category of HEALTH_CATEGORIES) {
    result[category] = merged[category] / total;
  }
  return result;
}

export const HEALTH_CLASSIFICATION_LABELS: Readonly<Record<HealthClassification, string>> = {
  excellent: 'Excellent',
  healthy: 'Healthy',
  attention: 'Attention required',
  at_risk: 'At risk',
  critical: 'Critical',
};

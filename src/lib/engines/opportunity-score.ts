/**
 * Opportunity Scoring Engine (specification §27).
 *
 * An opportunity score is a ranking device, not a prediction. Its job is to put
 * the four things worth doing this month above the forty that are merely true.
 * Every factor is scored 0-100 from evidence the platform actually holds, then
 * combined under configurable weights.
 *
 * Competition is scored inversely — an uncontested opportunity scores high on
 * the "competition" factor — so that every factor points the same way and the
 * weighted sum needs no special cases.
 */
import { clamp, roundTo } from '@/lib/utils/number';
import type { Enums } from '@/types/database';

export type OpportunityFactor =
  | 'relevance'
  | 'potential_value'
  | 'strategic_alignment'
  | 'urgency'
  | 'confidence'
  | 'competition';

export const OPPORTUNITY_FACTORS: readonly OpportunityFactor[] = [
  'relevance',
  'potential_value',
  'strategic_alignment',
  'urgency',
  'confidence',
  'competition',
] as const;

/** Default weighting from the specification. Sums to 1. */
export const DEFAULT_OPPORTUNITY_WEIGHTS: Readonly<Record<OpportunityFactor, number>> = {
  relevance: 0.25,
  potential_value: 0.2,
  strategic_alignment: 0.2,
  urgency: 0.15,
  confidence: 0.1,
  competition: 0.1,
};

export type OpportunityClassification = 'high_priority' | 'strong' | 'potential' | 'monitor';

export interface OpportunityScoreInput {
  /** 0-1. How well the signal matches this organisation's markets and categories. */
  relevance: number;
  /** Estimated value in minor units (cents). Scored against the org's own scale. */
  estimatedValueCents: number | null;
  /** 0-1. Overlap with the organisation's declared growth intents. */
  strategicAlignment: number;
  /** When the window closes. Null means no known deadline. */
  closesOn: Date | null;
  /** 0-1. How much the underlying evidence can be trusted. */
  confidence: number;
  /** Known competitors positioned for the same opportunity. */
  competitorCount: number;
  /**
   * The value of a large-but-normal opportunity for this organisation, in
   * cents. Scoring against the organisation's own scale is what stops a
   * R2m opportunity reading the same for a corner shop and a national group.
   */
  valueBenchmarkCents: number;
  /** The moment "now" is measured from. Injected so scoring is testable. */
  asOf?: Date;
}

export interface OpportunityScoreResult {
  total: number;
  classification: OpportunityClassification;
  factors: Record<OpportunityFactor, number>;
  weights: Record<OpportunityFactor, number>;
  /** Factors ordered by how many points they added, strongest first. */
  drivers: { factor: OpportunityFactor; score: number; points: number }[];
}

const DAY_MS = 86_400_000;

/**
 * Urgency curve. A window closing inside a fortnight is maximally urgent; one
 * more than six months out barely registers; one already closed scores zero.
 */
export function scoreUrgency(closesOn: Date | null, asOf: Date): number {
  if (closesOn === null) return 35; // unknown deadline: real, but not pressing
  const days = (closesOn.getTime() - asOf.getTime()) / DAY_MS;
  if (days < 0) return 0;
  if (days <= 14) return 100;
  if (days >= 180) return 10;
  // Linear decay between the two anchors.
  return roundTo(100 - ((days - 14) / (180 - 14)) * 90, 2);
}

/**
 * Value curve, logarithmic against the organisation's own benchmark. Ten times
 * the benchmark is worth more than the benchmark, but not ten times more —
 * beyond a point, size stops being the deciding factor.
 */
export function scoreValue(valueCents: number | null, benchmarkCents: number): number {
  if (valueCents === null || valueCents <= 0) return 20; // unquantified, not worthless
  const benchmark = benchmarkCents > 0 ? benchmarkCents : 1;
  const ratio = valueCents / benchmark;
  // ratio 0.1 → ~33, 1 → 66, 10 → 100
  const scaled = 66 + (Math.log10(ratio) * 100) / 3;
  return roundTo(clamp(scaled, 0, 100), 2);
}

/** More competitors, lower score. Five or more and the field is crowded. */
export function scoreCompetition(competitorCount: number): number {
  const count = Math.max(0, Math.floor(competitorCount));
  if (count === 0) return 100;
  if (count >= 5) return 20;
  return 100 - count * 16;
}

export function classifyOpportunity(total: number): OpportunityClassification {
  if (total >= 80) return 'high_priority';
  if (total >= 60) return 'strong';
  if (total >= 40) return 'potential';
  return 'monitor';
}

export function calculateOpportunityScore(
  input: OpportunityScoreInput,
  weightOverrides?: Partial<Record<OpportunityFactor, number>>,
): OpportunityScoreResult {
  const weights = normaliseOpportunityWeights(weightOverrides);
  const asOf = input.asOf ?? new Date();

  const factors: Record<OpportunityFactor, number> = {
    relevance: roundTo(clamp(input.relevance, 0, 1) * 100, 2),
    potential_value: scoreValue(input.estimatedValueCents, input.valueBenchmarkCents),
    strategic_alignment: roundTo(clamp(input.strategicAlignment, 0, 1) * 100, 2),
    urgency: scoreUrgency(input.closesOn, asOf),
    confidence: roundTo(clamp(input.confidence, 0, 1) * 100, 2),
    competition: scoreCompetition(input.competitorCount),
  };

  const drivers = OPPORTUNITY_FACTORS.map((factor) => ({
    factor,
    score: factors[factor],
    points: roundTo(factors[factor] * weights[factor], 2),
  })).sort((a, b) => b.points - a.points);

  const total = roundTo(
    clamp(
      OPPORTUNITY_FACTORS.reduce((sum, f) => sum + factors[f] * weights[f], 0),
      0,
      100,
    ),
    2,
  );

  return { total, classification: classifyOpportunity(total), factors, weights, drivers };
}

export function normaliseOpportunityWeights(
  overrides?: Partial<Record<OpportunityFactor, number>>,
): Record<OpportunityFactor, number> {
  const merged = { ...DEFAULT_OPPORTUNITY_WEIGHTS } as Record<OpportunityFactor, number>;
  if (overrides) {
    for (const factor of OPPORTUNITY_FACTORS) {
      const value = overrides[factor];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        merged[factor] = value;
      }
    }
  }

  const total = OPPORTUNITY_FACTORS.reduce((sum, f) => sum + merged[f], 0);
  if (total === 0) return { ...DEFAULT_OPPORTUNITY_WEIGHTS };

  const result = {} as Record<OpportunityFactor, number>;
  for (const factor of OPPORTUNITY_FACTORS) {
    result[factor] = merged[factor] / total;
  }
  return result;
}

/**
 * A short, human sentence explaining why an opportunity ranked where it did.
 * Written from the score itself so the explanation cannot drift from the number.
 */
export function explainOpportunityScore(result: OpportunityScoreResult): string {
  const [lead, second] = result.drivers;
  const weakest = [...result.drivers].sort((a, b) => a.score - b.score)[0];
  if (!lead || !second || !weakest) return 'Not enough evidence to rank this yet.';

  const label: Record<OpportunityFactor, string> = {
    relevance: 'how closely it matches your markets',
    potential_value: 'the value at stake',
    strategic_alignment: 'its fit with your growth intents',
    urgency: 'how soon the window closes',
    confidence: 'the strength of the evidence',
    competition: 'how uncontested it is',
  };

  return (
    `Ranked mainly on ${label[lead.factor]} and ${label[second.factor]}. ` +
    `The weakest factor is ${label[weakest.factor]}, at ${Math.round(weakest.score)} out of 100.`
  );
}

export const OPPORTUNITY_CLASSIFICATION_LABELS: Readonly<
  Record<OpportunityClassification, string>
> = {
  high_priority: 'High priority',
  strong: 'Strong opportunity',
  potential: 'Potential opportunity',
  monitor: 'Monitor',
};

/** Pipeline stages in the order the specification defines them. */
export const OPPORTUNITY_STAGES: readonly Enums['opportunity_stage'][] = [
  'discovered',
  'analysing',
  'qualified',
  'assigned',
  'in_progress',
  'won',
  'lost',
] as const;

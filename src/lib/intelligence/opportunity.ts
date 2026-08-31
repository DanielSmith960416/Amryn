import type {
  Opportunity,
  OpportunityClassification,
  ScoredOpportunity,
} from './types';

/**
 * The OpportunityRadar® scoring engine — OPPORTUNITY_DATABASE!M in the
 * prototype:
 *
 *   value/1000 × 0.25
 * + probability × 100 × 0.15
 * + strategicFit × 100 × 0.20
 * + urgency × 100 × 0.15
 * + (1 − effort) × 100 × 0.10
 * + probability × 100 × 0.15
 *
 * Two things about it are worth stating plainly, because they change how the
 * number should be read.
 *
 * **Probability is counted twice**, at 0.15 and again at 0.15 — an effective
 * 0.30 weight, the heaviest factor in the model. That is the prototype's
 * behaviour and it is preserved exactly, because changing it would silently
 * re-rank every opportunity the client has already seen. It is surfaced in
 * `explainScore` rather than left for someone to discover in a spreadsheet.
 *
 * **The value term is unbounded, and it saturates.** value/1000 × 0.25 means
 * R180,000 contributes 45 points and R2,000,000 would contribute 500, so a
 * large enough opportunity exceeds 100 on the value factor alone. The divisor
 * is calibrated for a business whose opportunities run to tens of thousands:
 * the value term alone reaches 100 at R400,000, and since the other five
 * factors contribute up to 75 points between them, anything above roughly
 * R100,000 can saturate depending on how it scores elsewhere.
 *
 * That has a consequence worth being explicit about: the reported score is
 * clamped to 100 so the "/100" on the card stays true, but **ranking uses the
 * unclamped score**. Sorting on the clamped figure would tie every saturated
 * opportunity at 100 and order them arbitrarily, which is precisely when a
 * ranked list stops being a ranking. `atCeiling` marks the affected ones so
 * the UI can say that two cards reading 100 are not equally attractive — they
 * are both off the top of a scale that was not built for deals this size.
 */

export const OPPORTUNITY_WEIGHTS = {
  value: 0.25,
  probability: 0.15,
  strategicFit: 0.2,
  urgency: 0.15,
  effort: 0.1,
  /** The prototype's second probability term. See the note above. */
  probabilitySecondary: 0.15,
} as const;

/** The value factor's divisor: R1,000 of estimated value is one point. */
export const VALUE_DIVISOR = 1000;

export const SCORE_CEILING = 100;

export interface ScoreFactor {
  factor: string;
  weight: number;
  contribution: number;
  note?: string;
}

/** The unclamped six-factor sum, exactly as the sheet computes it. */
export function rawOpportunityScore(o: Opportunity): number {
  const factors = opportunityFactors(o);
  return factors.reduce((total, f) => total + f.contribution, 0);
}

/** Each factor's contribution, for a card that has to justify its ranking. */
export function opportunityFactors(o: Opportunity): ScoreFactor[] {
  return [
    {
      factor: 'Estimated value',
      weight: OPPORTUNITY_WEIGHTS.value,
      contribution: (o.estValue / VALUE_DIVISOR) * OPPORTUNITY_WEIGHTS.value,
    },
    {
      factor: 'Probability',
      weight: OPPORTUNITY_WEIGHTS.probability,
      contribution: o.probability * 100 * OPPORTUNITY_WEIGHTS.probability,
    },
    {
      factor: 'Strategic fit',
      weight: OPPORTUNITY_WEIGHTS.strategicFit,
      contribution: o.strategicFit * 100 * OPPORTUNITY_WEIGHTS.strategicFit,
    },
    {
      factor: 'Urgency',
      weight: OPPORTUNITY_WEIGHTS.urgency,
      contribution: o.urgency * 100 * OPPORTUNITY_WEIGHTS.urgency,
    },
    {
      factor: 'Ease of execution',
      weight: OPPORTUNITY_WEIGHTS.effort,
      // Scored inversely: low effort scores high, so every factor points the
      // same way and the weighted sum needs no special cases.
      contribution: (1 - o.effort) * 100 * OPPORTUNITY_WEIGHTS.effort,
    },
    {
      factor: 'Probability (confidence weighting)',
      weight: OPPORTUNITY_WEIGHTS.probabilitySecondary,
      contribution: o.probability * 100 * OPPORTUNITY_WEIGHTS.probabilitySecondary,
      note: 'The prototype weights probability a second time, giving it 0.30 in total.',
    },
  ];
}

/** OPPORTUNITY_RADAR!P — >60 HIGH, >40 MEDIUM, otherwise MONITOR. */
export function classifyOpportunity(score: number): OpportunityClassification {
  if (score > 60) return 'HIGH';
  if (score > 40) return 'MEDIUM';
  return 'MONITOR';
}

export function scoreOpportunity(o: Opportunity): ScoredOpportunity {
  const rawScore = rawOpportunityScore(o);
  const score = Math.min(SCORE_CEILING, rawScore);
  return {
    ...o,
    score,
    rawScore,
    atCeiling: rawScore > SCORE_CEILING,
    classification: classifyOpportunity(score),
  };
}

/**
 * Scored and ranked — highest first, as OPPORTUNITY_RADAR presents them.
 *
 * The sort key is the **unclamped** score. Two opportunities that both saturate
 * still have an order, and it is the order the formula actually produces.
 */
export function rankOpportunities(opportunities: Opportunity[]): ScoredOpportunity[] {
  return opportunities.map(scoreOpportunity).sort((a, b) => b.rawScore - a.rawScore);
}

/**
 * The estimated value at which the value factor *alone* reaches the ceiling.
 *
 * Shown in the UI so a reader can see where the scale stops discriminating,
 * rather than discovering it by noticing two cards both reading 100. Note this
 * is the upper bound: an opportunity scoring well on fit and urgency saturates
 * well below it.
 */
export const VALUE_ONLY_CEILING =
  (SCORE_CEILING / OPPORTUNITY_WEIGHTS.value) * VALUE_DIVISOR;

export interface PipelineSummary {
  total: number;
  active: number;
  evaluating: number;
  planning: number;
  totalEstValue: number;
}

/** OPPORTUNITY_RADAR rows 4–5. */
export function pipelineSummary(opportunities: Opportunity[]): PipelineSummary {
  const countOf = (status: Opportunity['status']) =>
    opportunities.filter((o) => o.status === status).length;

  return {
    total: opportunities.length,
    active: countOf('Active'),
    evaluating: countOf('Evaluating'),
    planning: countOf('Planning'),
    totalEstValue: opportunities.reduce((total, o) => total + o.estValue, 0),
  };
}

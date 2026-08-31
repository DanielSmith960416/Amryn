import type { Risk, RiskClassification, ScoredRisk } from './types';

/**
 * The RiskRadar® engine — RISK_REGISTER!F and RISK_RADAR!Q in the prototype.
 *
 * Risk score is probability × impact, both on 0–1, so the score is also 0–1.
 * The prototype's EXECUTIVE_COMMAND quotes "Risk Score: 0.53" in exactly that
 * form, so the scale is kept rather than rescaled to 100 — a risk register and
 * a health score reading on the same scale would invite the wrong comparison.
 */

export function riskScore(risk: Pick<Risk, 'probability' | 'impact'>): number {
  return risk.probability * risk.impact;
}

/** RISK_RADAR!Q — >0.6 CRITICAL, >0.4 HIGH, >0.2 MEDIUM, otherwise LOW. */
export function classifyRisk(score: number): RiskClassification {
  if (score > 0.6) return 'CRITICAL';
  if (score > 0.4) return 'HIGH';
  if (score > 0.2) return 'MEDIUM';
  return 'LOW';
}

export function scoreRisk(risk: Risk): ScoredRisk {
  const score = riskScore(risk);
  return { ...risk, score, classification: classifyRisk(score) };
}

/**
 * Scored and ranked. Ties break on trend: of two risks scoring the same, the
 * one getting worse is the one to look at first.
 */
export function rankRisks(risks: Risk[]): ScoredRisk[] {
  const trendRank = { Worsening: 0, Stable: 1, Improving: 2 } as const;
  return risks
    .map(scoreRisk)
    .sort((a, b) => b.score - a.score || trendRank[a.trend] - trendRank[b.trend]);
}

export interface RiskSummary {
  total: number;
  open: number;
  monitoring: number;
  planning: number;
  highestScore: number;
  worsening: number;
}

/** RISK_RADAR rows 4–5. */
export function riskSummary(risks: Risk[]): RiskSummary {
  const countStatus = (status: Risk['status']) =>
    risks.filter((r) => r.status === status).length;

  return {
    total: risks.length,
    open: countStatus('Open'),
    monitoring: countStatus('Monitoring'),
    planning: countStatus('Planning'),
    highestScore: risks.length === 0 ? 0 : Math.max(...risks.map(riskScore)),
    worsening: risks.filter((r) => r.trend === 'Worsening').length,
  };
}

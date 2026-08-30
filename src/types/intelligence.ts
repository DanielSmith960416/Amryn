/**
 * The Business Context Object (specification §25).
 *
 * This is the single structure the AI reasoning layer is allowed to see. Raw
 * database rows never reach a language model: they are normalised into this
 * shape first, scoped to what the requesting user may read, and bounded in
 * size. Everything downstream — briefings, recommendations, the assistant —
 * reasons from this and nothing else.
 */
import type { Enums } from '@/types/database';
import type { HealthCategory, HealthScoreResult } from '@/lib/engines/health-score';
import type { Anomaly, StepChange, TrendAnalysis } from '@/lib/engines/trends';

export interface OrganisationContext {
  id: string;
  name: string;
  industry: string | null;
  currencyCode: string;
  countryCode: string;
  /** Declared markets, segments, capabilities and growth intents. */
  strategyProfile: {
    markets: string[];
    segments: string[];
    capabilities: string[];
    growthIntents: string[];
  };
  branchCount: number;
  /**
   * Sectors this organisation has chosen to see on its radar. Set by the
   * customer, not by Amryn — a wholesaler that bids for public supply work
   * gets those tenders like any other opportunity.
   */
  sectorScope: Enums['market_sector'][];
  /** How much of the business the reader is entitled to see. */
  viewerScope: {
    kind: Enums['scope_kind'];
    label: string;
    branchNames: string[];
  };
}

export interface MetricSnapshot {
  key: string;
  label: string;
  unit: string;
  category: HealthCategory | null;
  higherIsBetter: boolean;
  current: number;
  previous: number | null;
  target: number | null;
  changePercent: number | null;
  direction: Enums['trend_direction'];
  /** True when the direction of travel is the one the business wants. */
  favourable: boolean | null;
  /** Most recent periods, oldest first, for sparklines and trend reasoning. */
  series: { period: string; value: number }[];
  trend: TrendAnalysis | null;
}

export interface AnomalyContext {
  metricKey: string;
  metricLabel: string;
  anomalies: Anomaly[];
  stepChange: StepChange | null;
}

export interface OpportunityContext {
  id: string;
  title: string;
  kind: Enums['opportunity_kind'];
  stage: Enums['opportunity_stage'];
  sector: Enums['market_sector'];
  summary: string;
  whyItMatters: string | null;
  estimatedValueCents: number | null;
  score: number | null;
  classification: string | null;
  closesOn: string | null;
}

export interface RiskContext {
  id: string;
  title: string;
  category: string;
  severity: Enums['priority_level'];
  status: Enums['risk_status'];
  likelihood: number;
  impact: number;
  mitigation: string | null;
}

export interface GoalContext {
  id: string;
  title: string;
  status: Enums['goal_status'];
  unit: string;
  baseline: number | null;
  current: number | null;
  target: number;
  /** 0-1, clamped. How much of the distance from baseline to target is covered. */
  progress: number;
  dueOn: string;
  daysRemaining: number;
}

export interface SignalContext {
  id: string;
  kind: Enums['signal_kind'];
  title: string;
  summary: string;
  relevance: number;
  observedAt: string;
}

export interface CompetitorEventContext {
  competitorName: string;
  kind: string;
  title: string;
  impact: Enums['priority_level'];
  observedOn: string;
}

export interface DataHealthContext {
  sourceName: string;
  completeness: number;
  freshnessHours: number | null;
  status: Enums['connection_status'];
}

/** Everything the intelligence layer reasons from, and nothing more. */
export interface BusinessContext {
  organisation: OrganisationContext;
  /** The period the context describes, e.g. "the last 12 months to Aug 2026". */
  period: { start: string; end: string; label: string };
  health: HealthScoreResult | null;
  healthTrend: { previousScore: number | null; changePoints: number | null };
  metrics: MetricSnapshot[];
  anomalies: AnomalyContext[];
  opportunities: OpportunityContext[];
  risks: RiskContext[];
  goals: GoalContext[];
  signals: SignalContext[];
  competitorEvents: CompetitorEventContext[];
  dataHealth: DataHealthContext[];
  generatedAt: string;
}

/** A finding the briefing engine or the model produced. */
export interface Finding {
  direction: 'positive' | 'negative' | 'neutral' | 'opportunity';
  headline: string;
  detail: string;
  /** Where this came from, so a reader can check it. */
  evidence: { source: string; reference: string; note?: string }[];
}

export interface ExecutiveBriefing {
  /** One sentence a chief executive could read and act on. */
  headline: string;
  /** The supporting paragraph. */
  narrative: string;
  findings: Finding[];
  /** What to do next, most important first. */
  priorities: {
    priority: Enums['priority_level'];
    title: string;
    rationale: string;
    impactCents: number | null;
  }[];
  /** Whether a model wrote this or the deterministic engine did. */
  generatedBy: 'engine' | 'llm';
  generatedAt: string;
}

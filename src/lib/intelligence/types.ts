/**
 * Amryn™ AIGrowthIntelligence® — Intelligence Layer types.
 *
 * These shapes are lifted directly from the two Excel prototypes, which remain
 * the source of truth for the product logic:
 *
 *   · Amryn_AIGrowthIntelligence_Interactive_Software_Prototype.xlsx
 *   · Amryn_AIGrowthIntelligence__Advanced_Inventory_Control.xlsx
 *
 * Nothing in this directory performs I/O, reads a request, or calls a model.
 * Every function is pure, so a score can be tested, reproduced and explained.
 * The website is only the presentation layer over what is decided here.
 */

// ─── Business profile (prototype: SETTINGS, BUSINESS_PROFILE) ───────────────

export interface BusinessProfile {
  companyName: string;
  industry: string;
  location: string;
  /** ISO 4217. The prototypes are South African: ZAR (R). */
  currency: string;
  reportingPeriod: string;
  fiscalYearStart: string;
  branches: number;
  employees: number;
  founded: number;
  businessModel: string;
  /** SETTINGS!B12–B14 — exactly three, as the prototype models them. */
  strategicObjectives: string[];
  revenueTargetAnnual: number;
  grossMarginTarget: number;
  netProfitTarget: number;
  customerGrowthTarget: number;
}

// ─── Monthly financial series (prototype: DEMO_DATA rows 4–15) ──────────────

/**
 * One month of input. Only the raw fields are stored; every derived column in
 * the prototype (gross profit, margins, net cash) is computed in `deriveMonth`
 * rather than kept, so a stored figure can never disagree with its own formula.
 */
export interface MonthInput {
  month: string;
  revenue: number;
  cogs: number;
  opex: number;
  cashIn: number;
  cashOut: number;
  accountsReceivable: number;
  accountsPayable: number;
  newCustomers: number;
  totalCustomers: number;
  returns: number;
  marketingSpend: number;
}

export interface MonthDerived extends MonthInput {
  grossProfit: number;
  grossMargin: number;
  netProfit: number;
  netMargin: number;
  netCash: number;
}

// ─── Branches (prototype: DEMO_DATA rows 19–23, DIGITAL_TWIN) ───────────────

export type BranchStatus = 'HEALTHY' | 'STABLE' | 'ATTENTION';

export interface Branch {
  name: string;
  revenueYtd: number;
  grossProfit: number;
  netProfit: number;
  customers: number;
  staff: number;
  avgOrder: number;
  healthScore: number;
}

// ─── Business Health (prototype: BUSINESS_HEALTH) ───────────────────────────

export type HealthStatus = 'EXCELLENT' | 'HEALTHY' | 'STABLE' | 'WEAK' | 'CRITICAL';

export interface HealthComponent {
  /** BUSINESS_HEALTH!A5:A12 */
  component: string;
  /** BUSINESS_HEALTH!C5:C12 — the eight weights sum to 1.00. */
  weight: number;
  /** BUSINESS_HEALTH!E5:E12, clamped 0–100. */
  rawScore: number;
  /** BUSINESS_HEALTH!G5:G12 = raw × weight. */
  weightedScore: number;
  /** BUSINESS_HEALTH!I5:I12 — what the number is measuring. */
  description: string;
  /**
   * False where the prototype hard-codes a figure pending a real input
   * (Operational, People, Strategic). The card says so rather than implying
   * a measurement that has not been taken.
   */
  derived: boolean;
}

export interface HealthScore {
  components: HealthComponent[];
  /** BUSINESS_HEALTH!E13 = SUM(G5:G12) */
  overall: number;
  /** BUSINESS_HEALTH!E14 */
  status: HealthStatus;
}

// ─── Opportunities (prototype: OPPORTUNITY_DATABASE, OPPORTUNITY_RADAR) ─────

export type OpportunityStatus = 'Active' | 'Evaluating' | 'Planning';
export type OpportunityClassification = 'HIGH' | 'MEDIUM' | 'MONITOR';

export interface Opportunity {
  id: string;
  date: string;
  title: string;
  category: string;
  source: string;
  /** Estimated value in the profile's currency. */
  estValue: number;
  /** 0–1 */
  probability: number;
  /** 0–1 */
  strategicFit: number;
  /** 0–1 */
  urgency: number;
  /** 0–1, where 1 is the most effort. Scored inversely. */
  effort: number;
  owner: string;
  status: OpportunityStatus;
}

export interface ScoredOpportunity extends Opportunity {
  /** OPPORTUNITY_DATABASE!M, clamped to 100 so the "/100" on the card is true. */
  score: number;
  /** The unclamped sum. Ranking uses this, so saturated entries still order. */
  rawScore: number;
  /** True where the unclamped score exceeded 100 — the scale ran out. */
  atCeiling: boolean;
  /** OPPORTUNITY_RADAR!P — >60 HIGH, >40 MEDIUM, else MONITOR. */
  classification: OpportunityClassification;
}

// ─── Risk (prototype: RISK_REGISTER, RISK_RADAR) ────────────────────────────

export type RiskStatus = 'Open' | 'Monitoring' | 'Planning' | 'Closed';
export type RiskTrend = 'Worsening' | 'Stable' | 'Improving';
export type RiskClassification = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Risk {
  id: string;
  risk: string;
  category: string;
  /** 0–1 */
  probability: number;
  /** 0–1 */
  impact: number;
  owner: string;
  mitigation: string;
  dueDate: string;
  status: RiskStatus;
  trend: RiskTrend;
}

export interface ScoredRisk extends Risk {
  /** RISK_REGISTER!F = probability × impact. */
  score: number;
  /** RISK_RADAR!Q — >0.6 CRITICAL, >0.4 HIGH, >0.2 MEDIUM, else LOW. */
  classification: RiskClassification;
}

// ─── Actions (prototype: ACTION_CENTRE) ─────────────────────────────────────

export type ActionStatus = 'Not Started' | 'Planning' | 'In Progress' | 'Completed';
export type ActionPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Action {
  id: string;
  action: string;
  /** Where the action came from — Risk Register, Opportunity, Executive, System. */
  source: string;
  priority: ActionPriority;
  owner: string;
  status: ActionStatus;
  dueDate: string;
  expectedResult: string;
  /** 0–1 */
  completion: number;
  notes: string;
}

// ─── Decisions (prototype: DECISION_LOG) ────────────────────────────────────

export interface Decision {
  id: string;
  date: string;
  decision: string;
  reason: string;
  dataUsed: string;
  recommendation: string;
  decisionMaker: string;
  expectedOutcome: string;
  actualOutcome: string;
  lessonsLearned: string;
}

// ─── KPIs (prototype: KPI_CENTRE) ───────────────────────────────────────────

export type KpiStatus = 'ON TARGET' | 'NEAR TARGET' | 'BELOW TARGET';
export type KpiFormat = 'currency' | 'percent' | 'number' | 'score';

export interface Kpi {
  kpi: string;
  category: string;
  current: number;
  target: number;
  owner: string;
  format: KpiFormat;
  /**
   * True where a lower number is the better outcome (open risks, for
   * instance). The prototype's IFS assumes higher-is-better; stating the
   * direction explicitly stops "0 open risks" reading as a failure.
   */
  lowerIsBetter?: boolean;
}

export interface EvaluatedKpi extends Kpi {
  variance: number;
  variancePct: number;
  status: KpiStatus;
}

// ─── Market and competitors (prototype: MARKET_/COMPETITOR_INTELLIGENCE) ────

export type SignalDirection = 'Positive' | 'Negative' | 'Opportunity';
export type Confidence = 'High' | 'Medium' | 'Low';
export type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface MarketSignal {
  signal: string;
  type: string;
  direction: SignalDirection;
  confidence: Confidence;
  impact: ImpactLevel;
  implication: string;
  source: string;
  date: string;
}

export interface Competitor {
  competitor: string;
  products: string;
  pricing: string;
  location: string;
  threat: ImpactLevel;
  keyStrength: string;
  keyWeakness: string;
  opportunityCreated: string;
  lastUpdated: string;
}

// ─── Executive insight (prototype: EXECUTIVE_COMMAND) ───────────────────────

export type InsightKind =
  | 'TOP INSIGHT'
  | 'TOP OPPORTUNITY'
  | 'TOP RISK'
  | 'PRIORITY DECISION'
  | 'PRIORITY ACTION'
  | 'AI RECOMMENDATION';

/**
 * The prototype stamps every one of these "AI-SIMULATED" with a confidence.
 * That label is kept, verbatim, everywhere one is shown: these are computed by
 * the engines from the figures on the page, not asserted by a model.
 */
export interface ExecutiveInsight {
  kind: InsightKind;
  body: string;
  confidence: Confidence;
  /** The trailing metadata line — "Opportunity Score: 75/100", and so on. */
  meta: string;
  /** Where the finding came from, so it can be traced back. */
  basis: string;
}

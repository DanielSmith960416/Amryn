import {
  KALAHARI_ACTIONS,
  KALAHARI_BRANCHES,
  KALAHARI_COMPETITORS,
  KALAHARI_DECISIONS,
  KALAHARI_MONTHS,
  KALAHARI_OPPORTUNITIES,
  KALAHARI_PROFILE,
  KALAHARI_RISKS,
  KALAHARI_SIGNALS,
} from '@/data/demo/kalahari';
import {
  KIMKEM_AUDIT_SETTINGS,
  demoAuditDate,
  demoStockItems,
  type DemoAuditSettings,
} from '@/data/demo/inventory';
import {
  deriveMonths,
  forecast,
  twinTrends,
  yearToDate,
  type ForecastRow,
  type TwinTrend,
  type YearToDate,
} from '@/lib/intelligence/finance';
import { calculateHealthScore } from '@/lib/intelligence/health';
import {
  complianceProfile,
  complianceSummary,
  departmentMatrix,
  evaluateStock,
  ownerRecommendations,
  stockReportSections,
  type ComplianceProfile,
  type ComplianceSummary,
  type DepartmentRow,
  type OwnerRecommendation,
  type StockItem,
  type StockReportSections,
} from '@/lib/intelligence/inventory';
import { actionSummary, evaluateKpis, rankActions, type ActionSummary } from '@/lib/intelligence/kpi';
import {
  pipelineSummary,
  rankOpportunities,
  type PipelineSummary,
} from '@/lib/intelligence/opportunity';
import { rankRisks, riskSummary, type RiskSummary } from '@/lib/intelligence/risk';
import {
  executiveInsights,
  monthlyBrief,
  weeklyBrief,
  type BriefingInput,
  type WeeklyBrief,
} from '@/lib/intelligence/briefing';
import type {
  Action,
  Branch,
  BusinessProfile,
  Competitor,
  Decision,
  EvaluatedKpi,
  ExecutiveInsight,
  HealthScore,
  Kpi,
  MarketSignal,
  MonthDerived,
  ScoredOpportunity,
  ScoredRisk,
} from '@/lib/intelligence/types';

/**
 * The seam between the Intelligence Layer and everything that renders it.
 *
 * Every page in the client area, and the weekly PDF, reads one `Workspace`.
 * That is the whole point of the shape: the report and the screen cannot
 * disagree, because there is only one computation and they both read its
 * output. Swapping demo data for a client's real data is a change to
 * `loadWorkspace` alone — no page, component or engine is touched.
 */

export interface InventoryView {
  /**
   * Whether these figures come from a stocktake somebody recorded.
   *
   * False means the module is reachable and nothing has been counted yet —
   * which the screens have to say, because an empty compliance dashboard and
   * a compliant one look identical when every count is zero.
   */
  recorded: boolean;
  settings: DemoAuditSettings;
  profile: ComplianceProfile;
  auditDate: string;
  items: StockItem[];
  summary: ComplianceSummary;
  departments: { rows: DepartmentRow[]; total: DepartmentRow };
  sections: StockReportSections;
  recommendations: OwnerRecommendation[];
}

export interface Workspace {
  id: string;
  profile: BusinessProfile;
  /** True where the figures are illustrative rather than a real client's. */
  isDemo: boolean;
  asOf: Date;

  months: MonthDerived[];
  ytd: YearToDate;
  branches: Branch[];
  health: HealthScore;
  trends: TwinTrend[];
  forecast: ForecastRow[];

  opportunities: ScoredOpportunity[];
  pipeline: PipelineSummary;
  risks: ScoredRisk[];
  riskSummary: RiskSummary;
  actions: Action[];
  actionSummary: ActionSummary;
  decisions: Decision[];
  kpis: EvaluatedKpi[];

  competitors: Competitor[];
  signals: MarketSignal[];

  inventory: InventoryView;

  insights: ExecutiveInsight[];
  weekly: WeeklyBrief;
  monthly: WeeklyBrief;
}

/**
 * KPI_CENTRE rows 4–13, built from the figures rather than restated.
 *
 * The targets are the workbook's. "Risks Open" is marked `lowerIsBetter`,
 * which the sheet's own IFS gets backwards — see the note in `kpi.ts`.
 */
function buildKpis(args: {
  ytd: YearToDate;
  health: HealthScore;
  profile: BusinessProfile;
  actions: ActionSummary;
  opportunities: ScoredOpportunity[];
  risks: ScoredRisk[];
}): Kpi[] {
  const { ytd, health, profile, actions, opportunities, risks } = args;
  return [
    { kpi: 'Revenue YTD', category: 'Financial', current: ytd.revenue, target: 9_600_000, owner: 'CEO', format: 'currency' },
    { kpi: 'Gross Margin %', category: 'Financial', current: ytd.grossMargin, target: profile.grossMarginTarget, owner: 'CFO', format: 'percent' },
    { kpi: 'Net Profit YTD', category: 'Financial', current: ytd.netProfit, target: 1_152_000, owner: 'CEO', format: 'currency' },
    { kpi: 'Net Margin %', category: 'Financial', current: ytd.netMargin, target: profile.netProfitTarget, owner: 'CEO', format: 'percent' },
    { kpi: 'Total Customers', category: 'Customer', current: ytd.totalCustomers, target: 1_200, owner: 'Sales', format: 'number' },
    { kpi: 'New Customers YTD', category: 'Customer', current: ytd.newCustomers, target: 300, owner: 'Marketing', format: 'number' },
    { kpi: 'Business Health Score', category: 'Strategic', current: health.overall, target: 80, owner: 'CEO', format: 'score' },
    { kpi: 'Actions Completed %', category: 'Operations', current: actions.completionRate, target: 0.8, owner: 'CEO', format: 'percent' },
    { kpi: 'Opportunities Active', category: 'Growth', current: opportunities.filter((o) => o.status === 'Active').length, target: 3, owner: 'CEO', format: 'number' },
    { kpi: 'Risks Open', category: 'Risk', current: risks.filter((r) => r.status === 'Open').length, target: 0, owner: 'CEO', format: 'number', lowerIsBetter: true },
  ];
}

function buildInventory(asOf: Date): InventoryView {
  const settings = KIMKEM_AUDIT_SETTINGS;
  const profile = complianceProfile(settings.complianceProfileId);
  const items = evaluateStock(demoStockItems(asOf), asOf);
  const summary = complianceSummary(items);

  return {
    recorded: true,
    settings,
    profile,
    auditDate: demoAuditDate(asOf),
    items,
    summary,
    departments: departmentMatrix(items, profile.departments),
    sections: stockReportSections(items),
    recommendations: ownerRecommendations(summary, profile),
  };
}

/**
 * Builds the demonstration workspace.
 *
 * `asOf` is a parameter rather than a call to `new Date()` inside the engines,
 * so the whole workspace is reproducible: given a date, every score, status and
 * sentence is determined. That is what makes the engines testable and the
 * weekly PDF and the screen agree.
 */
export function loadWorkspace(asOf: Date = new Date()): Workspace {
  const profile = KALAHARI_PROFILE;
  const months = deriveMonths(KALAHARI_MONTHS);
  const ytd = yearToDate(months);
  const health = calculateHealthScore(months, ytd);
  const branches = KALAHARI_BRANCHES;

  const opportunities = rankOpportunities(KALAHARI_OPPORTUNITIES);
  const risks = rankRisks(KALAHARI_RISKS);
  const actions = rankActions(KALAHARI_ACTIONS);
  const actions_ = actionSummary(actions);
  const inventory = buildInventory(asOf);

  const briefingInput: BriefingInput = {
    profile,
    months,
    ytd,
    health,
    branches,
    opportunities,
    risks,
    actions,
    inventory: inventory.summary,
    asOf,
  };

  return {
    id: 'demo-kalahari',
    profile,
    isDemo: true,
    asOf,

    months,
    ytd,
    branches,
    health,
    trends: twinTrends(months, health.overall),
    forecast: forecast(ytd, profile.revenueTargetAnnual),

    opportunities,
    pipeline: pipelineSummary(opportunities),
    risks,
    riskSummary: riskSummary(risks),
    actions,
    actionSummary: actions_,
    decisions: KALAHARI_DECISIONS,
    kpis: evaluateKpis(
      buildKpis({ ytd, health, profile, actions: actions_, opportunities, risks }),
    ),

    competitors: KALAHARI_COMPETITORS,
    signals: KALAHARI_SIGNALS,

    inventory,

    insights: executiveInsights(briefingInput),
    weekly: weeklyBrief(briefingInput),
    monthly: monthlyBrief(briefingInput),
  };
}

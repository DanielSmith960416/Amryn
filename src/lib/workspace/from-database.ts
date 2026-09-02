import 'server-only';

/**
 * One organisation's own figures, in the shape the screens already render.
 *
 * `demo.ts` builds a `Workspace` from a fixed dataset. This builds the same
 * shape from the customer's rows, and hands it to the same pure engines — so a
 * score, a status or a sentence is arrived at identically whether the numbers
 * came from a spreadsheet in this repository or from the customer's accounting
 * package. That was the promise the seam was built for; this is it being kept.
 *
 * ── returning null is the point ───────────────────────────────────────────
 * A customer who has just finished setting up has told us what their business
 * is and has imported nothing. There is no honest workspace to build from
 * that: every margin would be zero, the health score would read CRITICAL, and
 * the forecast would project nothing onto nothing.
 *
 * Two wrong answers are available and both were in the product. Showing the
 * demonstration business puts another company's revenue on the customer's
 * Command Centre. Showing computed zeros invents a diagnosis from an absence
 * of data — and the health engine would dutifully report it as fact.
 *
 * So this returns null, the screens say what is missing and what to connect,
 * and nothing claims to have measured anything.
 */
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import {
  deriveMonths,
  forecast,
  twinTrends,
  yearToDate,
} from '@/lib/intelligence/finance';
import { calculateHealthScore } from '@/lib/intelligence/health';
import { actionSummary, evaluateKpis, rankActions } from '@/lib/intelligence/kpi';
import { pipelineSummary, rankOpportunities } from '@/lib/intelligence/opportunity';
import { rankRisks, riskSummary } from '@/lib/intelligence/risk';
import { executiveInsights, monthlyBrief, weeklyBrief } from '@/lib/intelligence/briefing';
import type { BriefingInput } from '@/lib/intelligence/briefing';
import type {
  Action,
  Branch,
  BusinessProfile,
  Competitor,
  Decision,
  ImpactLevel,
  Kpi,
  MonthInput,
  Opportunity,
  Risk,
} from '@/lib/intelligence/types';
import type { Row } from '@/types/database';
import type { Workspace } from './demo';
import { emptyInventory, inventoryFromAudit } from './inventory';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Cents to whole units. Every engine works in the profile's currency. */
function units(cents: number | null | undefined): number {
  return Math.round(((cents ?? 0) / 100) * 100) / 100;
}

/**
 * What the customer said about themselves during setup.
 *
 * Deliberately separate from anything measured: these are stated intentions,
 * and the moment a real figure exists for the same thing the real figure wins.
 * Kept under `stated` in strategy_profile for exactly that reason.
 */
interface StatedFigures {
  annualRevenue?: number;
  grossMarginTarget?: number;
  netMarginTarget?: number;
  customers?: number;
  revenueTargetAnnual?: number;
}

function stated(organisation: Row<'organisations'>): StatedFigures {
  const profile = organisation.strategy_profile as { stated?: StatedFigures } | null;
  return profile?.stated ?? {};
}

/* ── financial records → the monthly series the engines expect ─────────── */

/**
 * Cost of sales is a category, not a column.
 *
 * An importer writes whatever the source system called it, so this matches a
 * family of spellings rather than one. Anything else on the expense side is
 * operating expenditure — which is the right default: a cost that has not been
 * classified is still a cost, and quietly dropping it would overstate margin.
 */
const COGS = /^(cogs|cost of sales|cost of goods|direct costs?|purchases)$/i;
const MARKETING = /^(marketing|advertising|promotion)/i;

function monthlySeries(records: Row<'financial_records'>[]): MonthInput[] {
  const byMonth = new Map<string, MonthInput>();

  for (const record of records) {
    const date = new Date(record.occurred_on);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

    let month = byMonth.get(key);
    if (!month) {
      month = {
        month: `${MONTH_NAMES[date.getUTCMonth()]?.slice(0, 3)} ${date.getUTCFullYear()}`,
        revenue: 0,
        cogs: 0,
        opex: 0,
        cashIn: 0,
        cashOut: 0,
        // Not derivable from a ledger of income and expenditure. Left at zero
        // and reported as not measured rather than estimated — a receivables
        // figure invented from revenue would look like a measurement.
        accountsReceivable: 0,
        accountsPayable: 0,
        newCustomers: 0,
        totalCustomers: 0,
        returns: 0,
        marketingSpend: 0,
      };
      byMonth.set(key, month);
    }

    const amount = units(record.amount_cents);
    const category = record.category ?? '';

    if (record.direction === 'income') {
      month.revenue += amount;
      month.cashIn += amount;
    } else {
      month.cashOut += amount;
      if (COGS.test(category)) month.cogs += amount;
      else month.opex += amount;
      if (MARKETING.test(category)) month.marketingSpend += amount;
    }
  }

  // Chronological, because every engine that looks at a trend assumes it.
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, m]) => m);
}

/* ── the rest of the mapping ───────────────────────────────────────────── */

function toBranches(
  rows: Row<'branches'>[],
  records: Row<'financial_records'>[],
  overallHealth: number,
): Branch[] {
  return rows.map((branch) => {
    const mine = records.filter((r) => r.branch_id === branch.id);
    const revenue = units(
      mine.filter((r) => r.direction === 'income').reduce((sum, r) => sum + r.amount_cents, 0),
    );
    const costs = units(
      mine.filter((r) => r.direction !== 'income').reduce((sum, r) => sum + r.amount_cents, 0),
    );
    const cogs = units(
      mine
        .filter((r) => r.direction !== 'income' && COGS.test(r.category ?? ''))
        .reduce((sum, r) => sum + r.amount_cents, 0),
    );
    const orders = mine.filter((r) => r.direction === 'income').length;

    return {
      name: branch.name,
      revenueYtd: revenue,
      grossProfit: revenue - cogs,
      netProfit: revenue - costs,
      // Not held per branch. Zero reads as "not measured" on the card, which
      // is true, where a share of the organisation total would not be.
      customers: 0,
      staff: branch.headcount ?? 0,
      avgOrder: orders > 0 ? Math.round(revenue / orders) : 0,
      // Until there is enough per-branch history to score each one on its own,
      // every branch carries the organisation's score rather than a fabricated
      // one. The card says the same number everywhere, which is honest; a
      // spread of invented numbers would not be.
      healthScore: overallHealth,
    };
  });
}

const THREAT: Record<string, ImpactLevel> = {
  critical: 'HIGH',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

function toCompetitors(rows: Row<'competitors'>[]): Competitor[] {
  // An em dash rather than an empty string for the fields nothing fills yet:
  // a blank cell in a comparison table reads as "no threat", and "—" reads as
  // "not recorded", which is what it is. Naming a competitor during setup is
  // one line; the analysis of them comes from the radar once it runs.
  return rows.map((c) => ({
    competitor: c.name,
    products: c.description ?? '—',
    pricing: '—',
    location: (c.markets ?? []).join(', ') || '—',
    threat: THREAT[c.threat_level] ?? 'MEDIUM',
    keyStrength: '—',
    keyWeakness: '—',
    opportunityCreated: '—',
    lastUpdated: c.updated_at.slice(0, 10),
  }));
}

const RISK_STATUS: Record<string, Risk['status']> = {
  open: 'Open',
  mitigating: 'Planning',
  monitoring: 'Monitoring',
  closed: 'Closed',
  accepted: 'Closed',
};

function toRisks(rows: Row<'risks'>[]): Risk[] {
  return rows.map((r) => ({
    id: r.id,
    risk: r.title,
    category: r.category ?? 'General',
    probability: (r.likelihood ?? 0) / 5,
    impact: (r.impact ?? 0) / 5,
    owner: '—',
    mitigation: r.mitigation ?? '',
    dueDate: r.review_on ?? '',
    status: RISK_STATUS[r.status] ?? 'Open',
    // The register does not record a direction of travel yet, and inventing
    // one would drive the tie-break in the radar's ranking.
    trend: 'Stable',
  }));
}

const OPPORTUNITY_STATUS: Record<string, Opportunity['status']> = {
  discovered: 'Evaluating',
  analysing: 'Evaluating',
  qualified: 'Planning',
  assigned: 'Planning',
  in_progress: 'Active',
};

function toOpportunities(rows: Row<'opportunities'>[]): Opportunity[] {
  return rows.map((o) => ({
    id: o.id,
    date: o.created_at.slice(0, 10),
    title: o.title,
    category: o.kind,
    source: o.counterparty ?? 'Amryn',
    estValue: units(o.estimated_value_cents),
    // The database keeps one 0–100 score; the radar wants the four factors it
    // was built from. Until a scoring run records them separately, the stored
    // score stands in for probability and the rest are neutral — and the
    // factor breakdown on the card says so rather than showing invented
    // components.
    probability: Math.min(1, (o.score ?? 50) / 100),
    strategicFit: 0.5,
    urgency: 0.5,
    effort: 0.5,
    owner: '—',
    status: OPPORTUNITY_STATUS[o.stage] ?? 'Evaluating',
  }));
}

const ACTION_PRIORITY: Record<string, Action['priority']> = {
  critical: 'HIGH',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

const ACTION_STATUS: Record<string, Action['status']> = {
  new: 'Not Started',
  accepted: 'Planning',
  in_progress: 'In Progress',
  done: 'Completed',
  dismissed: 'Completed',
};

function toActions(rows: Row<'ai_recommendations'>[]): Action[] {
  return rows.map((r) => ({
    id: r.id,
    action: r.title,
    source: 'Amryn',
    priority: ACTION_PRIORITY[r.priority ?? 'medium'] ?? 'MEDIUM',
    owner: '—',
    status: ACTION_STATUS[r.status] ?? 'Not Started',
    dueDate: '',
    expectedResult: r.impact_note ?? r.recommended_action,
    completion: r.status === 'done' ? 1 : r.status === 'in_progress' ? 0.5 : 0,
    notes: r.why_it_matters,
  }));
}

function toDecisions(rows: Row<'goals'>[]): Decision[] {
  // The decision log has no table of its own yet. Goals are the nearest real
  // record of a decision taken, and showing them is better than showing the
  // demonstration company's board minutes.
  return rows.map((g) => ({
    id: g.id,
    date: g.created_at.slice(0, 10),
    decision: g.title,
    reason: g.description ?? '',
    dataUsed: '',
    recommendation: '',
    decisionMaker: '',
    expectedOutcome: `${g.target_value} ${g.unit}`,
    actualOutcome: g.current_value === null ? '' : `${g.current_value} ${g.unit}`,
    lessonsLearned: '',
  }));
}

/**
 * The most recently completed stocktake, evaluated.
 *
 * Completed, not merely started: a session somebody is halfway through would
 * report shelves as unchecked that simply have not been reached yet, and the
 * compliance figures would read as a finding rather than as progress.
 */
async function latestInventory(organisationId: string, asOf: Date) {
  const supabase = await createClient();

  const { data: audit } = await supabase
    .from('stock_audits')
    .select('*')
    .eq('organisation_id', organisationId)
    .eq('status', 'complete')
    .order('audit_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!audit) return emptyInventory(asOf);

  const { data: rows } = await supabase
    .from('stock_items')
    .select('*')
    .eq('audit_id', audit.id)
    .order('position');

  return inventoryFromAudit(audit, rows ?? [], asOf);
}

/* ── the loader ────────────────────────────────────────────────────────── */

export const organisationWorkspace = cache(
  async (organisationId: string, asOf: Date = new Date()): Promise<Workspace | null> => {
    const supabase = await createClient();

    const { data: organisation } = await supabase
      .from('organisations')
      .select('*')
      .eq('id', organisationId)
      .maybeSingle();

    if (!organisation) return null;

    // The gate. Everything below computes from this series, so without it
    // there is nothing to compute and the honest answer is "not yet".
    const { data: records } = await supabase
      .from('financial_records')
      .select('*')
      .eq('organisation_id', organisationId)
      .order('occurred_on');

    if (!records || records.length === 0) return null;

    const [
      { data: branchRows },
      { data: competitorRows },
      { data: riskRows },
      { data: opportunityRows },
      { data: recommendationRows },
      { data: goalRows },
    ] = await Promise.all([
      supabase.from('branches').select('*').eq('organisation_id', organisationId).is('deleted_at', null),
      supabase.from('competitors').select('*').eq('organisation_id', organisationId),
      supabase.from('risks').select('*').eq('organisation_id', organisationId),
      supabase.from('opportunities').select('*').eq('organisation_id', organisationId).is('deleted_at', null),
      supabase.from('ai_recommendations').select('*').eq('organisation_id', organisationId),
      supabase.from('goals').select('*').eq('organisation_id', organisationId),
    ]);

    const figures = stated(organisation);
    const months = deriveMonths(monthlySeries(records));
    const ytd = yearToDate(months);
    const health = calculateHealthScore(months, ytd);

    const profile: BusinessProfile = {
      companyName: organisation.name,
      industry: organisation.industry ?? 'Not stated',
      location: (branchRows ?? []).find((b) => b.city)?.city ?? organisation.country_code,
      currency: organisation.currency_code,
      reportingPeriod: months.length > 0 ? `${months[0]!.month} — ${months.at(-1)!.month}` : '',
      fiscalYearStart: MONTH_NAMES[organisation.fiscal_year_start - 1] ?? 'March',
      branches: (branchRows ?? []).length,
      employees: (branchRows ?? []).reduce((sum, b) => sum + (b.headcount ?? 0), 0),
      // Not asked during setup, and not worth inventing. The profile card
      // omits it rather than printing a year nobody supplied.
      founded: 0,
      businessModel: '',
      strategicObjectives: (goalRows ?? []).slice(0, 3).map((g) => g.title),
      revenueTargetAnnual: figures.revenueTargetAnnual ?? 0,
      grossMarginTarget: (figures.grossMarginTarget ?? 0) / 100,
      netProfitTarget: (figures.netMarginTarget ?? 0) / 100,
      customerGrowthTarget: 0,
    };

    const opportunities = rankOpportunities(toOpportunities(opportunityRows ?? []));
    const risks = rankRisks(toRisks(riskRows ?? []));
    const actions = rankActions(toActions(recommendationRows ?? []));
    const actions_ = actionSummary(actions);
    const branches = toBranches(branchRows ?? [], records, health.overall);

    // The most recent stocktake, or none. Deliberately the latest rather than
    // a merge of all of them: a stocktake is a statement about the shelves on
    // one day, and combining two of them would produce a shelf that never
    // existed.
    const inventory = await latestInventory(organisationId, asOf);

    // Only the ones there is a real figure for. A KPI whose current value is
    // an assumption is worse than a KPI that is absent: the centre exists to
    // say whether the business is on target, and it cannot do that about a
    // number nobody measured.
    const candidates: Kpi[] = [
      { kpi: 'Revenue YTD', category: 'Financial', current: ytd.revenue, target: profile.revenueTargetAnnual, owner: '—', format: 'currency' },
      { kpi: 'Gross Margin %', category: 'Financial', current: ytd.grossMargin, target: profile.grossMarginTarget, owner: '—', format: 'percent' },
      { kpi: 'Net Profit YTD', category: 'Financial', current: ytd.netProfit, target: profile.revenueTargetAnnual * profile.netProfitTarget, owner: '—', format: 'currency' },
      { kpi: 'Net Margin %', category: 'Financial', current: ytd.netMargin, target: profile.netProfitTarget, owner: '—', format: 'percent' },
      { kpi: 'Business Health Score', category: 'Strategic', current: health.overall, target: 80, owner: '—', format: 'score' },
      { kpi: 'Actions Completed %', category: 'Operations', current: actions_.completionRate, target: 0.8, owner: '—', format: 'percent' },
      { kpi: 'Opportunities Active', category: 'Growth', current: opportunities.filter((o) => o.status === 'Active').length, target: 3, owner: '—', format: 'number' },
      { kpi: 'Risks Open', category: 'Risk', current: risks.filter((r) => r.status === 'Open').length, target: 0, owner: '—', format: 'number', lowerIsBetter: true },
    ];

    // The annotation has to sit on the array rather than on the result: a
    // literal typed only through `.filter()` infers `format: string`, and the
    // engine wants the four names it accepts.
    const kpis = candidates.filter((kpi) => kpi.target > 0 || kpi.lowerIsBetter === true);

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
      id: organisation.id,
      profile,
      isDemo: false,
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
      decisions: toDecisions(goalRows ?? []),
      kpis: evaluateKpis(kpis),

      competitors: toCompetitors(competitorRows ?? []),
      // Signals arrive from the market scanners, which are a connector rather
      // than something a customer types in. None until one is connected.
      signals: [],

      inventory,

      insights: executiveInsights(briefingInput),
      weekly: weeklyBrief(briefingInput),
      monthly: monthlyBrief(briefingInput),
    };
  },
);

import { latestPair, safeDiv, type YearToDate } from './finance';
import type { HealthComponent, HealthScore, HealthStatus, MonthDerived } from './types';

/**
 * The Business Health Score engine — BUSINESS_HEALTH in the prototype.
 *
 * Eight weighted components, each scored 0–100 and clamped, summed by weight
 * into one number and then banded into a status. The weights and the banding
 * are the prototype's; they are stated here as data so a change is a change to
 * one table rather than to eight formulas.
 */

/** BUSINESS_HEALTH!C5:C12. Sums to 1.00. */
export const HEALTH_WEIGHTS = {
  financial: 0.2,
  sales: 0.15,
  customer: 0.15,
  operational: 0.15,
  marketing: 0.1,
  people: 0.1,
  cashFlow: 0.1,
  strategic: 0.05,
} as const;

/**
 * Assessments the prototype hard-codes because no input feeds them yet.
 *
 * These are the honest part of the model: an operational score of 70 is
 * somebody's judgement, not a measurement, and the UI marks it as such. Wire a
 * real input and pass a replacement rather than editing the constant.
 */
export const MANUAL_ASSESSMENTS = {
  operational: 70, // BUSINESS_HEALTH!E8
  people: 72, // BUSINESS_HEALTH!E10
  strategic: 68, // BUSINESS_HEALTH!E12
} as const;

/**
 * Written as its own shape rather than `typeof MANUAL_ASSESSMENTS`, which
 * `as const` narrows to the literals 70, 72 and 68 — making the defaults the
 * only values the parameter would accept.
 */
export interface ManualAssessments {
  operational: number;
  people: number;
  strategic: number;
}

/** Excel's MIN(100, MAX(0, x)) — every raw component score is clamped. */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** BUSINESS_HEALTH!E14 — the status bands, highest first. */
export function healthStatus(overall: number): HealthStatus {
  if (overall >= 90) return 'EXCELLENT';
  if (overall >= 75) return 'HEALTHY';
  if (overall >= 60) return 'STABLE';
  if (overall >= 40) return 'WEAK';
  return 'CRITICAL';
}

export function calculateHealthScore(
  months: MonthDerived[],
  ytd: YearToDate,
  manual: ManualAssessments = MANUAL_ASSESSMENTS,
): HealthScore {
  const { latest, previous } = latestPair(months);

  // E5: net margin against a benchmark. ×500 puts a 20% net margin at 100,
  // which is the prototype's implied ceiling for a healthy retail margin.
  const financial = latest
    ? clampScore(safeDiv(latest.netProfit, latest.revenue) * 500)
    : 50;

  // E6: revenue momentum is deliberately coarse — up scores 75, flat or down 50.
  // The prototype is asking a yes/no question, not measuring the size of a move.
  const sales = latest && previous ? (latest.revenue > previous.revenue ? 75 : 50) : 50;

  // E7: new-customer momentum, same shape, on a higher floor.
  const customer =
    latest && previous ? (latest.newCustomers > previous.newCustomers ? 80 : 60) : 60;

  // E9: acquisition rate — average new customers a month, ×1.5. The prototype
  // divides by a literal 8; dividing by the months actually reported keeps the
  // score stable as the year fills in instead of collapsing every January.
  const marketing = clampScore(
    safeDiv(ytd.newCustomers, ytd.monthsReported) * 1.5,
  );

  // E11: cash is a level test, like DIGITAL_TWIN's trend row.
  const cashFlow = latest ? (latest.netCash > 0 ? 80 : 40) : 60;

  const rows: Array<Omit<HealthComponent, 'weightedScore'>> = [
    {
      component: 'Financial Health',
      weight: HEALTH_WEIGHTS.financial,
      rawScore: financial,
      description: 'Net margin vs benchmark',
      derived: true,
    },
    {
      component: 'Sales Health',
      weight: HEALTH_WEIGHTS.sales,
      rawScore: sales,
      description: 'Revenue trend momentum',
      derived: true,
    },
    {
      component: 'Customer Health',
      weight: HEALTH_WEIGHTS.customer,
      rawScore: customer,
      description: 'Customer acquisition trend',
      derived: true,
    },
    {
      component: 'Operational Health',
      weight: HEALTH_WEIGHTS.operational,
      rawScore: clampScore(manual.operational),
      description: 'Manual operational assessment',
      derived: false,
    },
    {
      component: 'Marketing Health',
      weight: HEALTH_WEIGHTS.marketing,
      rawScore: marketing,
      description: 'Customer acquisition rate',
      derived: true,
    },
    {
      component: 'People Health',
      weight: HEALTH_WEIGHTS.people,
      rawScore: clampScore(manual.people),
      description: 'HR and workforce assessment',
      derived: false,
    },
    {
      component: 'Cash Flow Health',
      weight: HEALTH_WEIGHTS.cashFlow,
      rawScore: cashFlow,
      description: 'Net cash flow position',
      derived: true,
    },
    {
      component: 'Strategic Health',
      weight: HEALTH_WEIGHTS.strategic,
      rawScore: clampScore(manual.strategic),
      description: 'Strategic objective progress',
      derived: false,
    },
  ];

  const components: HealthComponent[] = rows.map((row) => ({
    ...row,
    weightedScore: row.rawScore * row.weight,
  }));

  const overall = components.reduce((total, c) => total + c.weightedScore, 0);

  return { components, overall, status: healthStatus(overall) };
}

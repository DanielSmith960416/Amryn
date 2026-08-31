import type { BranchStatus, MonthDerived, MonthInput } from './types';

/**
 * The derived columns of DEMO_DATA, as functions.
 *
 * The prototype computes gross profit, margins and net cash with formulas in
 * the sheet rather than storing them. Doing the same here means a stored figure
 * can never drift from its own definition.
 */
export function deriveMonth(m: MonthInput): MonthDerived {
  const grossProfit = m.revenue - m.cogs; // DEMO_DATA!D = B - C
  const netProfit = grossProfit - m.opex; // DEMO_DATA!G = D - F
  return {
    ...m,
    grossProfit,
    netProfit,
    grossMargin: safeDiv(grossProfit, m.revenue), // E = IFERROR(D/B, 0)
    netMargin: safeDiv(netProfit, m.revenue), // H = IFERROR(G/B, 0)
    netCash: m.cashIn - m.cashOut, // K = I - J
  };
}

export function deriveMonths(months: MonthInput[]): MonthDerived[] {
  return months.map(deriveMonth);
}

/**
 * A month counts towards year-to-date only once it has revenue.
 *
 * The prototype writes this as `SUMIF(A4:A15,"<>0", …)` across a twelve-row
 * table whose future months are zero-filled. Reporting an eight-month YTD as
 * if it were twelve would understate every average built on it.
 */
export function isReported(m: MonthDerived): boolean {
  return m.revenue !== 0;
}

export function reportedMonths(months: MonthDerived[]): MonthDerived[] {
  return months.filter(isReported);
}

export interface YearToDate {
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  netProfit: number;
  cashIn: number;
  cashOut: number;
  netCash: number;
  newCustomers: number;
  marketingSpend: number;
  /** DEMO_DATA!O of the latest reported month — a stock, not a sum. */
  totalCustomers: number;
  grossMargin: number;
  netMargin: number;
  /** How many months actually carry data. Every average divides by this. */
  monthsReported: number;
}

/** EXECUTIVE_COMMAND / FINANCIAL_INTELLIGENCE year-to-date roll-up. */
export function yearToDate(months: MonthDerived[]): YearToDate {
  const reported = reportedMonths(months);
  const sum = (pick: (m: MonthDerived) => number) =>
    reported.reduce((total, m) => total + pick(m), 0);

  const revenue = sum((m) => m.revenue);
  const grossProfit = sum((m) => m.grossProfit);
  const netProfit = sum((m) => m.netProfit);
  const latest = reported.at(-1);

  return {
    revenue,
    cogs: sum((m) => m.cogs),
    grossProfit,
    opex: sum((m) => m.opex),
    netProfit,
    cashIn: sum((m) => m.cashIn),
    cashOut: sum((m) => m.cashOut),
    netCash: sum((m) => m.netCash),
    newCustomers: sum((m) => m.newCustomers),
    marketingSpend: sum((m) => m.marketingSpend),
    totalCustomers: latest?.totalCustomers ?? 0,
    grossMargin: safeDiv(grossProfit, revenue),
    netMargin: safeDiv(netProfit, revenue),
    monthsReported: reported.length,
  };
}

/** The most recent month carrying data, and the one before it. */
export function latestPair(months: MonthDerived[]): {
  latest?: MonthDerived;
  previous?: MonthDerived;
} {
  const reported = reportedMonths(months);
  return { latest: reported.at(-1), previous: reported.at(-2) };
}

// ─── Trends (prototype: DIGITAL_TWIN rows 15–19) ────────────────────────────

export type TrendDirection = 'INCREASING' | 'GROWING' | 'IMPROVING' | 'STABLE' | 'DECLINING' | 'POSITIVE' | 'NEGATIVE';

export interface TwinTrend {
  label: string;
  direction: TrendDirection;
  /** The change that produced the reading, so the badge can be questioned. */
  detail: string;
}

/**
 * DIGITAL_TWIN's five trend rows, which compare the latest reported month
 * against the one before it. A single-month history yields STABLE rather than a
 * direction invented from one point.
 */
export function twinTrends(months: MonthDerived[], healthScore: number): TwinTrend[] {
  const { latest, previous } = latestPair(months);

  const compare = (
    label: string,
    up: TrendDirection,
    flat: TrendDirection,
    down: TrendDirection,
    pick: (m: MonthDerived) => number,
    format: (n: number) => string,
  ): TwinTrend => {
    if (!latest || !previous) {
      return { label, direction: flat, detail: 'Not enough history to compare' };
    }
    const now = pick(latest);
    const before = pick(previous);
    const direction = now > before ? up : now === before ? flat : down;
    return {
      label,
      direction,
      detail: `${format(before)} → ${format(now)} (${previous.month} → ${latest.month})`,
    };
  };

  const money = (n: number) => Math.round(n).toLocaleString('en-GB');
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const plain = (n: number) => n.toLocaleString('en-GB');

  return [
    compare('Revenue Trend', 'INCREASING', 'STABLE', 'DECLINING', (m) => m.revenue, money),
    compare('Customer Trend', 'GROWING', 'STABLE', 'STABLE', (m) => m.newCustomers, plain),
    {
      label: 'Cash Flow',
      // DIGITAL_TWIN!I17 tests the level, not the change: cash is positive or it is not.
      direction: (latest?.netCash ?? 0) > 0 ? 'POSITIVE' : 'NEGATIVE',
      detail: latest
        ? `Net cash ${money(latest.netCash)} in ${latest.month}`
        : 'No month reported yet',
    },
    compare('Gross Margin', 'IMPROVING', 'STABLE', 'STABLE', (m) => m.grossMargin, pct),
    {
      label: 'Overall Business',
      direction: healthScore >= 70 ? 'IMPROVING' : healthScore >= 55 ? 'STABLE' : 'DECLINING',
      detail: `Business Health Score ${healthScore.toFixed(1)}/100`,
    },
  ];
}

// ─── Branch status (prototype: DIGITAL_TWIN!W24:W27) ────────────────────────

/**
 * The prototype writes HEALTHY / STABLE / ATTENTION as literal text beside each
 * branch, but the thresholds are stated in EXECUTIVE_COMMAND: Sol Plaatje at
 * 58 is flagged as "below the 60-point STABLE threshold". Encoding the rule
 * instead of the labels means a branch cannot be described as healthy and score
 * 58 at the same time.
 */
export function branchStatus(healthScore: number): BranchStatus {
  if (healthScore >= 75) return 'HEALTHY';
  if (healthScore >= 60) return 'STABLE';
  return 'ATTENTION';
}

// ─── Forecast (prototype: FORECAST) ─────────────────────────────────────────

export interface ForecastRow {
  period: string;
  basis: string;
  multiplier: number;
  revenue: number;
  grossProfit: number;
  netProfit: number;
  revenueTarget: number;
  vsTarget: number;
}

/** FORECAST's growth ladder: flat, then +3%, +5%, +8%. */
export const FORECAST_LADDER: ReadonlyArray<{ period: string; multiplier: number }> = [
  { period: 'Sep 2026', multiplier: 1.0 },
  { period: 'Oct 2026', multiplier: 1.03 },
  { period: 'Nov 2026', multiplier: 1.05 },
  { period: 'Dec 2026', multiplier: 1.08 },
];

/**
 * Projects forward on the year-to-date monthly average.
 *
 * The prototype's own banner reads "FORECAST — NOT GUARANTEED. Forecasts use
 * YTD averages. Do not present as guaranteed results." That warning travels
 * with the figures into the UI and the PDF; it is not decoration.
 */
export function forecast(
  ytd: YearToDate,
  annualRevenueTarget: number,
  ladder: ReadonlyArray<{ period: string; multiplier: number }> = FORECAST_LADDER,
): ForecastRow[] {
  const months = ytd.monthsReported;
  const monthlyTarget = annualRevenueTarget / 12;
  const avg = (total: number) => (months === 0 ? 0 : total / months);

  return ladder.map(({ period, multiplier }) => {
    const revenue = avg(ytd.revenue) * multiplier;
    return {
      period,
      basis: `YTD avg ×${multiplier.toFixed(2)}`,
      multiplier,
      revenue,
      grossProfit: avg(ytd.grossProfit) * multiplier,
      netProfit: avg(ytd.netProfit) * multiplier,
      revenueTarget: monthlyTarget,
      // FORECAST!G = IFERROR(revenue/target - 1, 0): no target, no variance.
      vsTarget: monthlyTarget === 0 ? 0 : revenue / monthlyTarget - 1,
    };
  });
}

/** Excel's IFERROR(x/y, 0): division that yields zero rather than a #DIV/0!. */
export function safeDiv(numerator: number, denominator: number): number {
  if (!denominator || !Number.isFinite(denominator)) return 0;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : 0;
}

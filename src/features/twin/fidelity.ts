/**
 * How wrong the Twin has been, measured on months it was not shown.
 *
 * Pure: given a series of monthly figures, it returns a verdict. No database,
 * no clock beyond what it is handed, no model call. This is the part where
 * being wrong matters most and a test is cheapest, so it is the part with no
 * dependencies.
 *
 * ── what is actually being measured, given there is no simulation yet ─────
 *
 * A baseline. The Twin's Monte Carlo model does not exist, and the harness
 * that scores it should not wait for it — because the number that makes a
 * simulation worth reading is not its own error, it is its error compared with
 * doing something obvious.
 *
 * So the baseline is scored now, on the same footing the simulation will be
 * scored on later, and the bar is set where it belongs: a simulation that
 * cannot beat the average of the months before it has earned nothing, however
 * many iterations it ran.
 */

/** One complete calendar month, and what the business did in it. */
export interface MonthPoint {
  /** 'YYYY-MM'. Sorts lexically, which is why it is a string. */
  month: string;
  valueCents: number;
}

export type FidelityStatus = 'not_measurable' | 'measured' | 'failed';

export interface FidelityVerdict {
  status: FidelityStatus;
  monthsAvailable: number;
  monthsRequired: number;
  score: number | null;
  errorPct: number | null;
  sampleSize: number | null;
  metric: string | null;
  method: string | null;
  reason: string | null;
}

/** Months held out of fitting and then predicted. The brief's number. */
export const HOLDOUT_MONTHS = 3;

/**
 * The shortest fitting window worth calling a fit.
 *
 * Three, so the total needed is six. Predicting three months from one is
 * arithmetic rather than a model, and a fidelity score derived from it would
 * be a real number standing for nothing — which is the specific failure the
 * whole gate exists to prevent, reproduced inside the gate itself.
 */
export const MIN_FIT_MONTHS = 3;

export const MONTHS_REQUIRED = HOLDOUT_MONTHS + MIN_FIT_MONTHS;

/**
 * Complete months only, contiguous, ending before the month in progress.
 *
 * Three separate decisions, and each of them changes the answer:
 *
 * The month containing `today` is dropped. A partial month looks like a
 * collapse — three days into October the figure is a tenth of September's —
 * and a forecast scored against it is scored against the calendar rather than
 * against the business. This is the single easiest way to produce a fidelity
 * score that is confidently wrong.
 *
 * Gaps end the run. A missing month might mean the business did not trade or
 * might mean nobody loaded the data, and nothing here can tell those apart.
 * Treating a hole as a zero invents a catastrophe; treating it as absent
 * invents continuity. So the usable history is the longest unbroken run ending
 * at the last complete month, and everything before a gap is discarded even
 * though it is real — being sure about less is better than being unsure about
 * more.
 *
 * Months with no rows are absent rather than zero, for the same reason.
 */
export function usableHistory(points: readonly MonthPoint[], today: Date): MonthPoint[] {
  const currentMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;

  const complete = [...points]
    .filter((p) => p.month < currentMonth)
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  if (complete.length === 0) return [];

  // Walk back from the most recent, stopping at the first break.
  const run: MonthPoint[] = [complete[complete.length - 1]!];
  for (let i = complete.length - 2; i >= 0; i -= 1) {
    if (monthBefore(run[0]!.month) !== complete[i]!.month) break;
    run.unshift(complete[i]!);
  }
  return run;
}

function monthBefore(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return m === 1
    ? `${year - 1}-12`
    : `${year}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * The baseline: the mean of the fitting window, held flat across the horizon.
 *
 * Deliberately the dullest thing that could work. A trend line or a seasonal
 * term would score better on some businesses and worse on others, and the
 * point of a baseline is not to be good — it is to be the thing a real model
 * has to beat before anybody should look at it.
 */
export function baselineForecast(fit: readonly MonthPoint[], horizon: number): number[] {
  if (fit.length === 0) return Array(horizon).fill(0);
  const mean = fit.reduce((sum, p) => sum + p.valueCents, 0) / fit.length;
  return Array(horizon).fill(mean);
}

/**
 * Symmetric mean absolute percentage error, 0 to 2.
 *
 * Symmetric rather than plain MAPE because plain MAPE divides by the actual,
 * and a month with no revenue makes it infinite — which for a seasonal
 * business is not an error case, it is January. sMAPE is defined whenever
 * either figure is non-zero, and two zeros agree perfectly, which is the right
 * answer rather than a special case.
 *
 * It also punishes over-forecasting and under-forecasting alike. Plain MAPE
 * does not: predicting double is a 100% error, predicting half is 50%, so a
 * model is quietly rewarded for forecasting low.
 */
export function smape(actual: readonly number[], predicted: readonly number[]): number {
  if (actual.length === 0 || actual.length !== predicted.length) return Number.NaN;

  const total = actual.reduce((sum, a, i) => {
    const p = predicted[i]!;
    const denominator = Math.abs(a) + Math.abs(p);
    return sum + (denominator === 0 ? 0 : (2 * Math.abs(a - p)) / denominator);
  }, 0);

  return total / actual.length;
}

/**
 * A 0-to-100 score from an error, and the mapping is a choice rather than a
 * discovery.
 *
 * score = 100 × (1 − sMAPE), floored at zero. So sMAPE 0.10 scores 90, and
 * anything at or above 1.0 scores 0 — a model wrong by that much is not
 * ranked, it is refused. Stated here rather than buried in an expression
 * because somebody will eventually want to argue with the curve, and they
 * should be able to find it.
 */
export function scoreFrom(error: number): number {
  if (!Number.isFinite(error)) return 0;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - error))));
}

/**
 * The whole verdict, including the honest refusal.
 *
 * `not_measurable` is the expected answer for most businesses most of the
 * time, and it is not a failure — it is the platform saying it has not earned
 * the right to simulate yet. `failed` is reserved for the measurement itself
 * breaking, which is a different thing and needs a different response.
 */
export function measureFidelity(
  points: readonly MonthPoint[],
  today: Date,
): FidelityVerdict {
  const history = usableHistory(points, today);
  const monthsAvailable = history.length;

  const base = {
    monthsAvailable,
    monthsRequired: MONTHS_REQUIRED,
    score: null,
    errorPct: null,
    sampleSize: null,
  } as const;

  if (monthsAvailable === 0) {
    return {
      ...base,
      status: 'not_measurable',
      metric: null,
      method: null,
      reason:
        'No complete months of trading history. The Twin has never been checked against anything.',
    };
  }

  if (monthsAvailable < MONTHS_REQUIRED) {
    return {
      ...base,
      status: 'not_measurable',
      metric: null,
      method: null,
      reason:
        `${monthsAvailable} complete month${monthsAvailable === 1 ? '' : 's'} of unbroken history, ` +
        `and ${MONTHS_REQUIRED} are needed — ${HOLDOUT_MONTHS} to hold out and ${MIN_FIT_MONTHS} to fit on.`,
    };
  }

  const fit = history.slice(0, monthsAvailable - HOLDOUT_MONTHS);
  const held = history.slice(monthsAvailable - HOLDOUT_MONTHS);

  const predicted = baselineForecast(fit, held.length);
  const error = smape(held.map((p) => p.valueCents), predicted);

  return {
    monthsAvailable,
    monthsRequired: MONTHS_REQUIRED,
    status: 'measured',
    score: scoreFrom(error),
    // Two decimal places as a percentage: enough to tell two runs apart,
    // not enough to imply the measurement is precise to a basis point.
    errorPct: Math.round(error * 10000) / 100,
    sampleSize: held.length,
    metric: 'monthly_income_cents',
    method: `flat_mean_baseline over ${fit.length} fitted months, sMAPE on ${held.length} held out`,
    reason: null,
  };
}

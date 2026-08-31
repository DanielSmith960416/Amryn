import { safeDiv } from './finance';
import type { Action, EvaluatedKpi, Kpi, KpiStatus } from './types';

/**
 * The KPI Centre engine — KPI_CENTRE!E:H in the prototype.
 *
 *   variance   = current − target
 *   variance % = IFERROR((current − target)/target, 0)
 *   status     = IFS(current >= target,        "✓ ON TARGET",
 *                    current >= target × 0.9,  "NEAR TARGET",
 *                    current <  target × 0.9,  "BELOW TARGET")
 *
 * One correction to the sheet, and it matters. The prototype applies that same
 * higher-is-better test to "Risks Open", whose target is 0 — so any open risk
 * at all reads "✓ ON TARGET", and a register full of open risks looks healthy.
 * `lowerIsBetter` inverts the comparison for those metrics. Everything else
 * behaves exactly as the sheet does.
 */

/** The 10% band the prototype uses between on-target and below-target. */
export const NEAR_TARGET_BAND = 0.9;

export function kpiStatus(
  current: number,
  target: number,
  lowerIsBetter = false,
): KpiStatus {
  if (lowerIsBetter) {
    // A target of zero admits no 10% band, so meeting it exactly is the only
    // way to be on target and anything above it is below target.
    if (current <= target) return 'ON TARGET';
    if (target === 0) return 'BELOW TARGET';
    return current <= target / NEAR_TARGET_BAND ? 'NEAR TARGET' : 'BELOW TARGET';
  }

  if (current >= target) return 'ON TARGET';
  return current >= target * NEAR_TARGET_BAND ? 'NEAR TARGET' : 'BELOW TARGET';
}

export function evaluateKpi(kpi: Kpi): EvaluatedKpi {
  return {
    ...kpi,
    variance: kpi.current - kpi.target,
    variancePct: safeDiv(kpi.current - kpi.target, kpi.target),
    status: kpiStatus(kpi.current, kpi.target, kpi.lowerIsBetter),
  };
}

export function evaluateKpis(kpis: Kpi[]): EvaluatedKpi[] {
  return kpis.map(evaluateKpi);
}

// ─── Action Centre (prototype: ACTION_CENTRE rows 4–5) ──────────────────────

export interface ActionSummary {
  total: number;
  notStarted: number;
  planning: number;
  inProgress: number;
  completed: number;
  completionRate: number;
}

export function actionSummary(actions: Action[]): ActionSummary {
  const countOf = (status: Action['status']) =>
    actions.filter((a) => a.status === status).length;

  const completed = countOf('Completed');
  return {
    total: actions.length,
    notStarted: countOf('Not Started'),
    planning: countOf('Planning'),
    inProgress: countOf('In Progress'),
    completed,
    completionRate: safeDiv(completed, actions.length),
  };
}

/**
 * Actions ordered the way the Action Centre should read: what is urgent and
 * unfinished first, finished work last. Priority breaks ties within a due date
 * so two things due the same day do not sort arbitrarily.
 */
export function rankActions(actions: Action[]): Action[] {
  const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  return [...actions].sort((a, b) => {
    const aDone = a.status === 'Completed' ? 1 : 0;
    const bDone = b.status === 'Completed' ? 1 : 0;
    return (
      aDone - bDone ||
      a.dueDate.localeCompare(b.dueDate) ||
      priorityRank[a.priority] - priorityRank[b.priority]
    );
  });
}

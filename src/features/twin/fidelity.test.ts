import { describe, expect, it } from 'vitest';
import {
  HOLDOUT_MONTHS,
  MONTHS_REQUIRED,
  baselineForecast,
  measureFidelity,
  scoreFrom,
  smape,
  usableHistory,
} from './fidelity';

const m = (month: string, valueCents: number) => ({ month, valueCents });
const MID_OCTOBER = new Date(Date.UTC(2026, 9, 15));

describe('usableHistory', () => {
  it('drops the month in progress', () => {
    // The single easiest way to produce a confidently wrong score: three days
    // into October the figure is a tenth of September's, and a model scored
    // against it is scored against the calendar.
    const history = usableHistory(
      [m('2026-08', 100), m('2026-09', 110), m('2026-10', 9)],
      MID_OCTOBER,
    );
    expect(history.map((p) => p.month)).toEqual(['2026-08', '2026-09']);
  });

  it('stops at a gap, keeping only the unbroken run', () => {
    // A hole might be a closed month or an unloaded file, and nothing here can
    // tell them apart. Being sure about less beats being unsure about more.
    const history = usableHistory(
      [m('2026-01', 10), m('2026-02', 10), m('2026-05', 10), m('2026-06', 10), m('2026-07', 10)],
      MID_OCTOBER,
    );
    expect(history.map((p) => p.month)).toEqual(['2026-05', '2026-06', '2026-07']);
  });

  it('crosses a year boundary without breaking the run', () => {
    const history = usableHistory(
      [m('2025-11', 1), m('2025-12', 1), m('2026-01', 1)],
      MID_OCTOBER,
    );
    expect(history).toHaveLength(3);
  });

  it('sorts whatever order it is handed', () => {
    const history = usableHistory([m('2026-09', 2), m('2026-07', 1), m('2026-08', 3)], MID_OCTOBER);
    expect(history.map((p) => p.month)).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('returns nothing when every month is the one in progress or later', () => {
    expect(usableHistory([m('2026-10', 5), m('2026-11', 5)], MID_OCTOBER)).toEqual([]);
  });
});

describe('smape', () => {
  it('is zero for a perfect forecast', () => {
    expect(smape([100, 200], [100, 200])).toBe(0);
  });

  it('treats two zeros as agreement rather than as an error', () => {
    // A month with no revenue is January for a seasonal business, not a
    // division by zero. Plain MAPE would be infinite here.
    expect(smape([0], [0])).toBe(0);
  });

  it('is defined when the actual is zero and the forecast is not', () => {
    expect(smape([0], [50])).toBe(2);
  });

  it('punishes over- and under-forecasting alike', () => {
    // Plain MAPE would call double a 100% error and half a 50% error, quietly
    // rewarding a model for forecasting low. These must match.
    expect(smape([100], [200])).toBeCloseTo(smape([100], [50]), 10);
  });
});

describe('scoreFrom', () => {
  it('maps error to score on the stated curve', () => {
    expect(scoreFrom(0)).toBe(100);
    expect(scoreFrom(0.1)).toBe(90);
    expect(scoreFrom(0.5)).toBe(50);
  });

  it('refuses rather than ranks a model wrong by 100% or more', () => {
    expect(scoreFrom(1)).toBe(0);
    expect(scoreFrom(2)).toBe(0);
  });

  it('scores zero rather than NaN when the error is not a number', () => {
    expect(scoreFrom(Number.NaN)).toBe(0);
  });
});

describe('baselineForecast', () => {
  it('holds the mean of the fitted months flat', () => {
    expect(baselineForecast([m('a', 100), m('b', 200)], 3)).toEqual([150, 150, 150]);
  });
});

describe('measureFidelity', () => {
  it('refuses, and says so plainly, with no history at all', () => {
    const verdict = measureFidelity([], MID_OCTOBER);
    expect(verdict.status).toBe('not_measurable');
    expect(verdict.score).toBeNull();
    expect(verdict.reason).toContain('never been checked');
  });

  it('refuses with some history, and names how much is missing', () => {
    const verdict = measureFidelity(
      [m('2026-07', 100), m('2026-08', 100), m('2026-09', 100)],
      MID_OCTOBER,
    );
    expect(verdict.status).toBe('not_measurable');
    expect(verdict.monthsAvailable).toBe(3);
    expect(verdict.monthsRequired).toBe(MONTHS_REQUIRED);
    // A refusal with no remedy is a dead end. It has to say what would fix it.
    expect(verdict.reason).toContain('3 complete months');
    expect(verdict.reason).toContain(`${MONTHS_REQUIRED} are needed`);
  });

  it('never records a score it has not earned the months for', () => {
    // Mirrors the database constraint. Both exist because either alone would
    // eventually be worked around.
    for (let months = 0; months < MONTHS_REQUIRED; months += 1) {
      const points = Array.from({ length: months }, (_, i) =>
        m(`2026-${String(i + 1).padStart(2, '0')}`, 100),
      );
      expect(measureFidelity(points, MID_OCTOBER).score).toBeNull();
    }
  });

  it('measures a steady business as close to perfect', () => {
    const points = ['04', '05', '06', '07', '08', '09'].map((mm) => m(`2026-${mm}`, 100_000));
    const verdict = measureFidelity(points, MID_OCTOBER);
    expect(verdict.status).toBe('measured');
    expect(verdict.score).toBe(100);
    expect(verdict.errorPct).toBe(0);
    expect(verdict.sampleSize).toBe(HOLDOUT_MONTHS);
  });

  it('scores a business the baseline cannot follow, and does not hide it', () => {
    // Flat for three months, then triples. A mean-of-the-past baseline has no
    // way to see that coming, and the score must say so rather than flatter it.
    const points = [
      m('2026-04', 100_000), m('2026-05', 100_000), m('2026-06', 100_000),
      m('2026-07', 300_000), m('2026-08', 300_000), m('2026-09', 300_000),
    ];
    const verdict = measureFidelity(points, MID_OCTOBER);
    expect(verdict.status).toBe('measured');
    expect(verdict.score).toBeLessThan(60);
  });

  it('records what it measured and how, so two runs can be compared', () => {
    const points = ['04', '05', '06', '07', '08', '09'].map((mm) => m(`2026-${mm}`, 50_000));
    const verdict = measureFidelity(points, MID_OCTOBER);
    expect(verdict.metric).toBe('monthly_income_cents');
    expect(verdict.method).toContain('sMAPE');
    expect(verdict.method).toContain('3 fitted months');
    // A score with no method beside it cannot be compared with a later one
    // produced differently, which is how a model silently gets worse.
    expect(verdict.reason).toBeNull();
  });

  it('ignores the month in progress when deciding it has enough', () => {
    // Six months on the calendar, one of them still running: five usable.
    const points = ['05', '06', '07', '08', '09', '10'].map((mm) => m(`2026-${mm}`, 100));
    const verdict = measureFidelity(points, MID_OCTOBER);
    expect(verdict.monthsAvailable).toBe(5);
    expect(verdict.status).toBe('not_measurable');
  });
});

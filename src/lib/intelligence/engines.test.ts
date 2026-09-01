import { describe, expect, it } from 'vitest';
import { KALAHARI_MONTHS, KALAHARI_OPPORTUNITIES, KALAHARI_RISKS } from '@/data/demo/kalahari';
import { deriveMonth, deriveMonths, forecast, safeDiv, yearToDate } from './finance';
import { calculateHealthScore, clampScore, healthStatus, HEALTH_WEIGHTS } from './health';
import {
  VALUE_ONLY_CEILING,
  classifyOpportunity,
  rankOpportunities,
  rawOpportunityScore,
  scoreOpportunity,
} from './opportunity';
import { classifyRisk, rankRisks, riskScore, riskSummary } from './risk';
import { kpiStatus } from './kpi';

describe('deriveMonth', () => {
  it('computes the workbook\'s derived columns', () => {
    const m = deriveMonth({
      month: 'Jan 2026', revenue: 1000, cogs: 600, opex: 200,
      cashIn: 1100, cashOut: 900, accountsReceivable: 0, accountsPayable: 0,
      newCustomers: 10, totalCustomers: 100, returns: 0, marketingSpend: 50,
    });

    expect(m.grossProfit).toBe(400);
    expect(m.netProfit).toBe(200);
    expect(m.grossMargin).toBeCloseTo(0.4);
    expect(m.netMargin).toBeCloseTo(0.2);
    expect(m.netCash).toBe(200);
  });

  it('yields zero rather than a division error on a zero-revenue month', () => {
    const m = deriveMonth({
      month: 'Sep 2026', revenue: 0, cogs: 0, opex: 0, cashIn: 0, cashOut: 0,
      accountsReceivable: 0, accountsPayable: 0, newCustomers: 0,
      totalCustomers: 0, returns: 0, marketingSpend: 0,
    });
    expect(m.grossMargin).toBe(0);
    expect(m.netMargin).toBe(0);
  });
});

describe('yearToDate', () => {
  const months = deriveMonths(KALAHARI_MONTHS);
  const ytd = yearToDate(months);

  it('excludes months that have not been reported', () => {
    // The demo carries twelve rows and eight months of data.
    expect(months).toHaveLength(12);
    expect(ytd.monthsReported).toBe(8);
  });

  it('sums the reported months', () => {
    expect(ytd.revenue).toBe(7_055_000);
    expect(ytd.grossProfit).toBe(2_680_900);
    expect(ytd.grossMargin).toBeCloseTo(0.38, 2);
  });

  it('takes total customers from the latest month rather than summing them', () => {
    // Total customers is a stock. Summing it across months would report 9,479
    // customers for a business that has 1,361.
    expect(ytd.totalCustomers).toBe(1_361);
    expect(ytd.newCustomers).toBe(383);
  });

  it('reports zeroes for a workspace with no data at all', () => {
    const empty = yearToDate([]);
    expect(empty.revenue).toBe(0);
    expect(empty.monthsReported).toBe(0);
    expect(empty.grossMargin).toBe(0);
    expect(empty.totalCustomers).toBe(0);
  });
});

describe('safeDiv', () => {
  it('returns zero for a zero or non-finite denominator', () => {
    expect(safeDiv(10, 0)).toBe(0);
    expect(safeDiv(10, Number.NaN)).toBe(0);
    expect(safeDiv(10, 5)).toBe(2);
  });
});

describe('business health', () => {
  const months = deriveMonths(KALAHARI_MONTHS);
  const health = calculateHealthScore(months, yearToDate(months));

  it('weights sum to one', () => {
    const total = Object.values(HEALTH_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1);
  });

  it('sums the weighted components into the overall score', () => {
    const sum = health.components.reduce((t, c) => t + c.rawScore * c.weight, 0);
    expect(health.overall).toBeCloseTo(sum);
  });

  it('bands the status as the workbook does', () => {
    expect(healthStatus(90)).toBe('EXCELLENT');
    expect(healthStatus(89.9)).toBe('HEALTHY');
    expect(healthStatus(75)).toBe('HEALTHY');
    expect(healthStatus(74.9)).toBe('STABLE');
    expect(healthStatus(60)).toBe('STABLE');
    expect(healthStatus(59.9)).toBe('WEAK');
    expect(healthStatus(40)).toBe('WEAK');
    expect(healthStatus(39.9)).toBe('CRITICAL');
  });

  it('scores the demo business as STABLE, as the prototype reports', () => {
    expect(health.status).toBe('STABLE');
    expect(health.overall).toBeGreaterThan(60);
    expect(health.overall).toBeLessThan(75);
  });

  it('marks the three standing assessments as not derived', () => {
    const assumed = health.components.filter((c) => !c.derived).map((c) => c.component);
    expect(assumed).toEqual([
      'Operational Health',
      'People Health',
      'Strategic Health',
    ]);
  });

  it('clamps every raw component to 0-100', () => {
    expect(clampScore(150)).toBe(100);
    expect(clampScore(-20)).toBe(0);
    expect(clampScore(Number.NaN)).toBe(0);

    const extreme = calculateHealthScore(months, yearToDate(months), {
      operational: 500,
      people: -100,
      strategic: 68,
    });
    for (const c of extreme.components) {
      expect(c.rawScore).toBeGreaterThanOrEqual(0);
      expect(c.rawScore).toBeLessThanOrEqual(100);
    }
  });

  it('does not collapse the marketing score early in a year', () => {
    // The workbook divides new customers by a literal 8. Dividing by the months
    // actually reported keeps a January-only workspace from scoring near zero
    // on marketing purely because ten of its months are empty.
    const january = deriveMonths(KALAHARI_MONTHS.slice(0, 1));
    const early = calculateHealthScore(january, yearToDate(january));
    const marketing = early.components.find((c) => c.component === 'Marketing Health');
    expect(marketing?.rawScore).toBeGreaterThan(50);
  });
});

describe('opportunity scoring', () => {
  it('reproduces the workbook formula', () => {
    const o = KALAHARI_OPPORTUNITIES[0]!; // OPP-001
    // 180000/1000×0.25 + 0.75×100×0.15 + 0.85×100×0.20
    //   + 0.8×100×0.15 + (1−0.4)×100×0.10 + 0.75×100×0.15
    const expected = 45 + 11.25 + 17 + 12 + 6 + 11.25;
    expect(rawOpportunityScore(o)).toBeCloseTo(expected);
  });

  it('classifies at the workbook bands', () => {
    expect(classifyOpportunity(61)).toBe('HIGH');
    expect(classifyOpportunity(60)).toBe('MEDIUM');
    expect(classifyOpportunity(41)).toBe('MEDIUM');
    expect(classifyOpportunity(40)).toBe('MONITOR');
  });

  it('caps the reported score at 100 so "/100" stays true, and says it capped', () => {
    // The value term is unbounded: R2m alone contributes 500 points.
    const enormous = { ...KALAHARI_OPPORTUNITIES[0]!, estValue: 2_000_000 };
    const scored = scoreOpportunity(enormous);

    expect(rawOpportunityScore(enormous)).toBeGreaterThan(100);
    expect(scored.score).toBe(100);
    expect(scored.rawScore).toBeGreaterThan(100);
    expect(scored.atCeiling).toBe(true);
  });

  it('does not mark an unsaturated opportunity as at ceiling', () => {
    const scored = scoreOpportunity(KALAHARI_OPPORTUNITIES[5]!); // OPP-006
    expect(scored.atCeiling).toBe(false);
    expect(scored.score).toBe(scored.rawScore);
  });

  it('ranks highest first', () => {
    const ranked = rankOpportunities(KALAHARI_OPPORTUNITIES);
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1]!.rawScore).toBeGreaterThanOrEqual(ranked[i]!.rawScore);
    }
  });

  it('still orders two saturated opportunities correctly', () => {
    // Sorting on the clamped score would tie these at 100 and leave their
    // order to whatever the sort does with equal keys — which is exactly when
    // a ranked list stops being a ranking.
    const a = { ...KALAHARI_OPPORTUNITIES[0]!, id: 'BIG', estValue: 900_000 };
    const b = { ...KALAHARI_OPPORTUNITIES[0]!, id: 'BIGGER', estValue: 950_000 };

    const ranked = rankOpportunities([a, b]);
    expect(ranked[0]?.id).toBe('BIGGER');
    expect(ranked[0]?.score).toBe(100);
    expect(ranked[1]?.score).toBe(100);
    expect(ranked[0]!.rawScore).toBeGreaterThan(ranked[1]!.rawScore);
  });

  it('saturates two of the six demonstration opportunities', () => {
    // A property of this demo data worth pinning: if it ever stops being true,
    // the saturation notice on the radar silently stops appearing.
    const ranked = rankOpportunities(KALAHARI_OPPORTUNITIES);
    expect(ranked.filter((o) => o.atCeiling).map((o) => o.id)).toEqual(['OPP-003', 'OPP-001']);
  });

  it('reports the value at which the value factor alone reaches the ceiling', () => {
    expect(VALUE_ONLY_CEILING).toBe(400_000);
  });

  it('scores low effort above high effort, all else equal', () => {
    const base = KALAHARI_OPPORTUNITIES[0]!;
    const easy = scoreOpportunity({ ...base, effort: 0.1 });
    const hard = scoreOpportunity({ ...base, effort: 0.9 });
    expect(easy.score).toBeGreaterThan(hard.score);
  });
});

describe('risk scoring', () => {
  it('multiplies probability by impact', () => {
    expect(riskScore({ probability: 0.7, impact: 0.75 })).toBeCloseTo(0.525);
  });

  it('classifies at the workbook bands', () => {
    expect(classifyRisk(0.61)).toBe('CRITICAL');
    expect(classifyRisk(0.6)).toBe('HIGH');
    expect(classifyRisk(0.41)).toBe('HIGH');
    expect(classifyRisk(0.4)).toBe('MEDIUM');
    expect(classifyRisk(0.21)).toBe('MEDIUM');
    expect(classifyRisk(0.2)).toBe('LOW');
  });

  it('breaks a tie towards the risk that is getting worse', () => {
    const ranked = rankRisks([
      { ...KALAHARI_RISKS[0]!, id: 'A', probability: 0.5, impact: 0.5, trend: 'Stable' },
      { ...KALAHARI_RISKS[0]!, id: 'B', probability: 0.5, impact: 0.5, trend: 'Worsening' },
    ]);
    expect(ranked[0]?.id).toBe('B');
  });

  it('summarises an empty register without returning -Infinity', () => {
    // Math.max() with no arguments is -Infinity, which would render as a
    // nonsense "highest risk" figure.
    expect(riskSummary([]).highestScore).toBe(0);
  });
});

describe('kpiStatus', () => {
  it('applies the workbook bands where higher is better', () => {
    expect(kpiStatus(100, 100)).toBe('ON TARGET');
    expect(kpiStatus(120, 100)).toBe('ON TARGET');
    expect(kpiStatus(90, 100)).toBe('NEAR TARGET');
    expect(kpiStatus(89, 100)).toBe('BELOW TARGET');
  });

  it('inverts the comparison where lower is better', () => {
    // The workbook applies the higher-is-better test to "Risks Open" against a
    // target of zero, so three open risks read as ON TARGET. They do not here.
    expect(kpiStatus(3, 0, true)).toBe('BELOW TARGET');
    expect(kpiStatus(0, 0, true)).toBe('ON TARGET');
    expect(kpiStatus(3, 0)).toBe('ON TARGET'); // the uncorrected behaviour
  });

  it('allows a near-target band for a non-zero lower-is-better target', () => {
    expect(kpiStatus(5, 5, true)).toBe('ON TARGET');
    expect(kpiStatus(5.4, 5, true)).toBe('NEAR TARGET');
    expect(kpiStatus(6, 5, true)).toBe('BELOW TARGET');
  });
});

describe('forecast', () => {
  const ytd = yearToDate(deriveMonths(KALAHARI_MONTHS));

  it('projects on the reported monthly average with the growth ladder', () => {
    const rows = forecast(ytd, 12_000_000);
    const monthlyAverage = ytd.revenue / ytd.monthsReported;

    expect(rows).toHaveLength(4);
    expect(rows[0]?.revenue).toBeCloseTo(monthlyAverage);
    expect(rows[3]?.revenue).toBeCloseTo(monthlyAverage * 1.08);
    expect(rows[0]?.revenueTarget).toBeCloseTo(1_000_000);
  });

  it('returns zeroes rather than NaN when nothing has been reported', () => {
    const rows = forecast(yearToDate([]), 12_000_000);
    for (const row of rows) {
      expect(row.revenue).toBe(0);
      expect(Number.isFinite(row.vsTarget)).toBe(true);
    }
  });

  it('reports no variance when there is no target to vary from', () => {
    expect(forecast(ytd, 0)[0]?.vsTarget).toBe(0);
  });
});

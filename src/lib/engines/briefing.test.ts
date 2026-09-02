import { describe, expect, it } from 'vitest';
import { buildBriefing } from './briefing';
import { calculateHealthScore } from './health-score';
import type { BusinessContext } from '@/types/intelligence';

function context(over: Partial<BusinessContext> = {}): BusinessContext {
  return {
    organisation: {
      id: 'org-1',
      name: 'Highveld Supply Co.',
      industry: 'Wholesale distribution',
      currencyCode: 'ZAR',
      countryCode: 'ZA',
      strategyProfile: { markets: [], segments: [], capabilities: [], growthIntents: [] },
      branchCount: 3,
      sectorScope: ['private', 'public', 'mixed', 'unknown'],
      viewerScope: { kind: 'organisation', label: 'Whole organisation', branchNames: [] },
    },
    period: { start: '2025-09-01', end: '2026-08-31', label: 'Last 12 months' },
    health: null,
    healthTrend: { previousScore: null, changePoints: null },
    metrics: [],
    anomalies: [],
    opportunities: [],
    risks: [],
    goals: [],
    signals: [],
    competitorEvents: [],
    dataHealth: [],
    generatedAt: '2026-08-29T00:00:00.000Z',
    ...over,
  };
}

const health = (score: number) =>
  calculateHealthScore([
    { key: 'a', label: 'A', category: 'financial', weight: 1, value: score, target: 100, higherIsBetter: true },
  ]);

describe('buildBriefing', () => {
  it('says so plainly when there is no data yet', () => {
    const briefing = buildBriefing(context());
    expect(briefing.headline).toContain('no scored data yet');
    expect(briefing.findings).toEqual([]);
    expect(briefing.priorities).toEqual([]);
  });

  it('leads with the health score and its movement', () => {
    const briefing = buildBriefing(
      context({ health: health(100), healthTrend: { previousScore: 74, changePoints: 6 } }),
    );
    expect(briefing.headline).toContain('80 of 100');
    expect(briefing.headline).toContain('up 6 points');
  });

  it('calls a score that has not moved steady', () => {
    const briefing = buildBriefing(
      context({ health: health(100), healthTrend: { previousScore: 80, changePoints: 0.2 } }),
    );
    expect(briefing.headline).toContain('steady');
  });

  it('reports a decline as a decline', () => {
    const briefing = buildBriefing(
      context({ health: health(60), healthTrend: { previousScore: 70, changePoints: -22 } }),
    );
    expect(briefing.headline).toContain('down 22 points');
  });

  it('puts bad news before good news', () => {
    const briefing = buildBriefing(
      context({
        metrics: [
          {
            key: 'revenue', label: 'Revenue', unit: 'currency', category: 'financial',
            higherIsBetter: true, current: 120, previous: 100, target: null,
            changePercent: 20, direction: 'up', favourable: true, series: [], trend: null,
          },
          {
            key: 'margin', label: 'Gross margin', unit: 'percent', category: 'financial',
            higherIsBetter: true, current: 24, previous: 32, target: 30,
            changePercent: -25, direction: 'down', favourable: false, series: [], trend: null,
          },
        ],
      }),
    );
    expect(briefing.findings[0]?.direction).toBe('negative');
    expect(briefing.findings[0]?.headline).toContain('Gross margin');
  });

  it('ignores metric movements too small to mention', () => {
    const briefing = buildBriefing(
      context({
        metrics: [{
          key: 'revenue', label: 'Revenue', unit: 'currency', category: 'financial',
          higherIsBetter: true, current: 103, previous: 100, target: null,
          changePercent: 3, direction: 'up', favourable: true, series: [], trend: null,
        }],
      }),
    );
    expect(briefing.findings).toEqual([]);
  });

  it('treats a step change as the most important thing on the page', () => {
    const briefing = buildBriefing(
      context({
        metrics: [{
          key: 'operating_cost', label: 'Operating cost', unit: 'currency', category: 'financial',
          higherIsBetter: false, current: 800, previous: 500, target: 620,
          changePercent: 60, direction: 'up', favourable: false, series: [], trend: null,
        }],
        anomalies: [{
          metricKey: 'operating_cost',
          metricLabel: 'Operating cost',
          anomalies: [],
          stepChange: {
            period: '2026-03-01', index: 6, meanBefore: 500, meanAfter: 800,
            changePercent: 60, direction: 'up',
          },
        }],
      }),
    );
    expect(briefing.priorities[0]?.priority).toBe('critical');
    expect(briefing.priorities[0]?.title).toContain('operating cost');
    expect(briefing.findings[0]?.headline).toContain('shifted level');
  });

  it('does not raise a step change that moved the right way', () => {
    const briefing = buildBriefing(
      context({
        metrics: [{
          key: 'operating_cost', label: 'Operating cost', unit: 'currency', category: 'financial',
          higherIsBetter: false, current: 400, previous: 620, target: 620,
          changePercent: -35, direction: 'down', favourable: true, series: [], trend: null,
        }],
        anomalies: [{
          metricKey: 'operating_cost', metricLabel: 'Operating cost', anomalies: [],
          stepChange: {
            period: '2026-03-01', index: 6, meanBefore: 620, meanAfter: 400,
            changePercent: -35, direction: 'down',
          },
        }],
      }),
    );
    expect(briefing.priorities.some((p) => p.priority === 'critical')).toBe(false);
    expect(briefing.findings[0]?.direction).toBe('positive');
  });

  it('surfaces the highest-scoring unworked opportunity', () => {
    const briefing = buildBriefing(
      context({
        opportunities: [
          {
            id: 'o1', title: 'Saturday delivery', kind: 'market_expansion', sector: 'private', stage: 'qualified',
            summary: 'Uncontested weekend demand.', whyItMatters: 'The fleet is already paid for.',
            estimatedValueCents: 21_000_000, score: 84, classification: 'high_priority', closesOn: null,
          },
          {
            id: 'o2', title: 'Low-scoring idea', kind: 'product', sector: 'private', stage: 'discovered',
            summary: 'Weak.', whyItMatters: null, estimatedValueCents: 1000, score: 22,
            classification: 'monitor', closesOn: null,
          },
        ],
      }),
    );
    expect(briefing.priorities.some((p) => p.title === 'Saturday delivery')).toBe(true);
    expect(briefing.findings.some((f) => f.direction === 'opportunity')).toBe(true);
  });

  it('surfaces a tender like any other opportunity when it scores well', () => {
    // Sector is not a filter in the briefing engine. What an organisation
    // wants to see is decided by its sector scope, which has already been
    // applied before the context reaches here.
    const briefing = buildBriefing(
      context({
        opportunities: [{
          id: 'o1', title: 'Schools nutrition supply tender', kind: 'tender', sector: 'public',
          stage: 'discovered', summary: 'A 24-month supply tender, reissued.',
          whyItMatters: 'You hold the certification the last round tripped on.',
          estimatedValueCents: 48_000_000, score: 69, classification: 'strong', closesOn: null,
        }],
      }),
    );
    expect(briefing.findings.some((f) => f.direction === 'opportunity')).toBe(true);
    expect(briefing.priorities.some((p) => p.title.includes('tender'))).toBe(true);
  });

  it('ignores opportunities that are already won or lost', () => {
    const briefing = buildBriefing(
      context({
        opportunities: [{
          id: 'o1', title: 'Closed deal', kind: 'partnership', sector: 'private', stage: 'won',
          summary: 'Done.', whyItMatters: null, estimatedValueCents: 90_000_000,
          score: 95, classification: 'high_priority', closesOn: null,
        }],
      }),
    );
    expect(briefing.findings.some((f) => f.direction === 'opportunity')).toBe(false);
    expect(briefing.priorities).toEqual([]);
  });

  it('orders priorities by severity', () => {
    const briefing = buildBriefing(
      context({
        risks: [
          { id: 'r1', title: 'Minor thing', category: 'operational', severity: 'low',
            status: 'open', likelihood: 1, impact: 1, mitigation: null },
          { id: 'r2', title: 'Serious thing', category: 'financial', severity: 'critical',
            status: 'open', likelihood: 5, impact: 5, mitigation: null },
        ],
      }),
    );
    expect(briefing.priorities[0]?.title).toBe('Serious thing');
  });

  it('leaves closed risks out of the priorities', () => {
    const briefing = buildBriefing(
      context({
        risks: [{ id: 'r1', title: 'Handled', category: 'financial', severity: 'critical',
          status: 'closed', likelihood: 5, impact: 5, mitigation: null }],
      }),
    );
    expect(briefing.priorities).toEqual([]);
  });

  it('raises a broken data connection, because everything else depends on it', () => {
    const briefing = buildBriefing(
      context({
        dataHealth: [
          { sourceName: 'Customer sheet', completeness: 62, freshnessHours: 192, status: 'error' },
          { sourceName: 'Sage', completeness: 98, freshnessHours: 4, status: 'connected' },
        ],
      }),
    );
    expect(briefing.findings.some((f) => f.headline.includes('failing'))).toBe(true);
    expect(briefing.priorities.some((p) => p.title.includes('Customer sheet'))).toBe(true);
  });

  it('flags a goal at risk with how far it has to go', () => {
    const briefing = buildBriefing(
      context({
        goals: [{
          id: 'g1', title: 'Delivery under 3 days', status: 'at_risk', unit: 'days',
          baseline: 3.1, current: 4.1, target: 3, progress: 0.1,
          dueOn: '2026-10-01', daysRemaining: 33,
        }],
      }),
    );
    const finding = briefing.findings.find((f) => f.headline.includes('Goal at risk'));
    expect(finding?.detail).toContain('33 days');
    expect(finding?.detail).toContain('10%');
  });

  it('admits when the score covers only part of the business', () => {
    const partial = calculateHealthScore([
      { key: 'a', label: 'A', category: 'financial', weight: 1, value: 90, target: 100, higherIsBetter: true },
    ]);
    const briefing = buildBriefing(context({ health: partial }));
    expect(briefing.findings.some((f) => f.headline.includes('of six health categories'))).toBe(true);
  });

  it('says nothing has moved rather than inventing something', () => {
    const briefing = buildBriefing(
      context({ health: health(100), healthTrend: { previousScore: 80, changePoints: 0 } }),
    );
    expect(briefing.narrative).toContain('Nothing has moved');
  });

  it('caps findings and priorities so the card stays readable', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      key: `m${i}`, label: `Metric ${i}`, unit: 'count', category: 'sales' as const,
      higherIsBetter: true, current: 50, previous: 100, target: null,
      changePercent: -50, direction: 'down' as const, favourable: false,
      series: [], trend: null,
    }));
    const briefing = buildBriefing(context({ metrics: many }));
    expect(briefing.findings.length).toBeLessThanOrEqual(6);
    expect(briefing.priorities.length).toBeLessThanOrEqual(5);
  });

  it('is deterministic', () => {
    const input = context({
      health: health(90),
      healthTrend: { previousScore: 70, changePoints: 2 },
      risks: [{ id: 'r1', title: 'A risk', category: 'financial', severity: 'high',
        status: 'open', likelihood: 4, impact: 4, mitigation: null }],
    });
    const first = buildBriefing(input);
    for (let i = 0; i < 10; i += 1) {
      expect(buildBriefing(input)).toEqual(first);
    }
  });

  it('marks itself as engine-generated', () => {
    expect(buildBriefing(context()).generatedBy).toBe('engine');
  });
});

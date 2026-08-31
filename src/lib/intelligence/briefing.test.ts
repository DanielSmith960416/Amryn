import { describe, expect, it } from 'vitest';
import {
  KALAHARI_ACTIONS,
  KALAHARI_BRANCHES,
  KALAHARI_MONTHS,
  KALAHARI_OPPORTUNITIES,
  KALAHARI_PROFILE,
  KALAHARI_RISKS,
} from '@/data/demo/kalahari';
import { deriveMonths, yearToDate } from './finance';
import { calculateHealthScore } from './health';
import { rankOpportunities } from './opportunity';
import { rankRisks } from './risk';
import { rankActions } from './kpi';
import { executiveInsights, monthlyBrief, weeklyBrief, type BriefingInput } from './briefing';
import type { Branch } from './types';

const months = deriveMonths(KALAHARI_MONTHS);
const ytd = yearToDate(months);

function input(overrides: Partial<BriefingInput> = {}): BriefingInput {
  return {
    profile: KALAHARI_PROFILE,
    months,
    ytd,
    health: calculateHealthScore(months, ytd),
    branches: KALAHARI_BRANCHES,
    opportunities: rankOpportunities(KALAHARI_OPPORTUNITIES),
    risks: rankRisks(KALAHARI_RISKS),
    actions: rankActions(KALAHARI_ACTIONS),
    asOf: new Date('2026-08-31T00:00:00Z'),
    ...overrides,
  };
}

function bodyOf(brief: ReturnType<typeof weeklyBrief>, heading: string): string {
  const section = brief.sections.find((s) => s.heading === heading);
  return `${section?.body ?? ''} ${section?.items?.join(' ') ?? ''}`;
}

describe('executiveInsights', () => {
  it('produces the prototype\'s six cards', () => {
    const kinds = executiveInsights(input()).map((i) => i.kind);
    expect(kinds).toContain('TOP INSIGHT');
    expect(kinds).toContain('TOP OPPORTUNITY');
    expect(kinds).toContain('TOP RISK');
    expect(kinds).toContain('PRIORITY ACTION');
    expect(kinds).toContain('AI RECOMMENDATION');
  });

  it('states the actual month-on-month movement', () => {
    const top = executiveInsights(input()).find((i) => i.kind === 'TOP INSIGHT');
    // Aug 885,000 against Jul 960,000 is -7.8%, which is what the prototype's
    // own narrative quotes.
    expect(top?.body).toMatch(/Aug 2026/);
    expect(top?.body).toMatch(/7\.8%/);
    expect(top?.body).toMatch(/below/);
  });

  it('names the underperforming branch as the top risk', () => {
    const risk = executiveInsights(input()).find((i) => i.kind === 'TOP RISK');
    expect(risk?.body).toMatch(/Sol Plaatje/);
    expect(risk?.body).toMatch(/58\/100/);
  });

  it('falls back to the register when every branch is healthy', () => {
    const healthy: Branch[] = KALAHARI_BRANCHES.map((b) => ({ ...b, healthScore: 88 }));
    const risk = executiveInsights(input({ branches: healthy })).find((i) => i.kind === 'TOP RISK');

    expect(risk?.body).not.toMatch(/Sol Plaatje Health Score/);
    expect(risk?.body).toMatch(/Mitigation:/);
  });

  it('produces nothing rather than something when there is no data', () => {
    const empty = executiveInsights(
      input({
        months: [],
        ytd: yearToDate([]),
        branches: [],
        opportunities: [],
        risks: [],
        actions: [],
      }),
    );
    // The health recommendation still stands — the assumed components are a
    // property of the model, not of the data. Nothing else may be asserted.
    expect(empty.map((i) => i.kind)).toEqual(['AI RECOMMENDATION']);
  });

  it('every insight names what it was derived from', () => {
    for (const insight of executiveInsights(input())) {
      expect(insight.basis).not.toBe('');
      expect(['High', 'Medium', 'Low']).toContain(insight.confidence);
    }
  });
});

describe('weeklyBrief', () => {
  it('reports the health score and the branch needing attention', () => {
    const brief = weeklyBrief(input());
    const changed = bodyOf(brief, 'What changed this week?');

    expect(changed).toMatch(/Business Health Score/);
    expect(changed).toMatch(/Sol Plaatje requires attention/);
  });

  it('does not name a margin leader when every branch runs the same margin', () => {
    // All four demo branches run 38.0%. Naming a "highest" there is an
    // arbitrary tie-break dressed as a finding.
    const wentWell = bodyOf(weeklyBrief(input()), 'What went well?');

    expect(wentWell).not.toMatch(/highest margin efficiency/);
    expect(wentWell).toMatch(/consistent across all 4 branches/);
  });

  it('names the leader when there is a genuine spread', () => {
    const spread: Branch[] = [
      { ...KALAHARI_BRANCHES[0]!, name: 'Wide', grossProfit: 1_400_000, revenueYtd: 2_850_000 },
      { ...KALAHARI_BRANCHES[1]!, name: 'Narrow', grossProfit: 600_000, revenueYtd: 2_410_000 },
    ];
    const wentWell = bodyOf(weeklyBrief(input({ branches: spread })), 'What went well?');

    expect(wentWell).toMatch(/Wide achieved the highest margin efficiency/);
  });

  it('separates decisions waiting on a person from work in progress', () => {
    const decisions = bodyOf(weeklyBrief(input()), 'Decisions required');
    expect(decisions).toMatch(/Approve or decline/);
    expect(decisions).toMatch(/OPP-00/);
  });

  it('says nothing is outstanding rather than leaving a section blank', () => {
    const brief = weeklyBrief(
      input({
        branches: KALAHARI_BRANCHES.map((b) => ({ ...b, healthScore: 88 })),
        risks: [],
        actions: [],
      }),
    );
    expect(bodyOf(brief, 'What requires attention?')).toMatch(/Nothing outstanding/);
  });

  it('carries a disclaimer on every brief', () => {
    expect(weeklyBrief(input()).disclaimer).toMatch(/not guaranteed/i);
    expect(monthlyBrief(input()).disclaimer).toMatch(/CONFIDENTIAL/);
  });
});

describe('monthlyBrief', () => {
  it('reports year-to-date against target and the year elapsed', () => {
    const summary = bodyOf(monthlyBrief(input()), 'Executive summary');
    // 7.055m against a 12m target is 59%, at 8/12 = 67% of the year.
    expect(summary).toMatch(/59%/);
    expect(summary).toMatch(/67%/);
    expect(summary).toMatch(/STABLE/);
  });

  it('lists every branch with its status', () => {
    const health = bodyOf(monthlyBrief(input()), 'Business health');
    for (const branch of KALAHARI_BRANCHES) {
      expect(health).toContain(branch.name);
    }
    expect(health).toMatch(/ATTENTION/);
  });

  it('omits the inventory section when no audit is connected', () => {
    const headings = monthlyBrief(input()).sections.map((s) => s.heading);
    expect(headings).not.toContain('Inventory compliance');
  });
});

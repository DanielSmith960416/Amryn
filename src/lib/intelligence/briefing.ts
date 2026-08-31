import { branchStatus, latestPair, safeDiv, type YearToDate } from './finance';
import type { ComplianceSummary } from './inventory';
import { actionSummary } from './kpi';
import type {
  Action,
  Branch,
  BusinessProfile,
  ExecutiveInsight,
  HealthScore,
  MonthDerived,
  ScoredOpportunity,
  ScoredRisk,
} from './types';

/**
 * The briefing engine — EXECUTIVE_COMMAND, WEEKLY_INTELLIGENCE and
 * MONTHLY_INTELLIGENCE in the prototype.
 *
 * The prototype writes its briefing paragraphs as literal text: "August 2026
 * revenue of R885,000 is 7.8% below July peak." Those sentences are the product
 * — the tone, the ordering, the willingness to name a branch — but hard-coding
 * them would mean the brief stops being true the moment the data changes.
 *
 * So the sentences are reconstructed here from the figures, in the prototype's
 * own voice. Every claim is derived from something on the page, which is why
 * the engine can carry the prototype's AI-SIMULATED label honestly: nothing is
 * asserted that the numbers do not already say.
 */

export interface BriefingInput {
  profile: BusinessProfile;
  months: MonthDerived[];
  ytd: YearToDate;
  health: HealthScore;
  branches: Branch[];
  opportunities: ScoredOpportunity[];
  risks: ScoredRisk[];
  actions: Action[];
  inventory?: ComplianceSummary;
  /** The date the brief is being produced for. */
  asOf: Date;
}

// ─── Formatting ─────────────────────────────────────────────────────────────

/**
 * `en-GB` is pinned deliberately. `en-ZA` groups thousands with spaces and uses
 * a comma for decimals, which reads inconsistently beside the compact form the
 * tiles use. The currency symbol still comes from the profile.
 */
function money(value: number, currency: string): string {
  const symbol = currency === 'ZAR' ? 'R' : '';
  return `${symbol}${Math.round(value).toLocaleString('en-GB')}`;
}

function compactMoney(value: number, currency: string): string {
  const symbol = currency === 'ZAR' ? 'R' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(3)}M`;
  if (abs >= 1_000) return `${symbol}${Math.round(value / 1_000)}K`;
  return `${symbol}${Math.round(value)}`;
}

function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

// ─── Executive insights (prototype: EXECUTIVE_COMMAND rows 10–37) ───────────

export function executiveInsights(input: BriefingInput): ExecutiveInsight[] {
  const { profile, months, health, branches, opportunities, risks, actions } = input;
  const currency = profile.currency;
  const { latest, previous } = latestPair(months);
  const insights: ExecutiveInsight[] = [];

  // ── Top insight: the largest month-on-month move in revenue.
  if (latest && previous) {
    const change = safeDiv(latest.revenue - previous.revenue, previous.revenue);
    const falling = change < 0;
    insights.push({
      kind: 'TOP INSIGHT',
      body:
        `${latest.month} revenue of ${money(latest.revenue, currency)} is ` +
        `${pct(Math.abs(change))} ${falling ? 'below' : 'above'} ${previous.month}. ` +
        (falling
          ? 'Investigate branch-level variance before the month closes.'
          : 'Confirm the driver and whether it is repeatable before building it into forecast.'),
      // A month-on-month comparison of two reported figures is arithmetic, not
      // inference — there is nothing to be uncertain about.
      confidence: 'High',
      meta: `Movement: ${pct(change)} · ${previous.month} → ${latest.month}`,
      basis: 'Monthly financial series',
    });
  }

  // ── Top opportunity: the highest-scoring one in the pipeline.
  const topOpportunity = opportunities[0];
  if (topOpportunity) {
    insights.push({
      kind: 'TOP OPPORTUNITY',
      body:
        `${topOpportunity.title}. Estimated value ${money(topOpportunity.estValue, currency)} ` +
        `at ${pct(topOpportunity.probability, 0)} probability, owned by ${topOpportunity.owner}.`,
      // An opportunity's score rests on estimates of fit, urgency and effort.
      // High probability is the only thing that makes it more than a guess.
      confidence: topOpportunity.probability >= 0.7 ? 'High' : 'Medium',
      meta: `Opportunity Score: ${topOpportunity.score.toFixed(0)}/100 · ${topOpportunity.classification}`,
      basis: `OpportunityRadar® · ${topOpportunity.id}`,
    });
  }

  // ── Top risk: prefer a weak branch, since the prototype does; otherwise the
  //    highest-scoring entry in the register.
  const weakest = [...branches].sort((a, b) => a.healthScore - b.healthScore)[0];
  const topRisk = risks[0];
  if (weakest && branchStatus(weakest.healthScore) === 'ATTENTION') {
    insights.push({
      kind: 'TOP RISK',
      body:
        `${weakest.name} Health Score is ${weakest.healthScore}/100 — below the 60-point ` +
        'STABLE threshold. Operational review is overdue.',
      confidence: 'High',
      meta: topRisk ? `Register high: ${topRisk.score.toFixed(2)} — ${topRisk.classification}` : '',
      basis: 'Branch performance',
    });
  } else if (topRisk) {
    insights.push({
      kind: 'TOP RISK',
      body: `${topRisk.risk}. Mitigation: ${topRisk.mitigation}. Owner: ${topRisk.owner}.`,
      confidence: 'High',
      meta: `Risk Score: ${topRisk.score.toFixed(2)} — ${topRisk.classification} · ${topRisk.trend}`,
      basis: `Risk register · ${topRisk.id}`,
    });
  }

  // ── Priority decision: the nearest opportunity or risk deadline that still
  //    needs a decision rather than execution.
  const pendingDecision = opportunities.find((o) => o.status === 'Evaluating' || o.status === 'Planning');
  if (pendingDecision) {
    insights.push({
      kind: 'PRIORITY DECISION',
      body:
        `${pendingDecision.title} is at "${pendingDecision.status}" and scores ` +
        `${pendingDecision.score.toFixed(0)}/100. It needs a go or no-go before it ages out of ` +
        'the pipeline.',
      // Whether a decision is due is a judgement about the client's calendar,
      // which the engine cannot see.
      confidence: 'Medium',
      meta: `${pendingDecision.id} · Estimated value ${money(pendingDecision.estValue, currency)}`,
      basis: 'OpportunityRadar® pipeline',
    });
  }

  // ── Priority action: the most urgent unfinished high-priority action.
  const urgentAction = actions
    .filter((a) => a.status !== 'Completed' && a.priority === 'HIGH')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (urgentAction) {
    insights.push({
      kind: 'PRIORITY ACTION',
      body: `${urgentAction.action}. Expected result: ${urgentAction.expectedResult}.`,
      confidence: 'High',
      meta: `ACTION REQUIRED · Owner: ${urgentAction.owner} · Due: ${formatDate(urgentAction.dueDate)}`,
      basis: `Action Centre · ${urgentAction.id}`,
    });
  }

  // ── Recommendation: name the components the score is guessing at, because
  //    that is the cheapest available improvement to the score's own honesty.
  const unmeasured = health.components.filter((c) => !c.derived);
  if (unmeasured.length > 0) {
    const weight = unmeasured.reduce((total, c) => total + c.weight, 0);
    insights.push({
      kind: 'AI RECOMMENDATION',
      body:
        `${unmeasured.map((c) => c.component.replace(' Health', '')).join(', ')} ` +
        `${unmeasured.length === 1 ? 'is' : 'are'} still a manual assessment rather than a ` +
        `measurement — ${pct(weight, 0)} of the Business Health Score. Connecting the underlying ` +
        'data completes the intelligence loop and makes the score defensible.',
      confidence: 'High',
      meta: `Expected impact: ${pct(weight, 0)} of the score moves from assumed to measured`,
      basis: 'Business Health Score composition',
    });
  }

  return insights;
}

// ─── Weekly executive brief (prototype: WEEKLY_INTELLIGENCE) ────────────────

export interface BriefSection {
  heading: string;
  body: string;
  items?: string[];
}

export interface WeeklyBrief {
  title: string;
  companyName: string;
  weekEnding: string;
  sections: BriefSection[];
  /** Every brief carries this. The figures in a demo workspace are illustrative. */
  disclaimer: string;
}

export function weeklyBrief(input: BriefingInput): WeeklyBrief {
  const { profile, months, ytd, health, branches, opportunities, risks, actions, inventory } =
    input;
  const currency = profile.currency;
  const { latest, previous } = latestPair(months);
  const acts = actionSummary(actions);
  const sections: BriefSection[] = [];

  // ── What changed
  const changed: string[] = [];
  if (latest && previous) {
    const change = safeDiv(latest.revenue - previous.revenue, previous.revenue);
    changed.push(
      `Revenue tracking at ${money(latest.revenue, currency)} for ${latest.month} — ` +
        `${change < 0 ? 'down' : 'up'} ${pct(Math.abs(change))} vs ${previous.month}.`,
    );
    changed.push(
      `Customer acquisition at ${latest.newCustomers} new in ${latest.month}, ` +
        `${ytd.totalCustomers.toLocaleString('en-GB')} total.`,
    );
  }
  changed.push(
    `Business Health Score ${health.overall.toFixed(1)}/100 — ${health.status}.`,
  );
  const attention = branches.filter((b) => branchStatus(b.healthScore) === 'ATTENTION');
  if (attention.length > 0) {
    changed.push(`${attention.map((b) => b.name).join(', ')} requires attention.`);
  }
  sections.push({
    heading: 'What changed this week?',
    body: changed.join(' ') || 'No reported movement in the period.',
  });

  // ── What went well
  const wentWell: string[] = [];
  const healthy = branches.filter((b) => branchStatus(b.healthScore) === 'HEALTHY');
  if (healthy.length > 0) {
    wentWell.push(`${healthy.map((b) => b.name).join(', ')} maintained HEALTHY status.`);
  }
  // "X achieved the highest margin efficiency" is only worth saying when there
  // is a spread to speak of. In a group whose branches all run the same margin,
  // naming a winner is an arbitrary tie-break dressed as a finding — and the
  // manager of the branch named second would be right to distrust the whole
  // brief. A quarter of a point is the threshold below which this stays quiet.
  const MARGIN_SPREAD_THRESHOLD = 0.0025;
  const byMargin = [...branches].sort(
    (a, b) => safeDiv(b.grossProfit, b.revenueYtd) - safeDiv(a.grossProfit, a.revenueYtd),
  );
  const best = byMargin[0];
  const worst = byMargin.at(-1);
  if (best && worst) {
    const spread =
      safeDiv(best.grossProfit, best.revenueYtd) - safeDiv(worst.grossProfit, worst.revenueYtd);

    if (spread >= MARGIN_SPREAD_THRESHOLD) {
      wentWell.push(
        `${best.name} achieved the highest margin efficiency at ` +
          `${pct(safeDiv(best.grossProfit, best.revenueYtd))}.`,
      );
    } else if (branches.length > 1) {
      wentWell.push(
        `Gross margin is consistent across all ${branches.length} branches at ` +
          `${pct(safeDiv(best.grossProfit, best.revenueYtd))} — no branch is carrying the others.`,
      );
    }
  }
  if (ytd.netCash > 0) wentWell.push('Cash position positive year to date.');
  if (inventory && inventory.expired === 0) {
    wentWell.push('No expired stock on the shelf at the last audit.');
  }
  sections.push({
    heading: 'What went well?',
    body: wentWell.join(' ') || 'Nothing to report as an improvement this period.',
  });

  // ── What requires attention
  const needsAttention: string[] = [];
  for (const b of attention) {
    needsAttention.push(`${b.name} Health Score: ${b.healthScore}/100.`);
  }
  const overdueAction = actions
    .filter((a) => a.status !== 'Completed')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (overdueAction) {
    needsAttention.push(
      `${overdueAction.id} (${overdueAction.action}) due ${formatDate(overdueAction.dueDate)}.`,
    );
  }
  const worsening = risks.filter((r) => r.trend === 'Worsening');
  if (worsening.length > 0) {
    needsAttention.push(
      `${worsening.length} risk${worsening.length === 1 ? '' : 's'} worsening: ` +
        `${worsening.map((r) => r.risk).join('; ')}.`,
    );
  }
  if (inventory && inventory.urgent > 0) {
    needsAttention.push(
      `${inventory.urgent} stock line${inventory.urgent === 1 ? '' : 's'} expired or critical, ` +
        `compliance rate ${pct(inventory.complianceRate, 0)}.`,
    );
  }
  sections.push({
    heading: 'What requires attention?',
    body: needsAttention.join(' ') || 'Nothing outstanding requires escalation.',
  });

  // ── Biggest opportunity and risk
  const topOpportunity = opportunities[0];
  if (topOpportunity) {
    sections.push({
      heading: 'Biggest opportunity',
      body:
        `${topOpportunity.title} (${topOpportunity.id}, score ${topOpportunity.score.toFixed(0)}/100) ` +
        `carries the highest return potential at ${money(topOpportunity.estValue, currency)}. ` +
        `Currently ${topOpportunity.status.toLowerCase()}, owned by ${topOpportunity.owner}.`,
    });
  }
  const topRisk = risks[0];
  if (topRisk) {
    sections.push({
      heading: 'Biggest risk',
      body:
        `${topRisk.risk} (${topRisk.id}) scores ${topRisk.score.toFixed(2)} — ` +
        `${topRisk.classification}, ${topRisk.trend.toLowerCase()}. ` +
        `${topRisk.mitigation}. Due ${formatDate(topRisk.dueDate)}, owned by ${topRisk.owner}.`,
    });
  }

  // ── Decisions required: things waiting on a person, not on work.
  const decisions = [
    ...opportunities
      .filter((o) => o.status === 'Planning' || o.status === 'Evaluating')
      .slice(0, 2)
      .map((o) => `Approve or decline: ${o.title} (${o.id}, ${o.score.toFixed(0)}/100).`),
    ...risks
      .filter((r) => r.status === 'Open' && r.classification !== 'LOW')
      .slice(0, 2)
      .map((r) => `Authorise mitigation for ${r.risk} (${r.id}).`),
  ];
  if (decisions.length > 0) {
    sections.push({
      heading: 'Decisions required',
      body: 'The following are waiting on a decision rather than on work:',
      items: decisions,
    });
  }

  // ── Recommendations
  const recommendations: string[] = [];
  if (topOpportunity) {
    recommendations.push(
      `Prioritise ${topOpportunity.id} — highest score in the pipeline at ` +
        `${topOpportunity.score.toFixed(0)}/100.`,
    );
  }
  const marginRisk = risks.find((r) => r.category === 'Financial' && r.trend === 'Worsening');
  if (marginRisk) {
    recommendations.push(
      `Address ${marginRisk.id} (${marginRisk.risk}) — currently worsening at ` +
        `${marginRisk.score.toFixed(2)}, against a gross margin of ${pct(ytd.grossMargin)}.`,
    );
  }
  if (acts.completionRate < 0.8) {
    recommendations.push(
      `Action completion is ${pct(acts.completionRate, 0)} against an 80% target — ` +
        `${acts.notStarted} not started.`,
    );
  }
  if (recommendations.length > 0) {
    sections.push({
      heading: 'Recommendations',
      body: 'Computed from the figures above — each traces back to a named record.',
      items: recommendations,
    });
  }

  return {
    title: 'Weekly Intelligence Brief',
    companyName: profile.companyName,
    weekEnding: formatDate(input.asOf.toISOString().slice(0, 10)),
    sections,
    disclaimer:
      'Prepared by Amryn™ AIGrowthIntelligence®. Findings are computed from the data connected ' +
      'to this workspace. Forecasts are projections on year-to-date averages and are not ' +
      'guaranteed results.',
  };
}

// ─── Monthly report (prototype: MONTHLY_INTELLIGENCE) ───────────────────────

export function monthlyBrief(input: BriefingInput): WeeklyBrief {
  const { profile, months, ytd, health, branches, opportunities, risks } = input;
  const currency = profile.currency;
  const { latest } = latestPair(months);
  const monthsElapsed = ytd.monthsReported;

  const sections: BriefSection[] = [
    {
      heading: 'Executive summary',
      body:
        `${profile.companyName} delivered ${money(latest?.revenue ?? 0, currency)} revenue in ` +
        `${latest?.month ?? 'the latest period'}. Year-to-date revenue ` +
        `${compactMoney(ytd.revenue, currency)} against a ` +
        `${compactMoney(profile.revenueTargetAnnual, currency)} target — ` +
        `${pct(safeDiv(ytd.revenue, profile.revenueTargetAnnual), 0)} at ` +
        `${pct(monthsElapsed / 12, 0)} of the year elapsed. Business Health Score ` +
        `${health.overall.toFixed(1)}/100 ${health.status}.`,
    },
    {
      heading: 'Business health',
      body:
        `Health Score ${health.overall.toFixed(1)}/100 — ${health.status}. ` +
        `Gross margin ${pct(ytd.grossMargin)}, net margin ${pct(ytd.netMargin)}. ` +
        `${ytd.totalCustomers.toLocaleString('en-GB')} customers, ${ytd.newCustomers} new ` +
        'year to date.',
      items: branches.map(
        (b) => `${b.name}: Health ${b.healthScore}/100 — ${branchStatus(b.healthScore)}`,
      ),
    },
    {
      heading: 'Financial performance',
      body:
        `YTD revenue ${compactMoney(ytd.revenue, currency)} · gross profit ` +
        `${compactMoney(ytd.grossProfit, currency)} (${pct(ytd.grossMargin)}) · net profit ` +
        `${compactMoney(ytd.netProfit, currency)} (${pct(ytd.netMargin)}) · net cash ` +
        `${compactMoney(ytd.netCash, currency)} across ${monthsElapsed} reported month` +
        `${monthsElapsed === 1 ? '' : 's'}.`,
    },
    {
      heading: 'Opportunities',
      body:
        `${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'} tracked, ` +
        `total pipeline ${compactMoney(
          opportunities.reduce((t, o) => t + o.estValue, 0),
          currency,
        )}.`,
      items: opportunities
        .slice(0, 3)
        .map(
          (o) =>
            `${o.title} (${o.id}) — ${o.score.toFixed(0)}/100, ` +
            `${money(o.estValue, currency)}, ${o.status}`,
        ),
    },
    {
      heading: 'Risks',
      body:
        `${risks.length} risk${risks.length === 1 ? '' : 's'} on the register. ` +
        `${risks.filter((r) => r.status === 'Open').length} open, ` +
        `${risks.filter((r) => r.trend === 'Worsening').length} worsening.`,
      items: risks
        .slice(0, 3)
        .map((r) => `${r.risk} (${r.id}) — ${r.score.toFixed(2)} ${r.classification}, ${r.trend}`),
    },
  ];

  if (input.inventory) {
    const inv = input.inventory;
    sections.push({
      heading: 'Inventory compliance',
      body:
        `${inv.totalItems} lines audited. Compliance rate ${pct(inv.complianceRate, 0)}. ` +
        `${inv.expired} expired, ${inv.critical} critical, ${inv.warning} warning. ` +
        `${inv.dormantItems} dormant line${inv.dormantItems === 1 ? '' : 's'} ` +
        `(${inv.dormantQty} units) representing tied-up capital.`,
    });
  }

  return {
    title: 'Monthly Intelligence Report',
    companyName: profile.companyName,
    weekEnding: latest?.month ?? formatDate(input.asOf.toISOString().slice(0, 10)),
    sections,
    disclaimer:
      'CONFIDENTIAL. Prepared by Amryn™ AIGrowthIntelligence® from the data connected to this ' +
      'workspace. Forecasts are projections on year-to-date averages and are not guaranteed.',
  };
}

/** "2026-09-15" → "15 Sep 2026", the format both workbooks print. */
export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

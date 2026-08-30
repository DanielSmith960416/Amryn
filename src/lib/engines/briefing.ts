/**
 * Executive briefing engine (specification §7).
 *
 * Produces the Command Centre's briefing card deterministically, from the
 * Business Context Object alone. This is not a fallback for when the language
 * model is unavailable — it is the baseline. The model, when configured,
 * rewrites the prose; it never invents a finding the data does not support,
 * because the findings are chosen here first.
 *
 * The ordering rule throughout: money at risk beats money available, and both
 * beat good news.
 */
import { roundTo } from '@/lib/utils/number';
import type {
  BusinessContext,
  ExecutiveBriefing,
  Finding,
} from '@/types/intelligence';
import type { Enums } from '@/types/database';
import { HEALTH_CLASSIFICATION_LABELS } from './health-score';

const MAX_FINDINGS = 6;
const MAX_PRIORITIES = 5;

export function buildBriefing(context: BusinessContext): ExecutiveBriefing {
  const findings = [
    ...healthFindings(context),
    ...anomalyFindings(context),
    ...metricFindings(context),
    ...goalFindings(context),
    ...opportunityFindings(context),
    ...marketFindings(context),
    ...dataFindings(context),
  ];

  const ranked = rankFindings(findings).slice(0, MAX_FINDINGS);

  return {
    headline: buildHeadline(context),
    narrative: buildNarrative(context, ranked),
    findings: ranked,
    priorities: buildPriorities(context),
    generatedBy: 'engine',
    generatedAt: context.generatedAt,
  };
}

/* ── headline ──────────────────────────────────────────────────────────── */

function buildHeadline(context: BusinessContext): string {
  const { health, healthTrend, organisation } = context;

  if (!health) {
    return `${organisation.name} has no scored data yet. Connect a source to start the Digital Twin.`;
  }

  const label = HEALTH_CLASSIFICATION_LABELS[health.classification].toLowerCase();
  const move = healthTrend.changePoints;

  if (move === null || Math.abs(move) < 0.5) {
    return `Business health is ${Math.round(health.score)} of 100 — ${label}, and steady on last period.`;
  }

  const verb = move > 0 ? 'up' : 'down';
  return (
    `Business health is ${Math.round(health.score)} of 100 — ${label}, ` +
    `${verb} ${Math.abs(roundTo(move, 1))} points on last period.`
  );
}

/* ── narrative ─────────────────────────────────────────────────────────── */

function buildNarrative(context: BusinessContext, findings: readonly Finding[]): string {
  const parts: string[] = [];

  const negatives = findings.filter((f) => f.direction === 'negative');
  const positives = findings.filter((f) => f.direction === 'positive');
  const openings = findings.filter((f) => f.direction === 'opportunity');

  if (context.health) {
    const weakest = [...context.health.categories].sort((a, b) => a.score - b.score)[0];
    const strongest = [...context.health.categories].sort((a, b) => b.score - a.score)[0];
    if (weakest && strongest && weakest.category !== strongest.category) {
      parts.push(
        `${capitalise(strongest.category)} health is carrying the score at ${Math.round(strongest.score)}, ` +
          `while ${weakest.category} sits at ${Math.round(weakest.score)}.`,
      );
    }
  }

  if (negatives.length > 0) {
    parts.push(
      negatives.length === 1
        ? `One item needs attention: ${lowerFirst(negatives[0]!.headline)}.`
        : `${negatives.length} items need attention, starting with ${lowerFirst(negatives[0]!.headline)}.`,
    );
  }

  if (openings.length > 0) {
    const value = context.opportunities
      .filter((o) => o.stage !== 'won' && o.stage !== 'lost' && o.stage !== 'archived')
      .reduce((sum, o) => sum + (o.estimatedValueCents ?? 0), 0);
    parts.push(
      value > 0
        ? `The radar is carrying ${formatMoney(value, context.organisation.currencyCode)} across ${openings.length} ` +
          `${openings.length === 1 ? 'opportunity' : 'opportunities'} worth acting on.`
        : `${openings.length} market ${openings.length === 1 ? 'opportunity is' : 'opportunities are'} worth acting on.`,
    );
  }

  if (positives.length > 0 && negatives.length === 0) {
    parts.push(`Nothing is deteriorating: ${lowerFirst(positives[0]!.headline)}.`);
  }

  if (parts.length === 0) {
    parts.push('Nothing has moved far enough this period to call for a decision.');
  }

  return parts.join(' ');
}

/* ── findings ──────────────────────────────────────────────────────────── */

function healthFindings(context: BusinessContext): Finding[] {
  const { health } = context;
  if (!health) return [];

  const findings: Finding[] = [];
  const weakest = [...health.categories].sort((a, b) => a.score - b.score)[0];

  if (weakest && weakest.score < 60) {
    findings.push({
      direction: 'negative',
      headline: `${capitalise(weakest.category)} health is at ${Math.round(weakest.score)} of 100`,
      detail: `Scored across ${weakest.metricCount} ${weakest.metricCount === 1 ? 'metric' : 'metrics'}, carrying ${Math.round(weakest.weight * 100)}% of the overall score.`,
      evidence: [{ source: 'health_score', reference: weakest.category }],
    });
  }

  if (health.missingCategories.length >= 3) {
    findings.push({
      direction: 'neutral',
      headline: `The score covers ${health.categories.length} of six health categories`,
      detail: `No data yet for ${health.missingCategories.join(', ')}. The score is honest about what it can see, but it is a partial view.`,
      evidence: [{ source: 'health_score', reference: 'coverage' }],
    });
  }

  return findings;
}

function anomalyFindings(context: BusinessContext): Finding[] {
  const findings: Finding[] = [];

  for (const entry of context.anomalies) {
    if (entry.stepChange) {
      const { stepChange } = entry;
      const metric = context.metrics.find((m) => m.key === entry.metricKey);
      const bad = metric ? stepChange.direction === (metric.higherIsBetter ? 'down' : 'up') : true;
      findings.push({
        direction: bad ? 'negative' : 'positive',
        headline: `${entry.metricLabel} shifted level, not just drifted`,
        detail:
          `It moved ${stepChange.direction} ${Math.abs(stepChange.changePercent ?? 0).toFixed(1)}% ` +
          `from ${stepChange.period}, and has held there since. A step like this usually has a single cause and a date.`,
        evidence: [
          { source: 'metric', reference: entry.metricKey, note: `${stepChange.meanBefore} → ${stepChange.meanAfter}` },
        ],
      });
      continue;
    }

    const latest = entry.anomalies.at(-1);
    if (!latest) continue;
    findings.push({
      direction: latest.direction === 'above' ? 'neutral' : 'negative',
      headline: `${entry.metricLabel} read ${formatNumber(latest.value)} against an expected ${formatNumber(latest.expected)}`,
      detail: `That is ${Math.abs(latest.deviations).toFixed(1)} standard deviations from its own recent history in ${latest.period}.`,
      evidence: [{ source: 'metric', reference: entry.metricKey, note: latest.period }],
    });
  }

  return findings;
}

function metricFindings(context: BusinessContext): Finding[] {
  const findings: Finding[] = [];

  for (const metric of context.metrics) {
    if (metric.changePercent === null || metric.favourable === null) continue;
    if (Math.abs(metric.changePercent) < 5) continue;

    findings.push({
      direction: metric.favourable ? 'positive' : 'negative',
      headline:
        `${metric.label} ${metric.direction === 'up' ? 'rose' : 'fell'} ` +
        `${Math.abs(metric.changePercent).toFixed(1)}%`,
      detail: metric.target
        ? `Now ${formatNumber(metric.current)} against a target of ${formatNumber(metric.target)}.`
        : `Now ${formatNumber(metric.current)}.`,
      evidence: [{ source: 'metric', reference: metric.key, note: `${metric.previous} → ${metric.current}` }],
    });
  }

  return findings;
}

function goalFindings(context: BusinessContext): Finding[] {
  const atRisk = context.goals.filter((g) => g.status === 'at_risk');
  if (atRisk.length === 0) return [];

  const first = atRisk[0]!;
  return [
    {
      direction: 'negative',
      headline:
        atRisk.length === 1
          ? `Goal at risk: ${first.title}`
          : `${atRisk.length} goals are at risk, including ${first.title}`,
      detail: `${first.daysRemaining} days remain and ${Math.round(first.progress * 100)}% of the distance is covered.`,
      evidence: [{ source: 'goal', reference: first.id }],
    },
  ];
}

function opportunityFindings(context: BusinessContext): Finding[] {
  const live = context.opportunities
    .filter((o) => !['won', 'lost', 'archived'].includes(o.stage))
    .filter((o) => (o.score ?? 0) >= 60)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  if (live.length === 0) return [];

  const lead = live[0]!;
  return [
    {
      direction: 'opportunity',
      headline:
        live.length === 1
          ? lead.title
          : `${live.length} opportunities scored above 60, led by ${lead.title}`,
      detail:
        lead.whyItMatters ??
        (lead.estimatedValueCents
          ? `Estimated at ${formatMoney(lead.estimatedValueCents, context.organisation.currencyCode)}.`
          : lead.summary),
      evidence: [{ source: 'opportunity', reference: lead.id, note: `score ${lead.score ?? 0}` }],
    },
  ];
}

function marketFindings(context: BusinessContext): Finding[] {
  const highImpact = context.competitorEvents.filter(
    (e) => e.impact === 'critical' || e.impact === 'high',
  );
  if (highImpact.length === 0) return [];

  const lead = highImpact[0]!;
  return [
    {
      direction: 'negative',
      headline: `Competitor activity: ${lead.title}`,
      detail: `${lead.competitorName}, observed ${lead.observedOn}.`,
      evidence: [{ source: 'competitor_event', reference: lead.competitorName, note: lead.kind }],
    },
  ];
}

function dataFindings(context: BusinessContext): Finding[] {
  const broken = context.dataHealth.filter((d) => d.status === 'error');
  const stale = context.dataHealth.filter(
    (d) => d.status !== 'error' && (d.freshnessHours ?? 0) > 72,
  );

  const findings: Finding[] = [];

  if (broken.length > 0) {
    findings.push({
      direction: 'negative',
      headline: `${broken.length} data ${broken.length === 1 ? 'connection is' : 'connections are'} failing`,
      detail: `${broken.map((d) => d.sourceName).join(', ')}. Findings that depend on these sources are working from stale figures.`,
      evidence: broken.map((d) => ({ source: 'data_connection', reference: d.sourceName })),
    });
  } else if (stale.length > 0) {
    findings.push({
      direction: 'neutral',
      headline: `${stale.length} ${stale.length === 1 ? 'source has' : 'sources have'} not refreshed in over three days`,
      detail: stale.map((d) => d.sourceName).join(', ') + '.',
      evidence: stale.map((d) => ({ source: 'data_connection', reference: d.sourceName })),
    });
  }

  return findings;
}

/** Bad news first, then opportunities, then everything else. */
function rankFindings(findings: readonly Finding[]): Finding[] {
  const order: Record<Finding['direction'], number> = {
    negative: 0,
    opportunity: 1,
    positive: 2,
    neutral: 3,
  };
  return [...findings].sort((a, b) => order[a.direction] - order[b.direction]);
}

/* ── priorities ────────────────────────────────────────────────────────── */

function buildPriorities(context: BusinessContext): ExecutiveBriefing['priorities'] {
  const priorities: ExecutiveBriefing['priorities'] = [];

  // 1. A step change in a metric that should not have stepped.
  for (const entry of context.anomalies) {
    if (!entry.stepChange) continue;
    const metric = context.metrics.find((m) => m.key === entry.metricKey);
    const harmful = metric
      ? entry.stepChange.direction === (metric.higherIsBetter ? 'down' : 'up')
      : true;
    if (!harmful) continue;

    priorities.push({
      priority: 'critical',
      title: `Find what changed in ${entry.metricLabel.toLowerCase()}`,
      rationale: `It stepped ${Math.abs(entry.stepChange.changePercent ?? 0).toFixed(1)}% at ${entry.stepChange.period} and has stayed there. A step has a cause worth naming.`,
      impactCents: null,
    });
  }

  // 2. Open risks, worst first.
  const severityOrder: Record<Enums['priority_level'], number> = {
    critical: 0, high: 1, medium: 2, low: 3,
  };
  const openRisks = context.risks
    .filter((r) => r.status === 'open' || r.status === 'mitigating')
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  for (const risk of openRisks.slice(0, 2)) {
    priorities.push({
      priority: risk.severity,
      title: risk.title,
      rationale:
        risk.mitigation ??
        `Likelihood ${risk.likelihood} of 5, impact ${risk.impact} of 5, and still ${risk.status}.`,
      impactCents: null,
    });
  }

  // 3. The best opportunity that nobody has picked up.
  const bestOpen = context.opportunities
    .filter((o) => o.stage === 'discovered' || o.stage === 'qualified' || o.stage === 'analysing')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

  if (bestOpen) {
    priorities.push({
      priority: (bestOpen.score ?? 0) >= 80 ? 'high' : 'medium',
      title: bestOpen.title,
      rationale: bestOpen.whyItMatters ?? bestOpen.summary,
      impactCents: bestOpen.estimatedValueCents,
    });
  }

  // 4. Broken data plumbing — cheap to fix, and everything else depends on it.
  const broken = context.dataHealth.filter((d) => d.status === 'error');
  if (broken.length > 0) {
    priorities.push({
      priority: 'medium',
      title: `Reconnect ${broken.map((d) => d.sourceName).join(', ')}`,
      rationale: 'Every finding drawn from these sources is working from stale data until this is fixed.',
      impactCents: null,
    });
  }

  return priorities
    .sort((a, b) => severityOrder[a.priority] - severityOrder[b.priority])
    .slice(0, MAX_PRIORITIES);
}

/* ── formatting ────────────────────────────────────────────────────────── */

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function formatNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${roundTo(value / 1_000_000, 2)}m`;
  if (Math.abs(value) >= 10_000) return `${roundTo(value / 1000, 1)}k`;
  return String(roundTo(value, 2));
}

function formatMoney(cents: number, currency: string): string {
  const symbol = currency === 'ZAR' ? 'R' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '';
  const units = cents / 100;
  if (Math.abs(units) >= 1_000_000) return `${symbol}${roundTo(units / 1_000_000, 2)}m`;
  if (Math.abs(units) >= 1000) return `${symbol}${Math.round(units / 1000)}k`;
  return `${symbol}${Math.round(units)}`;
}

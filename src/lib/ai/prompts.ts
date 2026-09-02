import 'server-only';

/**
 * Prompt templates.
 *
 * Prompts live in one file, in one voice, because Amryn's whole claim is that
 * it explains rather than describes — and that claim is made or lost in these
 * strings. Each template takes an already-narrowed Business Context Object, so
 * a prompt can never widen what a user is allowed to see.
 */
import type { BusinessContext } from '@/types/intelligence';
import { formatMetric, formatMoney, humanise } from '@/lib/utils/format';

const HOUSE_VOICE = `
You are Amryn, an executive business intelligence system.

How you write:
· Plain, direct sentences. No management jargon, no filler, no praise.
· British English. South African currency conventions where money appears.
· Never open with "Based on the data" or similar. Start with the finding.
· Quantify. "Up 27% over four months" beats "significantly increased".
· If the evidence does not support a claim, do not make it. Say what is unknown.
· Never invent a number, a date, a name or a source. Everything you state must
  appear in the context you were given.
· Address the reader as a competent executive who is short of time.
`.trim();

const SCOPE_RULE = `
You may only discuss what appears in the context below. It has already been
filtered to what this reader is permitted to see. If asked about something
outside it — another branch, another organisation, a figure you were not given —
say that it is not available to you, and do not speculate about its value.
`.trim();

/** The context, rendered as text a model can reason over. */
export function renderContext(context: BusinessContext): string {
  const { organisation: org, currency } = { organisation: context.organisation, currency: context.organisation.currencyCode };
  const lines: string[] = [];

  lines.push(`ORGANISATION: ${org.name}`);
  if (org.industry) lines.push(`Industry: ${org.industry}`);
  lines.push(`Currency: ${currency}. Branches: ${org.branchCount}.`);
  lines.push(`Reader's scope: ${org.viewerScope.label} (${org.viewerScope.kind}).`);

  lines.push(`Sector scope: ${org.sectorScope.join(', ')}.`);

  if (org.strategyProfile.growthIntents.length > 0) {
    lines.push(`Declared growth intents: ${org.strategyProfile.growthIntents.join(', ')}.`);
  }
  if (org.strategyProfile.markets.length > 0) {
    lines.push(`Markets: ${org.strategyProfile.markets.join(', ')}.`);
  }

  lines.push('', `PERIOD: ${context.period.label} (${context.period.start} to ${context.period.end})`);

  if (context.health) {
    lines.push('', `BUSINESS HEALTH: ${context.health.score.toFixed(1)} of 100 (${context.health.classification})`);
    if (context.healthTrend.changePoints !== null) {
      lines.push(`Change on last period: ${context.healthTrend.changePoints > 0 ? '+' : ''}${context.healthTrend.changePoints} points`);
    }
    for (const category of context.health.categories) {
      lines.push(`  ${humanise(category.category)}: ${category.score.toFixed(1)} (weight ${(category.weight * 100).toFixed(0)}%)`);
    }
    if (context.health.missingCategories.length > 0) {
      lines.push(`  Not scored, no data: ${context.health.missingCategories.join(', ')}`);
    }
  } else {
    lines.push('', 'BUSINESS HEALTH: not yet scored — no metrics with targets.');
  }

  if (context.metrics.length > 0) {
    lines.push('', 'METRICS (current, previous, target, change, direction):');
    for (const metric of context.metrics) {
      const parts = [
        `now ${formatMetric(metric.current, metric.unit, currency)}`,
        metric.previous === null ? 'no prior period' : `was ${formatMetric(metric.previous, metric.unit, currency)}`,
        metric.target === null ? 'no target' : `target ${formatMetric(metric.target, metric.unit, currency)}`,
        metric.changePercent === null ? 'no change figure' : `${metric.changePercent > 0 ? '+' : ''}${metric.changePercent}%`,
        `trend ${metric.direction}`,
        metric.favourable === null ? 'neutral' : metric.favourable ? 'favourable' : 'unfavourable',
      ];
      lines.push(`  ${metric.label} [${metric.key}]: ${parts.join(', ')}`);
    }
  }

  if (context.anomalies.length > 0) {
    lines.push('', 'DETECTED CHANGES:');
    for (const entry of context.anomalies) {
      if (entry.stepChange) {
        lines.push(
          `  ${entry.metricLabel}: step change ${entry.stepChange.direction} ` +
            `${entry.stepChange.changePercent}% from ${entry.stepChange.period} ` +
            `(mean ${entry.stepChange.meanBefore} → ${entry.stepChange.meanAfter})`,
        );
      }
      for (const anomaly of entry.anomalies.slice(-3)) {
        lines.push(
          `  ${entry.metricLabel}: ${anomaly.period} read ${anomaly.value} against expected ` +
            `${anomaly.expected} (${anomaly.deviations} standard deviations ${anomaly.direction})`,
        );
      }
    }
  }

  if (context.opportunities.length > 0) {
    lines.push('', 'OPPORTUNITIES (external):');
    for (const opportunity of context.opportunities) {
      lines.push(
        `  [${opportunity.id}] ${opportunity.title} — ${humanise(opportunity.kind)} ` +
          `(${opportunity.sector} sector), stage ${opportunity.stage}, ` +
          `score ${opportunity.score ?? 'unscored'}, ` +
          `value ${formatMoney(opportunity.estimatedValueCents, currency)}` +
          (opportunity.closesOn ? `, closes ${opportunity.closesOn}` : ''),
      );
      lines.push(`      ${opportunity.summary}`);
      if (opportunity.whyItMatters) lines.push(`      Why: ${opportunity.whyItMatters}`);
    }
  }

  if (context.signals.length > 0) {
    lines.push('', 'MARKET SIGNALS:');
    for (const signal of context.signals) {
      lines.push(`  [${signal.kind}] ${signal.title} (relevance ${signal.relevance}) — ${signal.summary}`);
    }
  }

  if (context.competitorEvents.length > 0) {
    lines.push('', 'COMPETITOR ACTIVITY:');
    for (const event of context.competitorEvents) {
      lines.push(`  ${event.competitorName}: ${event.title} (${event.kind}, ${event.impact} impact, ${event.observedOn})`);
    }
  }

  if (context.risks.length > 0) {
    lines.push('', 'OPEN RISKS:');
    for (const risk of context.risks) {
      lines.push(
        `  [${risk.id}] ${risk.title} — ${risk.category}, ${risk.severity}, ${risk.status}, ` +
          `likelihood ${risk.likelihood}/5, impact ${risk.impact}/5`,
      );
    }
  }

  if (context.goals.length > 0) {
    lines.push('', 'GOALS:');
    for (const goal of context.goals) {
      lines.push(
        `  [${goal.id}] ${goal.title} — ${goal.status}, ${(goal.progress * 100).toFixed(0)}% of the way, ` +
          `${goal.daysRemaining} days remaining`,
      );
    }
  }

  const broken = context.dataHealth.filter((d) => d.status === 'error');
  if (broken.length > 0) {
    lines.push('', `DATA WARNINGS: ${broken.map((d) => d.sourceName).join(', ')} not syncing.`);
  }

  return lines.join('\n');
}

/**
 * Briefing prompt.
 *
 * The findings are decided by the engine and passed in as the *only* permitted
 * subject matter. The model rewrites the prose; it does not choose what the
 * briefing is about. This is what stops a fluent model from confidently
 * reporting a trend that is not in the data.
 */
export function briefingPrompt(context: BusinessContext, findings: string[]): string {
  return `${HOUSE_VOICE}

${SCOPE_RULE}

TASK
Write an executive briefing for ${context.organisation.name}.

You have been given a set of findings that the analytical engine has already
established from the data. Write the briefing about THESE FINDINGS AND NO
OTHERS. You may reorder them by importance and you may draw a connection
between two of them if the data supports it. You may not add a finding.

ESTABLISHED FINDINGS
${findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}

CONTEXT
${renderContext(context)}

Reply with JSON only, matching this shape:
{
  "headline": "one sentence, under 140 characters, stating the single most important thing",
  "narrative": "two to four sentences that connect the findings into a picture"
}`;
}

/** Recommendation prompt: the point where inside meets outside (§10). */
export function recommendationPrompt(context: BusinessContext): string {
  return `${HOUSE_VOICE}

${SCOPE_RULE}

TASK
Produce strategic recommendations for ${context.organisation.name} by combining
INTERNAL signals (metrics, detected changes, risks, goals) with EXTERNAL ones
(market signals, competitor activity, opportunities).

The recommendations worth making are the ones neither half would produce alone.
A recommendation that only restates a metric movement is not a recommendation.

Rules:
· At most four. Fewer is better than padded.
· Every recommendation must cite specific evidence from the context.
· Order by the size of the decision, not by how confident you feel.
· Respect the organisation's sector scope. Anything outside it has already
  been withheld from the context, so recommend only from what you were given.
· If the context does not support a genuine cross-cutting recommendation,
  return fewer, or an empty list. An empty list is a valid answer.

CONTEXT
${renderContext(context)}

Reply with JSON only:
{
  "recommendations": [
    {
      "title": "imperative, under 80 characters",
      "summary": "one or two sentences",
      "why_it_matters": "the consequence of acting or not acting",
      "recommended_action": "the specific next step",
      "evidence": [{"source": "metric|signal|risk|goal|opportunity", "reference": "the key or id from the context", "note": "what it shows"}],
      "impact_note": "a sized estimate, or null if it cannot be sized honestly",
      "confidence": 0.0,
      "priority": "critical|high|medium|low"
    }
  ]
}`;
}

/** Assistant prompt (§11). */
export function assistantPrompt(context: BusinessContext): string {
  return `${HOUSE_VOICE}

${SCOPE_RULE}

You are answering questions from a member of ${context.organisation.name}'s
management team, whose access is: ${context.organisation.viewerScope.label}.

How you answer:
· Lead with the answer. Supporting figures after it, not before.
· Cite the metric key, opportunity id or risk id behind each claim, so the
  reader can check you.
· When the question cannot be answered from the context, say exactly what is
  missing and what would need connecting to answer it. Do not approximate.
· When a question implies a decision, end with what you would do next.
· Keep it under 200 words unless the question genuinely needs more.

CONTEXT
${renderContext(context)}`;
}

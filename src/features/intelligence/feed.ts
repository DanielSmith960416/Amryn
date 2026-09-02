/**
 * Assembles the Intelligence Feed from the Business Context Object.
 *
 * Pure, so the ordering rule is testable: everything is merged onto one
 * timeline and sorted by when it happened, regardless of whether it happened
 * inside the business or outside it. Separating the two would be tidier and
 * would lose the adjacency that makes the feed worth reading.
 */
import type { FeedEntry } from '@/components/intelligence/feed';
import type { BusinessContext } from '@/types/intelligence';

export function buildFeed(context: BusinessContext): FeedEntry[] {
  const entries: FeedEntry[] = [];

  for (const entry of context.anomalies) {
    if (entry.stepChange) {
      entries.push({
        id: `step-${entry.metricKey}`,
        origin: 'business',
        title: `${entry.metricLabel} shifted level`,
        detail:
          `Moved ${entry.stepChange.direction} ${Math.abs(entry.stepChange.changePercent ?? 0).toFixed(1)}% ` +
          `from ${entry.stepChange.period} and has held there since.`,
        at: entry.stepChange.period,
        severity: 'high',
      });
    }
    for (const anomaly of entry.anomalies.slice(-2)) {
      entries.push({
        id: `anomaly-${entry.metricKey}-${anomaly.period}`,
        origin: 'business',
        title: `${entry.metricLabel} read outside its usual range`,
        detail: `${anomaly.value} against an expected ${anomaly.expected}, ${Math.abs(anomaly.deviations).toFixed(1)} standard deviations ${anomaly.direction}.`,
        at: anomaly.period,
        severity: 'medium',
      });
    }
  }

  for (const signal of context.signals) {
    entries.push({
      id: `signal-${signal.id}`,
      origin: 'market',
      title: signal.title,
      detail: signal.summary,
      at: signal.observedAt,
    });
  }

  for (const event of context.competitorEvents) {
    entries.push({
      id: `competitor-${event.competitorName}-${event.observedOn}`,
      origin: 'competitor',
      title: event.title,
      detail: event.competitorName,
      at: event.observedOn,
      severity: event.impact,
    });
  }

  for (const opportunity of context.opportunities.slice(0, 5)) {
    entries.push({
      id: `opportunity-${opportunity.id}`,
      origin: 'opportunity',
      title: opportunity.title,
      detail: opportunity.whyItMatters ?? opportunity.summary,
      at: opportunity.closesOn ?? context.generatedAt,
    });
  }

  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

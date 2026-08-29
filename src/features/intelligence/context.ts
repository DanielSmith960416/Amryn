import 'server-only';

/**
 * Builds the Business Context Object (specification §25).
 *
 * This is the normalisation layer between the database and everything that
 * reasons about the business — the briefing engine, the recommendation engine
 * and the assistant. It is the only place that reads raw rows and the only
 * place that decides what "current performance" means.
 *
 * Two properties matter and are worth stating plainly:
 *
 *   · It is built with the caller's own Supabase client, so Row Level Security
 *     has already narrowed every query. A branch manager's context contains a
 *     branch manager's business. Nothing downstream needs to re-filter, and
 *     nothing downstream is trusted to.
 *
 *   · It is bounded. Series are capped, lists are capped, and nothing carries
 *     transaction-level detail. A model is never handed a database dump.
 */
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import {
  calculateHealthScore,
  type HealthCategory,
  type HealthMetricInput,
} from '@/lib/engines/health-score';
import {
  analyseTrend,
  detectAnomalies,
  detectStepChange,
  isFavourable,
  type SeriesPoint,
} from '@/lib/engines/trends';
import { percentChange, roundTo } from '@/lib/utils/number';
import type { Workspace } from '@/lib/auth/session';
import type {
  AnomalyContext,
  BusinessContext,
  CompetitorEventContext,
  DataHealthContext,
  GoalContext,
  MetricSnapshot,
  OpportunityContext,
  RiskContext,
  SignalContext,
} from '@/types/intelligence';
import type { Json } from '@/types/database';

/** Caps, so the context stays a summary rather than an export. */
const MAX_SERIES_POINTS = 24;
const MAX_OPPORTUNITIES = 12;
const MAX_SIGNALS = 12;
const MAX_RISKS = 12;
const MAX_GOALS = 10;
const MAX_COMPETITOR_EVENTS = 8;

export const buildBusinessContext = cache(
  async (workspace: Workspace): Promise<BusinessContext> => {
    const supabase = await createClient();
    const organisationId = workspace.organisation.id;

    const [
      metricsResult,
      valuesResult,
      weightsResult,
      healthResult,
      opportunitiesResult,
      risksResult,
      goalsResult,
      signalsResult,
      competitorEventsResult,
      dataHealthResult,
      branchesResult,
    ] = await Promise.all([
      supabase
        .from('business_metrics')
        .select('*')
        .eq('organisation_id', organisationId)
        .eq('is_active', true),
      // Organisation-level series only: per-branch rows are for the branch
      // comparison views, and mixing them here would double-count.
      supabase
        .from('metric_values')
        .select('metric_id, period_start, value')
        .eq('organisation_id', organisationId)
        .is('branch_id', null)
        .order('period_start', { ascending: true }),
      supabase.from('health_score_weights').select('category, weight').eq('organisation_id', organisationId),
      supabase
        .from('business_health_scores')
        .select('score, calculated_for')
        .eq('organisation_id', organisationId)
        .is('branch_id', null)
        .order('calculated_for', { ascending: false })
        .limit(2),
      supabase
        .from('opportunities')
        .select('id, title, kind, stage, summary, why_it_matters, estimated_value_cents, score, classification, closes_on')
        .eq('organisation_id', organisationId)
        .is('deleted_at', null)
        .not('stage', 'in', '("archived")')
        .order('score', { ascending: false, nullsFirst: false })
        .limit(MAX_OPPORTUNITIES),
      supabase
        .from('risks')
        .select('id, title, category, severity, status, likelihood, impact, mitigation')
        .eq('organisation_id', organisationId)
        .in('status', ['open', 'mitigating', 'monitoring'])
        .limit(MAX_RISKS),
      supabase
        .from('goals')
        .select('id, title, status, unit, baseline_value, current_value, target_value, due_on')
        .eq('organisation_id', organisationId)
        .not('status', 'in', '("cancelled")')
        .order('due_on', { ascending: true })
        .limit(MAX_GOALS),
      supabase
        .from('market_signals')
        .select('id, kind, title, summary, relevance, observed_at')
        .eq('organisation_id', organisationId)
        .order('observed_at', { ascending: false })
        .limit(MAX_SIGNALS),
      supabase
        .from('competitor_events')
        .select('kind, title, impact, observed_on, competitors!inner(name)')
        .eq('organisation_id', organisationId)
        .order('observed_on', { ascending: false })
        .limit(MAX_COMPETITOR_EVENTS),
      supabase
        .from('data_connections')
        .select('status, last_synced_at, data_sources!inner(name)')
        .eq('organisation_id', organisationId),
      supabase.from('branches').select('id, name').eq('organisation_id', organisationId),
    ]);

    const definitions = metricsResult.data ?? [];
    const values = valuesResult.data ?? [];
    const branches = branchesResult.data ?? [];

    // ── metrics ──────────────────────────────────────────────────────────
    const seriesByMetric = new Map<string, SeriesPoint[]>();
    for (const row of values) {
      const points = seriesByMetric.get(row.metric_id) ?? [];
      points.push({ period: row.period_start, value: Number(row.value) });
      seriesByMetric.set(row.metric_id, points);
    }

    const metrics: MetricSnapshot[] = [];
    const anomalies: AnomalyContext[] = [];
    const healthInputs: HealthMetricInput[] = [];

    for (const definition of definitions) {
      const full = seriesByMetric.get(definition.id) ?? [];
      if (full.length === 0) continue;

      const series = full.slice(-MAX_SERIES_POINTS);
      const current = series[series.length - 1]?.value ?? 0;
      const previous = series.length > 1 ? (series[series.length - 2]?.value ?? null) : null;
      const change = previous === null ? null : percentChange(previous, current);
      const trend = analyseTrend(series);
      const direction = trend?.direction ?? 'flat';

      metrics.push({
        key: definition.key,
        label: definition.label,
        unit: definition.unit,
        category: definition.health_category,
        higherIsBetter: definition.higher_is_better,
        current,
        previous,
        target: definition.target_value === null ? null : Number(definition.target_value),
        changePercent: change === null ? null : roundTo(change, 2),
        direction,
        favourable: isFavourable(direction, definition.higher_is_better),
        series,
        trend,
      });

      const found = detectAnomalies(series);
      const step = detectStepChange(series);
      if (found.length > 0 || step) {
        anomalies.push({
          metricKey: definition.key,
          metricLabel: definition.label,
          anomalies: found,
          stepChange: step,
        });
      }

      if (definition.health_category && definition.target_value !== null) {
        healthInputs.push({
          key: definition.key,
          label: definition.label,
          category: definition.health_category,
          weight: Number(definition.health_weight) || 1,
          value: current,
          target: Number(definition.target_value),
          higherIsBetter: definition.higher_is_better,
        });
      }
    }

    // ── health ───────────────────────────────────────────────────────────
    const weightOverrides: Partial<Record<HealthCategory, number>> = {};
    for (const row of weightsResult.data ?? []) {
      weightOverrides[row.category] = Number(row.weight);
    }

    const health = healthInputs.length > 0 ? calculateHealthScore(healthInputs, weightOverrides) : null;
    const storedScores = healthResult.data ?? [];
    const previousStored = storedScores[1]?.score;
    const previousScore = previousStored === undefined ? null : Number(previousStored);

    // ── the rest ─────────────────────────────────────────────────────────
    const now = new Date();

    const goals: GoalContext[] = (goalsResult.data ?? []).map((g) => {
      const baseline = g.baseline_value === null ? null : Number(g.baseline_value);
      const current = g.current_value === null ? null : Number(g.current_value);
      const target = Number(g.target_value);
      return {
        id: g.id,
        title: g.title,
        status: g.status,
        unit: g.unit,
        baseline,
        current,
        target,
        progress: goalProgress(baseline, current, target),
        dueOn: g.due_on,
        daysRemaining: Math.ceil((new Date(g.due_on).getTime() - now.getTime()) / 86_400_000),
      };
    });

    const opportunities: OpportunityContext[] = (opportunitiesResult.data ?? []).map((o) => ({
      id: o.id,
      title: o.title,
      kind: o.kind,
      stage: o.stage,
      summary: o.summary,
      whyItMatters: o.why_it_matters,
      estimatedValueCents: o.estimated_value_cents === null ? null : Number(o.estimated_value_cents),
      score: o.score === null ? null : Number(o.score),
      classification: o.classification,
      closesOn: o.closes_on,
    }));

    const risks: RiskContext[] = (risksResult.data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      severity: r.severity,
      status: r.status,
      likelihood: r.likelihood,
      impact: r.impact,
      mitigation: r.mitigation,
    }));

    const signals: SignalContext[] = (signalsResult.data ?? []).map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title,
      summary: s.summary,
      relevance: Number(s.relevance),
      observedAt: s.observed_at,
    }));

    const competitorEvents: CompetitorEventContext[] = (competitorEventsResult.data ?? []).map((e) => ({
      competitorName: (e.competitors as unknown as { name: string } | null)?.name ?? 'Unknown',
      kind: e.kind,
      title: e.title,
      impact: e.impact,
      observedOn: e.observed_on,
    }));

    const dataHealth: DataHealthContext[] = (dataHealthResult.data ?? []).map((c) => ({
      sourceName: (c.data_sources as unknown as { name: string } | null)?.name ?? 'Unnamed source',
      completeness: 0,
      freshnessHours:
        c.last_synced_at === null
          ? null
          : roundTo((now.getTime() - new Date(c.last_synced_at).getTime()) / 3_600_000, 1),
      status: c.status,
    }));

    const periods = metrics[0]?.series ?? [];

    return {
      organisation: {
        id: workspace.organisation.id,
        name: workspace.organisation.name,
        industry: workspace.organisation.industry,
        currencyCode: workspace.organisation.currency_code,
        countryCode: workspace.organisation.country_code,
        strategyProfile: readStrategyProfile(workspace.organisation.strategy_profile),
        branchCount: branches.length,
        viewerScope: {
          kind: workspace.scope.kind,
          label: workspace.scope.label,
          branchNames: branches.map((b) => b.name),
        },
      },
      period: {
        start: periods[0]?.period ?? now.toISOString().slice(0, 10),
        end: periods[periods.length - 1]?.period ?? now.toISOString().slice(0, 10),
        label: periods.length > 0 ? `Last ${periods.length} periods` : 'No data yet',
      },
      health,
      healthTrend: {
        previousScore,
        changePoints:
          health && previousScore !== null ? roundTo(health.score - previousScore, 2) : null,
      },
      metrics,
      anomalies,
      opportunities,
      risks,
      goals,
      signals,
      competitorEvents,
      dataHealth,
      generatedAt: now.toISOString(),
    };
  },
);

/** 0-1 share of the distance from baseline to target that has been covered. */
function goalProgress(baseline: number | null, current: number | null, target: number): number {
  if (current === null) return 0;
  const from = baseline ?? 0;
  const distance = target - from;
  if (distance === 0) return current >= target ? 1 : 0;
  return Math.max(0, Math.min(1, (current - from) / distance));
}

function readStrategyProfile(value: Json): {
  markets: string[];
  segments: string[];
  capabilities: string[];
  growthIntents: string[];
} {
  const empty = { markets: [], segments: [], capabilities: [], growthIntents: [] };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return empty;

  const strings = (key: string): string[] => {
    const raw = value[key];
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
  };

  return {
    markets: strings('markets'),
    segments: strings('segments'),
    capabilities: strings('capabilities'),
    growthIntents: strings('growth_intents'),
  };
}

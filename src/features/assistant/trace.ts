import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Chain, Provenance } from './explain';

/**
 * Resolving a figure's provenance chain from the database.
 *
 * Read through the customer's own session, so a figure they may not see
 * produces nothing rather than a partial answer. Every link that cannot be
 * resolved comes back null and is reported as unknown by the explainer —
 * never quietly dropped, and never filled in.
 */

/** The tables a figure can be explained from. */
const TRACEABLE = {
  business_insights: { label: 'title', p10: 'impact_p10_cents', p50: 'impact_p50_cents', p90: 'impact_p90_cents' },
  ai_recommendations: { label: 'title', p10: 'impact_p10_cents', p50: 'impact_p50_cents', p90: 'impact_p90_cents' },
  opportunities: { label: 'title', p10: 'value_p10_cents', p50: 'value_p50_cents', p90: 'value_p90_cents' },
} as const;

export type TraceableTable = keyof typeof TRACEABLE;

export function isTraceable(table: string): table is TraceableTable {
  return Object.prototype.hasOwnProperty.call(TRACEABLE, table);
}

/**
 * A brief line, which cites something else.
 *
 * Handled separately because a brief item is not itself a figure with
 * provenance of its own in the same sense — it is a pointer, and the honest
 * explanation is the chain of the thing it points at, with the pointer named.
 */
export async function traceBriefItem(
  organisationId: string,
  itemId: string,
): Promise<Chain | null> {
  const supabase = await createClient();
  const { data: item } = await supabase
    .from('brief_items')
    .select('id, headline, provenance, source_table, source_id, fidelity_id')
    .eq('id', itemId)
    .eq('organisation_id', organisationId)
    .maybeSingle();

  if (!item) return null;

  // Does the cited record still exist? Asked rather than assumed — a citation
  // that resolves to nothing is the one thing worth saying loudly.
  const resolved = isTraceable(item.source_table)
    ? await traceFigure(organisationId, item.source_table, item.source_id)
    : null;

  if (resolved) {
    return {
      ...resolved,
      citedFrom: { table: item.source_table, id: item.source_id, resolved: true },
    };
  }

  return {
    figure: {
      table: 'brief_items',
      id: item.id,
      label: item.headline,
      provenance: item.provenance as Provenance,
      isProvisional: false,
      range: null,
    },
    run: null,
    fidelity: item.fidelity_id ? await fidelityFor(organisationId, item.fidelity_id) : null,
    citedFrom: {
      table: item.source_table,
      id: item.source_id,
      // Not traceable is not the same as gone, and saying "no longer there"
      // about a financial record nobody deleted would be a lie. Only tables
      // this can actually look in are reported as unresolved.
      resolved: !isTraceable(item.source_table),
    },
  };
}

export async function traceFigure(
  organisationId: string,
  table: TraceableTable,
  id: string,
): Promise<Chain | null> {
  const supabase = await createClient();
  const shape = TRACEABLE[table];

  const { data } = await supabase
    .from(table)
    .select(
      `id, ${shape.label}, provenance, is_provisional, analysis_run_id, fidelity_id, ${shape.p10}, ${shape.p50}, ${shape.p90}`,
    )
    .eq('id', id)
    .eq('organisation_id', organisationId)
    .maybeSingle();

  if (!data) return null;

  const row = data as unknown as Record<string, unknown>;
  const p50 = row[shape.p50];

  return {
    figure: {
      table,
      id,
      label: String(row[shape.label] ?? 'this figure'),
      provenance: row.provenance as Provenance,
      isProvisional: row.is_provisional === true,
      // The schema keeps the three together or all null, so testing the middle
      // one is enough — and doing it this way means a half-written interval
      // shows as absent rather than as a range with holes in it.
      range:
        p50 === null || p50 === undefined
          ? null
          : {
              p10: Number(row[shape.p10]),
              p50: Number(p50),
              p90: Number(row[shape.p90]),
            },
    },
    run: typeof row.analysis_run_id === 'string' ? await runFor(organisationId, row.analysis_run_id) : null,
    fidelity: typeof row.fidelity_id === 'string' ? await fidelityFor(organisationId, row.fidelity_id) : null,
    citedFrom: null,
  };
}

async function runFor(organisationId: string, runId: string): Promise<Chain['run']> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('analysis_runs')
    .select('id, trigger, quality_score, is_provisional, expansion_suppressed, gaps, finished_at')
    .eq('id', runId)
    .eq('organisation_id', organisationId)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    trigger: data.trigger,
    qualityScore: data.quality_score,
    isProvisional: data.is_provisional,
    expansionSuppressed: data.expansion_suppressed,
    gaps: Array.isArray(data.gaps) ? (data.gaps as string[]) : [],
    finishedAt: data.finished_at,
  };
}

async function fidelityFor(organisationId: string, fidelityId: string): Promise<Chain['fidelity']> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('twin_fidelity')
    .select('id, status, score, months_available, error_pct')
    .eq('id', fidelityId)
    .eq('organisation_id', organisationId)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    status: data.status as 'measured' | 'not_measurable' | 'stale',
    score: data.score,
    monthsAvailable: data.months_available,
    // numeric arrives as a string; an empty one must not become a confident 0.
    errorPct: data.error_pct === null ? null : Number(data.error_pct),
  };
}

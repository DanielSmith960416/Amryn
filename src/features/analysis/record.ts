import 'server-only';
import { createClient } from '@/lib/supabase/server';

/**
 * The latest reading of this business, as a screen needs it.
 *
 * Read through the customer's own session rather than the service role: the
 * policy on analysis_runs is `amryn.is_member(organisation_id)`, so a caller
 * who should not see a run gets no row rather than a filtered one. The tenant
 * boundary is the database's, not this function's.
 */
export interface LatestRun {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'superseded';
  isProvisional: boolean;
  expansionSuppressed: boolean;
  qualityScore: number | null;
  insightCount: number;
  gaps: string[];
  finishedAt: string | null;
  error: string | null;
}

export async function latestRunFor(organisationId: string): Promise<LatestRun | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('analysis_runs')
    .select(
      'id, status, is_provisional, expansion_suppressed, quality_score, insight_count, gaps, finished_at, error',
    )
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // A screen that cannot read the run should show the rest of itself rather
  // than an error page. The banner is context, not the point of the page.
  if (error || !data) return null;

  return {
    id: data.id,
    status: data.status,
    isProvisional: data.is_provisional,
    expansionSuppressed: data.expansion_suppressed,
    qualityScore: data.quality_score,
    insightCount: data.insight_count,
    gaps: Array.isArray(data.gaps) ? (data.gaps as string[]) : [],
    finishedAt: data.finished_at,
    error: data.error,
  };
}

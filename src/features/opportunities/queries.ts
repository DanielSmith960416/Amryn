import 'server-only';

/**
 * Opportunity reads.
 *
 * Every query goes through the caller's own Supabase client, so RLS applies
 * both the organisation boundary and the customer's sector scope before a row
 * is returned. Nothing here re-filters — doing so would only invite the two
 * layers to disagree.
 */
import { createClient } from '@/lib/supabase/server';
import type { OpportunityCardData } from '@/components/opportunities/opportunity-card';
import type { OpportunityClassification } from '@/lib/engines/opportunity-score';
import type { Enums, Row } from '@/types/database';

export type OpportunityRow = Row<'opportunities'>;

export async function listOpportunities(options: {
  organisationId: string;
  savedOnly?: boolean;
  stages?: Enums['opportunity_stage'][];
  limit?: number;
}): Promise<OpportunityCardData[]> {
  const supabase = await createClient();

  let query = supabase
    .from('opportunities')
    .select('*')
    .eq('organisation_id', options.organisationId)
    .is('deleted_at', null)
    .order('score', { ascending: false, nullsFirst: false });

  if (options.savedOnly) query = query.eq('is_saved', true);
  if (options.stages && options.stages.length > 0) query = query.in('stage', options.stages);
  if (options.limit) query = query.limit(options.limit);

  const { data } = await query;
  return (data ?? []).map(toCardData);
}

export function toCardData(row: OpportunityRow): OpportunityCardData {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    stage: row.stage,
    counterparty: row.counterparty,
    summary: row.summary,
    whyItMatters: row.why_it_matters,
    recommendedAction: row.recommended_action,
    estimatedValueCents:
      row.estimated_value_cents === null ? null : Number(row.estimated_value_cents),
    score: row.score === null ? null : Number(row.score),
    classification: (row.classification as OpportunityClassification | null) ?? null,
    closesOn: row.closes_on,
    sourceUrls: row.source_urls,
    isSaved: row.is_saved,
  };
}

/** The pipeline, bucketed by stage in the order the specification defines. */
export function groupByStage(
  opportunities: readonly OpportunityCardData[],
): { stage: Enums['opportunity_stage']; items: OpportunityCardData[]; valueCents: number }[] {
  const order: Enums['opportunity_stage'][] = [
    'discovered',
    'analysing',
    'qualified',
    'assigned',
    'in_progress',
    'won',
    'lost',
  ];

  return order.map((stage) => {
    const items = opportunities.filter((o) => o.stage === stage);
    return {
      stage,
      items,
      valueCents: items.reduce((sum, o) => sum + (o.estimatedValueCents ?? 0), 0),
    };
  });
}

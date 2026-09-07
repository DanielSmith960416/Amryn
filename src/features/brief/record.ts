import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { EmptySection, Provenance, Section } from './compose';

/**
 * Reading a brief back, through the customer's own session.
 *
 * daily_briefs and brief_items both carry `amryn.is_member(organisation_id)`
 * and forced RLS, so a caller who should not see a brief gets no row rather
 * than a filtered one. Nothing here re-implements the tenant boundary.
 */

export interface StoredItem {
  id: string;
  section: Section;
  rank: number;
  headline: string;
  detail: string;
  impactCents: number | null;
  provenance: Provenance;
  sourceTable: string;
  sourceId: string;
}

export interface StoredBrief {
  id: string;
  briefDate: string;
  generatedAt: string;
  items: StoredItem[];
  empty: EmptySection[];
  emailedAt: string | null;
  emailSkipped: string | null;
}

/** The brief for a given morning, or the most recent one. */
export async function briefFor(
  organisationId: string,
  briefDate?: string,
): Promise<StoredBrief | null> {
  const supabase = await createClient();

  let query = supabase
    .from('daily_briefs')
    .select('id, brief_date, generated_at, empty_sections, emailed_at, email_skipped')
    .eq('organisation_id', organisationId);

  query = briefDate ? query.eq('brief_date', briefDate) : query.order('brief_date', { ascending: false });

  const { data: brief } = await query.limit(1).maybeSingle();
  if (!brief) return null;

  const { data: items } = await supabase
    .from('brief_items')
    .select('id, section, rank, headline, detail, impact_cents, provenance, source_table, source_id')
    .eq('brief_id', brief.id)
    .order('rank', { ascending: true });

  return {
    id: brief.id,
    briefDate: brief.brief_date,
    generatedAt: brief.generated_at,
    emailedAt: brief.emailed_at,
    emailSkipped: brief.email_skipped,
    empty: Array.isArray(brief.empty_sections) ? (brief.empty_sections as unknown as EmptySection[]) : [],
    items: (items ?? []).map((row) => ({
      id: row.id,
      section: row.section as Section,
      rank: row.rank,
      headline: row.headline,
      detail: row.detail,
      // bigint arrives as a string; null is a real answer and must not become 0.
      impactCents: row.impact_cents === null ? null : Number(row.impact_cents),
      provenance: row.provenance as Provenance,
      sourceTable: row.source_table,
      sourceId: row.source_id,
    })),
  };
}

/** The last fortnight of mornings, for the picker. */
export async function recentBriefs(
  organisationId: string,
  limit = 14,
): Promise<{ briefDate: string; itemCount: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('daily_briefs')
    .select('brief_date, item_count')
    .eq('organisation_id', organisationId)
    .order('brief_date', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({ briefDate: row.brief_date, itemCount: row.item_count }));
}

/** Whether the brief is switched on for this organisation. Absent means off. */
export async function briefEnabled(organisationId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('organisation_feature_flags')
    .select('enabled')
    .eq('organisation_id', organisationId)
    .eq('flag_key', 'daily_brief')
    .maybeSingle();

  return data?.enabled === true;
}

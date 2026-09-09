import 'server-only';
import { createClient } from '@/lib/supabase/server';

/**
 * Reading proposals, through the customer's own session.
 *
 * `proposals` carries `amryn.is_member(organisation_id)` and forced RLS, so a
 * caller who should not see one gets no row rather than a filtered one.
 */

export type ProposalStatus = 'pending' | 'accepted' | 'declined' | 'superseded';

export interface Proposal {
  id: string;
  targetTable: string;
  targetField: string;
  currentValue: string | null;
  proposedValue: string;
  rationale: string;
  status: ProposalStatus;
  conversationId: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

const COLUMNS =
  'id, target_table, target_field, current_value, proposed_value, rationale, status, conversation_id, decision_note, decided_at, created_at';

export async function pendingProposals(organisationId: string): Promise<Proposal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('proposals')
    .select(COLUMNS)
    .eq('organisation_id', organisationId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  return (data ?? []).map(shape);
}

/**
 * What has been decided, newest first.
 *
 * Shown rather than hidden, because a declined proposal is the record that
 * somebody already said no — and the reason they gave is what stops the same
 * argument being had again.
 */
export async function decidedProposals(
  organisationId: string,
  limit = 20,
): Promise<Proposal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('proposals')
    .select(COLUMNS)
    .eq('organisation_id', organisationId)
    .neq('status', 'pending')
    .order('decided_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map(shape);
}

function shape(row: {
  id: string;
  target_table: string;
  target_field: string;
  current_value: string | null;
  proposed_value: string;
  rationale: string;
  status: string;
  conversation_id: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}): Proposal {
  return {
    id: row.id,
    targetTable: row.target_table,
    targetField: row.target_field,
    currentValue: row.current_value,
    proposedValue: row.proposed_value,
    rationale: row.rationale,
    status: row.status as ProposalStatus,
    conversationId: row.conversation_id,
    decisionNote: row.decision_note,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

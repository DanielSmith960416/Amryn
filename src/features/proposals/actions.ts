'use server';

/**
 * Deciding a proposal.
 *
 * ── accepting writes; nothing else does ───────────────────────────────────
 *
 * This is the only place in the platform where a suggested change becomes a
 * real one, and it happens because a person with `manage_organisation` pressed
 * a button. Migration 32 has no trigger and no rule that applies a proposal,
 * and a test asserts that — so "accepted" cannot come to mean anything other
 * than "a human said yes and the write followed".
 *
 * ── accepted has to mean applied ──────────────────────────────────────────
 *
 * The easy version records the acceptance and leaves the writing to somebody,
 * which puts a green tick beside a field that never moved. So a proposal whose
 * target this platform cannot write is refused at the point of accepting, by
 * name. Today that is anything but an Imprint field.
 *
 * ── and a stale proposal is refused rather than forced ────────────────────
 *
 * If the field has moved since the proposal was raised, accepting would
 * overwrite a person's answer with a suggestion neither of them knew was
 * competing. That is reported as stale, and the proposal is marked superseded
 * so it stops asking.
 */
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { recordEvent } from '@/lib/audit';
import { ourFault } from '@/lib/errors';
import { layerOwning } from '@/features/imprint/layers';
import { applyToLayer, isApplicable, stillMatches } from './apply';
import type { Json } from '@/types/database';

export type DecisionState =
  | { status: 'idle' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

const WHERE = '/proposals';

const fail = (message: string): DecisionState => ({ status: 'error', message });

/**
 * Says no, and records why.
 *
 * The note is not decoration. A declined proposal with no reason is one
 * somebody will raise again, and the second refusal costs the same
 * conversation as the first.
 */
export async function declineProposal(
  _previous: DecisionState,
  form: FormData,
): Promise<DecisionState> {
  const workspace = await requirePermission('manage_organisation');
  const id = form.get('id');
  const note = ((form.get('note') as string) ?? '').trim();

  if (typeof id !== 'string' || id === '') return fail('That suggestion could not be found.');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('proposals')
    .update({
      status: 'declined',
      decided_at: new Date().toISOString(),
      decided_by: workspace.user.id,
      decision_note: note === '' ? null : note,
    })
    .eq('id', id)
    .eq('organisation_id', workspace.organisation.id)
    .eq('status', 'pending')
    .select('target_field')
    .maybeSingle();

  if (error) return fail(ourFault('proposals', error));
  if (!data) return fail('That suggestion has already been decided.');

  await recordEvent(workspace.organisation.id, 'proposal.declined', {
    entityType: 'proposal',
    entityId: id,
    summary: `Declined the suggested change to ${data.target_field}`,
  });

  revalidatePath(WHERE);
  return { status: 'done', message: 'Declined. It will not be raised again.' };
}

/**
 * Says yes, and makes it so.
 *
 * The order matters: the write happens first and the status second, because a
 * proposal marked accepted whose write then failed is exactly the untruth this
 * whole design exists to prevent. The other way round — a write that lands and
 * a status that does not — leaves the proposal pending, which is visible and
 * recoverable.
 */
export async function acceptProposal(
  _previous: DecisionState,
  form: FormData,
): Promise<DecisionState> {
  const workspace = await requirePermission('manage_organisation');
  const id = form.get('id');
  if (typeof id !== 'string' || id === '') return fail('That suggestion could not be found.');

  const supabase = await createClient();
  const organisationId = workspace.organisation.id;

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, target_table, target_field, current_value, proposed_value')
    .eq('id', id)
    .eq('organisation_id', organisationId)
    .eq('status', 'pending')
    .maybeSingle();

  if (!proposal) return fail('That suggestion has already been decided.');

  if (!isApplicable(proposal.target_table)) {
    return fail(
      `This suggestion changes ${proposal.target_table}, which the platform cannot write yet. ` +
        'It is left pending rather than marked accepted, because a tick beside a change that ' +
        'never happened is worse than no tick.',
    );
  }

  const layerId = layerOwning(proposal.target_field);
  if (!layerId) {
    return fail(
      `Nothing in the Imprint defines a field called "${proposal.target_field}" any more, ` +
        'so there is nowhere to write it.',
    );
  }

  const { data: layer } = await supabase
    .from('imprint_layers')
    .select('answers, gaps')
    .eq('organisation_id', organisationId)
    .eq('layer', layerId)
    .maybeSingle();

  if (!layer) return fail('That part of the Imprint has not been started yet.');

  const answers = (layer.answers as Record<string, unknown> | null) ?? null;

  if (!stillMatches(answers, proposal.target_field, proposal.current_value)) {
    await supabase
      .from('proposals')
      .update({
        status: 'superseded',
        decided_at: new Date().toISOString(),
        decided_by: workspace.user.id,
        decision_note: 'The field changed after this was suggested.',
      })
      .eq('id', id)
      .eq('organisation_id', organisationId);

    revalidatePath(WHERE);
    return fail(
      'Somebody answered that field after this was suggested, so accepting would overwrite ' +
        'their answer. It has been marked superseded — the suggestion can be made again ' +
        'against what the field says now.',
    );
  }

  const plan = applyToLayer(
    { answers, gaps: layer.gaps },
    proposal.target_field,
    proposal.proposed_value,
  );

  if (!plan.ok) return fail(`This could not be applied: ${plan.reason}.`);

  // The write first. See the note above on ordering.
  const { error: wrote } = await supabase
    .from('imprint_layers')
    .update({ answers: plan.answers as Json, gaps: plan.gaps })
    .eq('organisation_id', organisationId)
    .eq('layer', layerId);

  if (wrote) return fail(ourFault('proposals', wrote));

  const { error: marked } = await supabase
    .from('proposals')
    .update({
      status: 'accepted',
      decided_at: new Date().toISOString(),
      decided_by: workspace.user.id,
    })
    .eq('id', id)
    .eq('organisation_id', organisationId);

  if (marked) {
    // The change is in. Saying so beats a silent success that leaves somebody
    // wondering why the suggestion is still on the list.
    return fail(
      'The change was applied, but the suggestion could not be marked accepted. ' +
        'It will still show as waiting — declining it now is harmless.',
    );
  }

  await recordEvent(organisationId, 'proposal.accepted', {
    entityType: 'proposal',
    entityId: id,
    summary: `Applied the suggested change to ${proposal.target_field}`,
  });

  revalidatePath(WHERE);
  revalidatePath('/imprint');
  return {
    status: 'done',
    message: `Applied. ${proposal.target_field} now reads ${proposal.proposed_value}.`,
  };
}

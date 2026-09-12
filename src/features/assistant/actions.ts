'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { assertPermission, requireWorkspace } from '@/lib/auth/session';
import { recordEvent } from '@/lib/audit';
import { buildBusinessContext } from '@/features/intelligence/context';
import { askAssistant, type AssistantTurn } from '@/lib/ai/intelligence';
import { threadTitle } from './threads';

const questionSchema = z.object({
  question: z.string().trim().min(3, 'Ask a question').max(2000),
  conversationId: z.string().uuid().nullable(),
});

export type AssistantState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'answered'; conversationId: string };

/**
 * Asks the assistant a question and records both turns.
 *
 * The context is rebuilt per question rather than cached across the thread: a
 * conversation that ran for an hour should answer from the business as it is
 * now, not as it was when the thread opened.
 */
export async function ask(
  _previous: AssistantState,
  formData: FormData,
): Promise<AssistantState> {
  const workspace = await requireWorkspace();

  try {
    assertPermission(workspace, 'use_ai_assistant');
  } catch {
    return { status: 'error', message: 'You do not have access to the AI Assistant.' };
  }

  const raw = formData.get('conversationId');
  const parsed = questionSchema.safeParse({
    question: formData.get('question'),
    conversationId: typeof raw === 'string' && raw.length > 0 ? raw : null,
  });

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Ask a question.' };
  }

  const supabase = await createClient();
  const organisationId = workspace.organisation.id;

  // Reuse the thread if one was passed, otherwise open one titled by the question.
  let conversationId = parsed.data.conversationId;
  if (!conversationId) {
    const { data, error } = await supabase
      .from('ai_conversations')
      .insert({
        organisation_id: organisationId,
        user_id: workspace.user.id,
        title: parsed.data.question.slice(0, 80),
      })
      .select('id')
      .single();

    if (error || !data) {
      return { status: 'error', message: 'Could not start that conversation.' };
    }
    conversationId = data.id;
  }

  const { data: previousMessages } = await supabase
    .from('ai_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(20);

  const history: AssistantTurn[] = (previousMessages ?? [])
    .filter(
      (m): m is { role: 'user' | 'assistant'; content: string } =>
        m.role === 'user' || m.role === 'assistant',
    )
    .map((m) => ({ role: m.role, content: m.content }));

  const context = await buildBusinessContext(workspace);
  const answer = await askAssistant(context, parsed.data.question, history);

  await supabase.from('ai_messages').insert([
    {
      organisation_id: organisationId,
      conversation_id: conversationId,
      role: 'user',
      content: parsed.data.question,
    },
    {
      organisation_id: organisationId,
      conversation_id: conversationId,
      role: 'assistant',
      content: answer.content,
      model: answer.model,
      tokens_used: answer.tokensUsed,
    },
  ]);

  revalidatePath('/assistant');
  return { status: 'answered', conversationId };
}

/* ── the list ──────────────────────────────────────────────────────────────
 *
 * Three actions that manage threads rather than talk to the model. They share
 * `ask`'s permission check and its habit of returning a message rather than
 * throwing, because every one of them is submitted from the sidebar and a
 * thrown error there replaces the whole page with an error boundary.
 *
 * None of them names a conversation it has not first confirmed belongs to the
 * reader. Row Level Security would refuse anyway — `ai_conversations_own`
 * matches on `user_id = auth.uid()` — but a refusal that arrives as "0 rows
 * updated" is indistinguishable from a thread that has already been cleared,
 * and the two deserve different sentences.
 * ────────────────────────────────────────────────────────────────────────── */

const threadSchema = z.object({ conversationId: z.string().uuid() });
const renameSchema = threadSchema.extend({
  // Trimmed, and bounded at the length the column is happy with and the
  // sidebar can show. An empty title is a rename to nothing, which the list
  // would render as the default and the reader would read as a failure.
  title: z.string().trim().min(1, 'Give it a name').max(120),
});

export type ThreadState = { status: 'idle' } | { status: 'error'; message: string };

/** Opens an empty thread and selects it. Titled by the database's own default. */
export async function startConversation(): Promise<void> {
  const workspace = await requireWorkspace();
  assertPermission(workspace, 'use_ai_assistant');

  const supabase = await createClient();
  const { data } = await supabase
    .from('ai_conversations')
    .insert({ organisation_id: workspace.organisation.id, user_id: workspace.user.id })
    .select('id')
    .single();

  revalidatePath('/assistant');
  // Landing on the new thread is the point of pressing the button. If the
  // insert failed there is nothing to select, and the page re-renders with the
  // list it had — which is the honest outcome, not a redirect to nowhere.
  if (data) redirect(`/assistant?thread=${data.id}`);
}

/** Renames a thread. The sidebar edits in place, so this returns rather than redirects. */
export async function renameConversation(
  _previous: ThreadState,
  formData: FormData,
): Promise<ThreadState> {
  const workspace = await requireWorkspace();

  try {
    assertPermission(workspace, 'use_ai_assistant');
  } catch {
    return { status: 'error', message: 'You do not have access to the AI Assistant.' };
  }

  const parsed = renameSchema.safeParse({
    conversationId: formData.get('conversationId'),
    title: formData.get('title'),
  });
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Give it a name.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ai_conversations')
    .update({ title: parsed.data.title })
    .eq('id', parsed.data.conversationId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (error) return { status: 'error', message: 'That name would not save.' };
  if (!data) return { status: 'error', message: 'That conversation is no longer in your list.' };

  revalidatePath('/assistant');
  return { status: 'idle' };
}

/**
 * Clears a thread out of the list.
 *
 * The row is marked rather than deleted (migration 45 says why at length), and
 * the act is written to the audit log — which for a soft delete is not
 * ceremony: the thread is still in the database, so without this row there
 * would be no record anywhere of the reader having asked for it to go.
 *
 * The audit write is last. `recordEvent` already swallows its own failures so
 * that a log outage cannot break the thing it is recording, and the ordering
 * makes the same promise the other way round: if the update fails, nothing is
 * written down claiming it happened.
 */
export async function clearConversation(
  _previous: ThreadState,
  formData: FormData,
): Promise<ThreadState> {
  const workspace = await requireWorkspace();

  try {
    assertPermission(workspace, 'use_ai_assistant');
  } catch {
    return { status: 'error', message: 'You do not have access to the AI Assistant.' };
  }

  const parsed = threadSchema.safeParse({ conversationId: formData.get('conversationId') });
  if (!parsed.success) return { status: 'error', message: 'That conversation could not be found.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ai_conversations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', parsed.data.conversationId)
    .is('deleted_at', null)
    .select('id, title')
    .maybeSingle();

  if (error) return { status: 'error', message: 'That conversation could not be cleared.' };
  if (!data) return { status: 'error', message: 'That conversation is no longer in your list.' };

  await recordEvent(workspace.organisation.id, 'assistant.conversation_cleared', {
    entityType: 'ai_conversation',
    entityId: data.id,
    summary: `Cleared "${threadTitle(data.title)}" from the assistant`,
  });

  revalidatePath('/assistant');
  redirect('/assistant');
}

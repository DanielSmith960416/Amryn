'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { assertPermission, requireWorkspace } from '@/lib/auth/session';
import { buildBusinessContext } from '@/features/intelligence/context';
import { askAssistant, type AssistantTurn } from '@/lib/ai/intelligence';

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

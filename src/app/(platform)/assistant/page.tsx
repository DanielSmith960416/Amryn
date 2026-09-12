import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shell/page-header';
import { AssistantConsole, type DisplayMessage } from '@/features/assistant/console';
import { ThreadList, type ThreadSummary } from '@/features/assistant/thread-list';
import {
  readCitations,
  readSuggestedActions,
  readVisualisations,
} from '@/features/assistant/threads';
import { includes, requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'AI Assistant' };

/**
 * The embedded executive assistant (specification §11).
 *
 * It answers from the Business Context Object, which Row Level Security has
 * already narrowed to what this user may read. The permission boundary is not
 * something the model is asked to respect — it is data the model never sees.
 *
 * ── which thread ──────────────────────────────────────────────────────────
 * The selected conversation is in the URL, so a thread can be linked to, comes
 * back on a refresh, and survives the back button. It is also checked rather
 * than trusted: an id belonging to somebody else simply does not come back
 * from the query, and the page falls to the most recent thread instead of
 * showing an empty one that claims to be theirs.
 *
 * Cleared threads are absent from every query here, including the one that
 * loads a named thread — otherwise clearing a conversation and then pressing
 * back would show it again as though nothing had happened.
 */
export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const workspace = await requirePermission('use_ai_assistant');
  // Permission and entitlement are different questions: the person is allowed
  // to use the assistant, and the company may not have bought it.
  if (!includes(workspace, 'ai_assistant')) redirect('/settings/billing?upgrade=ai_assistant');

  const { thread: requested } = await searchParams;
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from('ai_conversations')
    .select('id, title, updated_at')
    .eq('user_id', workspace.user.id)
    .eq('organisation_id', workspace.organisation.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(50);

  const threads: ThreadSummary[] = (rows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
  }));

  // The request decides only whether a thread it names is in the list. Falling
  // back to the top of the list is what makes an id that is stale, cleared or
  // somebody else's land somewhere sensible rather than on an error.
  const selected =
    (requested && threads.some((thread) => thread.id === requested) ? requested : null) ??
    threads[0]?.id ??
    null;

  const { data: messages } = selected
    ? await supabase
        .from('ai_messages')
        .select('id, role, content, citations, visualisations, suggested_actions, created_at')
        .eq('conversation_id', selected)
        .order('created_at', { ascending: true })
    : { data: [] };

  const shown: DisplayMessage[] = (messages ?? [])
    // system and tool turns are part of how an answer was produced, not part
    // of the conversation the reader had. The column permits four roles; two
    // of them belong in the log.
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      id: message.id,
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
      citations: readCitations(message.citations),
      actions: readSuggestedActions(message.suggested_actions),
      visualisations: readVisualisations(message.visualisations),
    }));

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="AI Assistant"
        description="Ask about the business in plain language."
      />

      {/*
        One column on a phone, where the list sits above the thread and both
        scroll with the page; two from `lg`, where the thread gets a height of
        its own so the question box can stay on its bottom edge.
      */}
      <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)] lg:h-[calc(100dvh-14rem)]">
        <aside className="lg:min-h-0">
          <ThreadList threads={threads} activeId={selected} />
        </aside>

        <div className="min-w-0 lg:min-h-0">
          <AssistantConsole conversationId={selected} messages={shown} />
        </div>
      </div>
    </>
  );
}

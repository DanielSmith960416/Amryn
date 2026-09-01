import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AssistantConsole } from '@/features/assistant/console';
import { includes, requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { isAiEnabled } from '@/lib/ai/provider';

export const metadata: Metadata = { title: 'AI Assistant' };

/**
 * The embedded executive assistant (specification §11).
 *
 * It answers from the Business Context Object, which Row Level Security has
 * already narrowed to what this user may read. The permission boundary is not
 * something the model is asked to respect — it is data the model never sees.
 */
export default async function AssistantPage() {
  const workspace = await requirePermission('use_ai_assistant');
  // Permission and entitlement are different questions: the person is allowed
  // to use the assistant, and the company may not have bought it.
  if (!includes(workspace, 'ai_assistant')) redirect('/settings/billing?upgrade=ai_assistant');
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from('ai_conversations')
    .select('id')
    .eq('user_id', workspace.user.id)
    .eq('organisation_id', workspace.organisation.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: messages } = conversation
    ? await supabase
        .from('ai_messages')
        .select('id, role, content, created_at')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })
    : { data: [] };

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="AI Assistant"
        description="Ask about the business in plain language. Answers are drawn only from what you are permitted to see."
        actions={
          <Badge tone={isAiEnabled() ? 'positive' : 'warning'}>
            {isAiEnabled() ? 'Model connected' : 'No model configured'}
          </Badge>
        }
      />

      <div className="mx-auto max-w-3xl">
        <Card className="mb-4" tone="brand">
          <CardBody className="flex gap-3 pt-5">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
              <Sparkles className="size-3.5" aria-hidden />
            </span>
            <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
              Your view is <strong className="text-[var(--text-primary)]">{workspace.scope.label}</strong>.
              The assistant answers from that and nothing wider — not as a rule it has been asked to
              follow, but because data outside your scope never reaches it.
            </p>
          </CardBody>
        </Card>

        <AssistantConsole
          conversationId={conversation?.id ?? null}
          messages={(messages ?? []).map((message) => ({
            id: message.id,
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: message.content,
          }))}
        />
      </div>
    </>
  );
}

'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { Card } from '@/components/ui/card';
import { AnalysingState } from '@/components/ui/states';
import { ask, type AssistantState } from './actions';
import { cn } from '@/lib/utils/cn';

const SUGGESTIONS = [
  'What changed this month?',
  'Which branch is performing worst?',
  'What should I focus on this week?',
  'Which risks need attention?',
];

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function AssistantConsole({
  conversationId,
  messages,
}: {
  conversationId: string | null;
  messages: DisplayMessage[];
}) {
  const [state, action] = useActionState(ask, { status: 'idle' } as AssistantState);
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Clear the box once an answer has landed, and scroll it into view.
  useEffect(() => {
    if (state.status === 'answered') {
      formRef.current?.reset();
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [state]);

  const threadId = state.status === 'answered' ? state.conversationId : conversationId;

  return (
    <div className="space-y-4">
      {messages.length === 0 ? (
        <Card className="p-6">
          <p className="text-[0.9375rem] font-medium text-[var(--text-primary)]">
            Ask anything about the business
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
            Every answer cites the metric, opportunity or risk behind it, so you can check it.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <li key={suggestion}>
                <form action={action}>
                  <input type="hidden" name="conversationId" value={threadId ?? ''} />
                  <input type="hidden" name="question" value={suggestion} />
                  <button
                    type="submit"
                    className="rounded-[var(--radius-pill)] border border-[var(--border-strong)] px-3 py-1.5 text-[0.8125rem] text-[var(--text-secondary)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
                  >
                    {suggestion}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <ul className="space-y-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-[var(--radius-card)] px-4 py-3 text-[0.875rem] leading-relaxed whitespace-pre-wrap',
                  message.role === 'user'
                    ? 'bg-[var(--brand)] text-[var(--on-brand)]'
                    : 'border border-[var(--border)] bg-[var(--card)] text-[var(--text-primary)]',
                )}
              >
                {message.content}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div ref={endRef} />

      <form ref={formRef} action={action}>
        <input type="hidden" name="conversationId" value={threadId ?? ''} />
        <Card className="p-3">
          <Textarea
            name="question"
            rows={3}
            required
            minLength={3}
            placeholder="Why did revenue decline? Compare this quarter to last."
            className="resize-none border-0 !bg-transparent p-0 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            {state.status === 'error' ? (
              <p className="text-[0.75rem] text-[var(--negative)]" role="alert">
                {state.message}
              </p>
            ) : (
              <span />
            )}
            <Submit />
          </div>
        </Card>
        <Pending />
      </form>
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      <Send className="size-3.5" aria-hidden />
      {pending ? 'Thinking…' : 'Ask'}
    </Button>
  );
}

function Pending() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return <AnalysingState message="Amryn is reading your business context" />;
}

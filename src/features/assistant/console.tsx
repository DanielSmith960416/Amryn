'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { Card } from '@/components/ui/card';
import { AnalysingState } from '@/components/ui/states';
import { withBasePath } from '@/lib/base-path';
import { ask, type AssistantState } from './actions';
import {
  citationHref,
  citationLabel,
  type Citation,
  type SuggestedAction,
  type Visualisation,
} from './threads';
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
  citations: Citation[];
  actions: SuggestedAction[];
  visualisations: Visualisation[];
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
    /*
     * A column that fills the space the page gives it: the thread scrolls, the
     * box stays on the bottom edge. `min-h-0` on the scrolling child is what
     * makes that work — without it a flex child refuses to shrink below its
     * content and the box is pushed off the screen by a long conversation.
     */
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <EmptyThread action={action} threadId={threadId} />
        ) : (
          <ul className="space-y-4 pb-2">
            {messages.map((message) => (
              <li key={message.id}>
                {message.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-[var(--radius-card)] bg-[var(--brand)] px-4 py-3 text-[0.875rem] leading-relaxed whitespace-pre-wrap text-[var(--on-brand)]">
                      {message.content}
                    </div>
                  </div>
                ) : (
                  <Answer message={message} />
                )}
              </li>
            ))}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      <form ref={formRef} action={action} className="mt-3 shrink-0">
        <input type="hidden" name="conversationId" value={threadId ?? ''} />
        <Card className="p-3">
          <Textarea
            name="question"
            rows={2}
            required
            minLength={3}
            placeholder="Why did revenue decline? Compare this quarter to last."
            className="max-h-40 min-h-[3rem] resize-y border-0 !bg-transparent p-0 focus:outline-none"
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

/**
 * An assistant turn: the words, then whatever the message carries with them.
 *
 * The mark stands in for an avatar. It is the same file the sign-in page and
 * the tab icon use, at 20px and slightly faded — a picture of who is speaking,
 * not a second logo competing with the one in the corner.
 */
function Answer({ message }: { message: DisplayMessage }) {
  return (
    <div className="flex justify-start gap-2.5">
      <Image
        src={withBasePath('/brand/amryn-icon-mark.png')}
        alt=""
        aria-hidden
        width={553}
        height={563}
        className="mt-1 h-5 w-auto shrink-0 opacity-70"
      />
      <div className="min-w-0 max-w-[85%] rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <p className="text-[0.875rem] leading-relaxed whitespace-pre-wrap text-[var(--text-primary)]">
          {message.content}
        </p>

        {message.citations.length > 0 ? (
          <div className="mt-3 border-t border-[var(--border)] pt-2.5">
            <p className="font-mono text-[0.625rem] tracking-[0.12em] text-[var(--text-tertiary)]">
              Drawn from
            </p>
            <ul className="mt-1.5 space-y-1">
              {message.citations.map((citation, index) => {
                const href = citationHref(citation);
                const label = citationLabel(citation);
                return (
                  <li key={`${citation.table}:${citation.id}:${index}`} className="text-[0.8125rem]">
                    {href ? (
                      <Link
                        href={href}
                        className="text-[var(--brand)] underline underline-offset-2 hover:opacity-80"
                      >
                        {label}
                      </Link>
                    ) : (
                      /* No link, because /explain cannot resolve this table and
                         a citation that 404s is worse than one that is only a
                         name. */
                      <span className="text-[var(--text-secondary)]">{label}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {message.actions.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {message.actions.map((suggested) => (
              <li key={`${suggested.label}:${suggested.href}`}>
                <Link
                  href={suggested.href}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border-strong)] px-2.5 py-1 text-[0.75rem] text-[var(--text-secondary)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
                >
                  {suggested.label}
                  <ArrowUpRight className="size-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {message.visualisations.length > 0 ? (
          /*
           * Named, not drawn. Nothing writes this column yet, so there is no
           * series to plot and no agreed shape to plot it from; saying a chart
           * was suggested is true, and rendering an empty axis would not be.
           */
          <p className="mt-3 font-mono text-[0.625rem] tracking-[0.12em] text-[var(--text-tertiary)]">
            {message.visualisations
              .map((visualisation) => visualisation.title ?? visualisation.kind)
              .join(' · ')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function EmptyThread({
  action,
  threadId,
}: {
  action: (formData: FormData) => void;
  threadId: string | null;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-10 text-center">
      {/*
        The mark and the wordmark, composed the way the top bar composes them
        — not the lockup file.

        The lockup is a second drawing of the name: its own letterforms, its
        own spacing, the tagline locked underneath. Correct artwork, and
        correct on a sign-in card or a footer where nothing else is competing.
        Here it sat a few centimetres below the bar doing the same job in
        different type, and two versions of a name on one screen read as two
        products rather than one.
      */}
      <div className="flex items-center gap-2.5">
        {/* Supplied artwork only — never recoloured, stretched or outlined. */}
        <Image
          src={withBasePath('/brand/amryn-icon-mark.png')}
          alt=""
          aria-hidden
          width={553}
          height={563}
          className="h-9 w-auto"
        />
        <span className="font-display text-[1.625rem] font-extrabold tracking-tight text-[var(--text-primary)]">
          Amryn<span className="tm">™</span>
        </span>
      </div>
      <p className="font-display mt-5 text-[1.0625rem] font-semibold text-[var(--text-primary)]">
        Ask your DigitalTwin<sup className="tm">®</sup> anything
      </p>
      <p className="mt-1.5 max-w-sm text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        Every answer cites the metric, opportunity or risk behind it, so you can check it.
      </p>
      <ul className="mt-5 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>
            <form action={action}>
              <input type="hidden" name="conversationId" value={threadId ?? ''} />
              <input type="hidden" name="question" value={suggestion} />
              <button
                type="submit"
                className={cn(
                  'rounded-[var(--radius-pill)] border border-[var(--border-strong)] px-3 py-1.5',
                  'text-[0.8125rem] text-[var(--text-secondary)] transition-colors',
                  'hover:border-[var(--brand)] hover:text-[var(--brand)]',
                )}
              >
                {suggestion}
              </button>
            </form>
          </li>
        ))}
      </ul>
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

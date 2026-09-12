'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, MessageSquare, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils/cn';
import {
  clearConversation,
  renameConversation,
  startConversation,
  type ThreadState,
} from './actions';
import { threadTitle } from './threads';

export interface ThreadSummary {
  id: string;
  title: string;
  updatedAt: string;
}

const idle: ThreadState = { status: 'idle' };

/**
 * The conversations this reader has held, most recently used first.
 *
 * "Most recently used" is the ordering the page asks the database for, and it
 * only became true in migration 45 — until then a thread's `updated_at` moved
 * when its title changed and not when anybody spoke in it.
 *
 * Threads are private to the person who held them, not shared across the
 * organisation: the policy behind this list matches on `user_id`, so this is
 * "your conversations" and never a colleague's. The heading says so, because a
 * list that silently omits other people's is indistinguishable from a list
 * that is broken.
 */
export function ThreadList({
  threads,
  activeId,
}: {
  threads: ThreadSummary[];
  activeId: string | null;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-3 px-1 pb-3">
        <p className="font-mono text-[0.6875rem] tracking-[0.12em] text-[var(--text-tertiary)]">
          Your conversations
        </p>
        <span className="text-[0.75rem] text-[var(--text-tertiary)]">{threads.length}</span>
      </div>

      <form action={startConversation}>
        <Button type="submit" variant="secondary" size="sm" className="w-full justify-center">
          <Plus aria-hidden /> New conversation
        </Button>
      </form>

      {threads.length === 0 ? (
        <p className="mt-4 px-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          Nothing yet. Ask a question and it will be kept here.
        </p>
      ) : (
        <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
          {threads.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} active={thread.id === activeId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ThreadRow({ thread, active }: { thread: ThreadSummary; active: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [renameState, rename] = useActionState(renameConversation, idle);
  const [clearState, clear] = useActionState(clearConversation, idle);
  const clearForm = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Leave the editor only once the rename has actually been accepted. Closing
  // on submit would hide the message explaining why it was not.
  useEffect(() => {
    if (renameState.status === 'idle' && editing) setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renameState]);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const shown = threadTitle(thread.title);

  if (editing) {
    return (
      <li>
        <form
          action={rename}
          className="flex items-center gap-1 rounded-[var(--radius-tile)] border border-[var(--brand)] bg-[var(--card)] px-2 py-1.5"
        >
          <input type="hidden" name="conversationId" value={thread.id} />
          <input
            ref={input}
            name="title"
            defaultValue={shown}
            maxLength={120}
            aria-label="Conversation name"
            className="min-w-0 flex-1 bg-transparent text-[0.8125rem] text-[var(--text-primary)] focus:outline-none"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditing(false);
            }}
          />
          <button
            type="submit"
            aria-label="Save this name"
            className="rounded p-1 text-[var(--brand)] hover:bg-[var(--card-inset)]"
          >
            <Check className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Leave the name as it was"
            onClick={() => setEditing(false)}
            className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--card-inset)]"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </form>
        {renameState.status === 'error' ? (
          <p className="mt-1 px-2 text-[0.75rem] text-[var(--negative)]" role="alert">
            {renameState.message}
          </p>
        ) : null}
      </li>
    );
  }

  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-[var(--radius-tile)] pr-1 transition-colors',
          active ? 'bg-[var(--card-inset)]' : 'hover:bg-[var(--card-inset)]',
        )}
      >
        <Link
          href={`/assistant?thread=${thread.id}`}
          aria-current={active ? 'page' : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-[0.8125rem]"
        >
          <MessageSquare
            className={cn(
              'size-3.5 shrink-0',
              active ? 'text-[var(--brand)]' : 'text-[var(--text-tertiary)]',
            )}
            aria-hidden
          />
          <span
            className={cn(
              'truncate',
              active
                ? 'font-medium text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)]',
            )}
          >
            {shown}
          </span>
        </Link>

        {/*
          Shown on hover on a pointer, and always once focus is inside the row,
          so the two controls are reachable from the keyboard rather than
          hidden behind an interaction a keyboard cannot perform.
        */}
        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            aria-label={`Rename ${shown}`}
            onClick={() => setEditing(true)}
            className="rounded p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Clear ${shown}`}
            onClick={() => setConfirming(true)}
            className="rounded p-1.5 text-[var(--text-tertiary)] hover:text-[var(--negative)]"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {clearState.status === 'error' ? (
        <p className="mt-1 px-2 text-[0.75rem] text-[var(--negative)]" role="alert">
          {clearState.message}
        </p>
      ) : null}

      <form ref={clearForm} action={clear} className="hidden">
        <input type="hidden" name="conversationId" value={thread.id} />
      </form>

      <ConfirmDialog
        open={confirming}
        title="Clear this conversation?"
        /*
          The exact promise the database keeps, and no more. The thread is
          marked and filtered out, not destroyed — so "cannot be undone" would
          be false, and "deleted" would be a second falsehood on top of it.
        */
        body="This will hide it from your list. It cannot be undone from here."
        confirmLabel="Clear it"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          clearForm.current?.requestSubmit();
        }}
      />
    </li>
  );
}

import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { LAYERS, type LayerId, type LayerState } from './layers';

/**
 * Where the reader is among the eight layers.
 *
 * Answered layers are links: going back to correct something is the normal
 * case, not an escape hatch, and an Imprint nobody can revise is one people
 * fill in carelessly the first time knowing they cannot fix it.
 *
 * Skipped is shown differently from unanswered, because they are different
 * facts about the business and the review screen has to be able to say so.
 */
export function Rail({
  current,
  states,
}: {
  current: LayerId | 'review';
  states: Readonly<Record<LayerId, LayerState>>;
}) {
  return (
    <nav aria-label="Imprint layers" className="mb-7">
      <ol className="flex flex-wrap gap-1.5">
        {LAYERS.map((layer) => {
          const state = states[layer.id];
          const isCurrent = layer.id === current;
          const reachable = state !== 'unanswered' || isCurrent;

          const content = (
            <span
              className={cn(
                'block rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium transition-colors',
                isCurrent
                  ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                  : state === 'answered'
                    ? 'border-[var(--positive)] text-[var(--positive)]'
                    : state === 'skipped'
                      ? 'border-[var(--border-strong)] text-[var(--text-tertiary)] line-through decoration-1'
                      : 'border-[var(--border)] text-[var(--text-tertiary)]',
              )}
            >
              {layer.label}
            </span>
          );

          return (
            <li key={layer.id}>
              {reachable && !isCurrent ? (
                <Link href={`/imprint/${layer.id}`} aria-current={undefined}>
                  {content}
                </Link>
              ) : (
                <span aria-current={isCurrent ? 'step' : undefined}>{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

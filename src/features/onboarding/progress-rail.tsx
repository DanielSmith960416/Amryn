import Link from 'next/link';
import { STEPS, stepStates, type StepId } from './steps';
import { cn } from '@/lib/utils/cn';

/**
 * Where you are in the seven, and how to go back.
 *
 * Every answered or skipped step is a link. Setup is done over several
 * sittings and half of it is delegated, so "go back and change what I said
 * about the branches" is a normal request, not an edge case — a rail that
 * only moves forward would send people to support for it.
 */
export function ProgressRail({
  current,
  completed,
  skipped,
}: {
  current: StepId;
  completed: readonly string[];
  skipped: readonly string[];
}) {
  const states = stepStates(current, completed, skipped);

  return (
    <nav aria-label="Setup progress" className="mb-8">
      <ol className="flex flex-wrap gap-x-1 gap-y-2">
        {STEPS.map((s, i) => {
          const state = states[s.id];
          const reachable = state !== 'todo';
          const label = (
            <>
              <span
                aria-hidden
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-semibold',
                  state === 'done' && 'bg-[var(--positive)] text-white',
                  state === 'skipped' && 'bg-[var(--card-inset)] text-[var(--text-tertiary)]',
                  state === 'current' && 'bg-[var(--brand)] text-[var(--on-brand)]',
                  state === 'todo' && 'bg-[var(--card-inset)] text-[var(--text-tertiary)]',
                )}
              >
                {state === 'done' ? '✓' : state === 'skipped' ? '–' : i + 1}
              </span>
              <span className="whitespace-nowrap">{s.label}</span>
            </>
          );

          const classes = cn(
            'flex items-center gap-1.5 rounded-full px-2 py-1 text-[0.75rem]',
            state === 'current'
              ? 'font-medium text-[var(--text-primary)]'
              : 'text-[var(--text-tertiary)]',
            reachable && state !== 'current' && 'hover:text-[var(--text-primary)]',
          );

          return (
            <li key={s.id}>
              {reachable && state !== 'current' ? (
                <Link href={`/onboarding/${s.id}`} className={classes}>
                  {label}
                </Link>
              ) : (
                <span
                  className={classes}
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

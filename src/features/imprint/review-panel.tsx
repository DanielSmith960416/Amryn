import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LAYERS } from './layers';
import { QualityCard } from './quality-card';
import { initialise } from './actions';
import type { ImprintRecord } from './record';

/**
 * The last screen: what has been said, what has not, and what happens next.
 *
 * Three states per layer and three different sentences. "Skipped" is not a
 * failure and is not written as one — a single-site business that passed over
 * Location has answered that question correctly — but the consequence is still
 * stated, because somebody reading their findings in a month deserves to know
 * why a section is thin.
 */
export function ReviewPanel({ imprint, problem }: { imprint: ImprintRecord; problem?: boolean }) {
  const done = Boolean(imprint.completedAt);

  return (
    <div className="space-y-6">
      {problem ? (
        <p
          className="rounded-[var(--radius-tile)] border border-[var(--negative)] bg-[var(--negative-soft)] px-4 py-3 text-[0.8125rem] text-[var(--negative)]"
          role="alert"
        >
          We could not finish that. Nothing was changed — try again, and if it happens twice tell
          us what you were doing.
        </p>
      ) : null}

      <QualityCard quality={imprint.quality} />

      <ul className="space-y-2.5">
        {LAYERS.map((layer) => {
          const record = imprint.layers[layer.id];
          const layerScore = imprint.quality.layers.find((l) => l.layer === layer.id)!;

          return (
            <li
              key={layer.id}
              className="rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--surface)] p-3.5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
                  {layer.title}
                </p>
                <Link
                  href={`/imprint/${layer.id}`}
                  className="text-[0.75rem] text-[var(--text-secondary)] underline underline-offset-2"
                >
                  {record.state === 'unanswered' ? 'Answer this' : 'Change'}
                </Link>
              </div>

              <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                {record.state === 'answered' ? (
                  layerScore.missing.length === 0 ? (
                    'Answered in full.'
                  ) : (
                    <>
                      Answered, with {layerScore.missing.length} field
                      {layerScore.missing.length === 1 ? '' : 's'} left blank. Those are recorded as
                      gaps rather than guessed at.
                    </>
                  )
                ) : record.state === 'skipped' ? (
                  layer.ifSkipped
                ) : (
                  'Not answered yet.'
                )}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
          {done ? 'Your Imprint is in place' : 'What happens when you finish'}
        </p>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          {done
            ? 'Everything above can still be changed. The model is rebuilt from your Imprint whenever you do.'
            : 'Your model is built from what you have said, and the Command Centre starts reading your business rather than an empty template. Nothing here is locked afterwards — an Imprint is meant to be revised.'}
        </p>

        {imprint.quality.provisional ? (
          <p className="mt-3 rounded-[var(--radius-tile)] border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-[0.75rem] leading-relaxed text-[var(--warning)]">
            At {imprint.quality.score} out of 100, findings will be marked provisional and
            expansion will not be assessed until this reaches {imprint.quality.provisionalBelow}.
            You can finish now and raise it later.
          </p>
        ) : null}

        <form action={initialise} className="mt-4">
          <Button type="submit" variant="primary">
            {done ? 'Rebuild the model' : 'Finish and build my model'}
          </Button>
        </form>
      </div>
    </div>
  );
}

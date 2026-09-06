import { LAYERS } from './layers';
import { describe, reasonsToImprove, type QualityScore } from './quality';

/**
 * The Quality Score, and the arithmetic behind it.
 *
 * Never the number alone. This figure decides what the platform is willing to
 * say about a business — below seventy, findings are marked provisional and
 * expansion is not assessed at all — and a gate like that has to show its
 * working or it reads as the product being arbitrary. So the score comes with
 * the band it falls in, and the three layers that would raise it fastest.
 */
export function QualityCard({ quality }: { quality: QualityScore }) {
  const advice = reasonsToImprove(quality);

  return (
    <div className="rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Imprint quality</p>
        <p className="numeric text-[1.5rem] leading-none font-semibold text-[var(--text-primary)]">
          {quality.score}
          <span className="text-[0.875rem] text-[var(--text-tertiary)]">/100</span>
        </p>
      </div>

      {/* The bar is the same number again, for the reader who takes in a
          length faster than a figure. */}
      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]"
        role="img"
        aria-label={`Imprint quality ${quality.score} out of 100`}
      >
        <div
          className="h-full rounded-full bg-[var(--brand)] transition-[width]"
          style={{ width: `${quality.score}%` }}
        />
      </div>

      <p className="mt-3 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        {describe(quality)}
      </p>

      {advice.length > 0 ? (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <p className="text-[0.75rem] text-[var(--text-tertiary)]">
            Answering these would raise it most:
          </p>
          <ul className="mt-1.5 space-y-1">
            {advice.map((entry) => {
              const definition = LAYERS.find((l) => l.id === entry.layer)!;
              const remaining = Math.round(entry.weight * (1 - entry.completeness));
              return (
                <li key={entry.layer} className="text-[0.8125rem] text-[var(--text-secondary)]">
                  <span className="font-medium text-[var(--text-primary)]">{definition.label}</span>
                  <span className="text-[var(--text-tertiary)]">
                    {' '}
                    — up to {remaining} point{remaining === 1 ? '' : 's'}
                    {entry.state === 'skipped' ? ', which you skipped' : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

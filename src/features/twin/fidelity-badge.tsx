import { Badge } from '@/components/ui/badge';
import type { FidelityReading } from './scenarios';

/**
 * How wrong the Twin has been, said in the place a percentile is read.
 *
 * The whole reason the fidelity gate exists is that a confidence interval
 * reads as *more* trustworthy than a single number, whether or not the model
 * behind it has ever been right. So the measurement is never one click away
 * from the figures it licenses — it sits beside them, including when the
 * honest reading is "we cannot tell yet".
 */
export function FidelityBadge({ fidelity }: { fidelity: FidelityReading | null }) {
  if (!fidelity) {
    return <Badge tone="warning">Accuracy never checked</Badge>;
  }

  if (fidelity.status === 'measured') {
    // 70 and 50 are the same bands the health score uses, and they are a
    // judgement rather than a finding — which is why the number is shown
    // beside the word rather than instead of it.
    const tone = fidelity.score! >= 70 ? 'positive' : fidelity.score! >= 50 ? 'warning' : 'negative';
    return <Badge tone={tone}>Accuracy {fidelity.score}/100</Badge>;
  }

  return <Badge tone="info">Accuracy not measurable yet</Badge>;
}

/**
 * The sentence under the badge.
 *
 * Separate from the badge because a tone and a number fit in a chip and the
 * reason does not, and the reason is the half that tells somebody what to do
 * about it.
 */
export function FidelityNote({ fidelity }: { fidelity: FidelityReading | null }) {
  if (!fidelity) {
    return (
      <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        Nothing has run yet, so nobody has asked how close the model gets. Until that question has
        been asked and answered, no simulated figure can be recorded at all — the first run will ask
        it.
      </p>
    );
  }

  if (fidelity.status === 'measured') {
    return (
      <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        Measured against{' '}
        <strong className="font-medium text-[var(--text-primary)]">
          {fidelity.monthsAvailable} month{fidelity.monthsAvailable === 1 ? '' : 's'}
        </strong>{' '}
        of your own history, holding the last three back and scoring what the model would have said
        about them
        {fidelity.errorPct === null ? '' : `. It was out by ${fidelity.errorPct.toFixed(1)}% on average`}
        . Read the range below as a range, not a forecast.
      </p>
    );
  }

  return (
    <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
      {fidelity.reason ??
        'There is not enough unbroken history to score the model against yet.'}{' '}
      {fidelity.monthsAvailable} complete month{fidelity.monthsAvailable === 1 ? '' : 's'} of{' '}
      {fidelity.monthsRequired} are available. Scenarios still run — what is missing is any
      claim about how close they get.
    </p>
  );
}

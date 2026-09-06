import Link from 'next/link';
import { requireWorkspace } from '@/lib/auth/session';
import { imprintFor } from './record';
import { LAYER_IDS, layer as findLayer } from './layers';

/**
 * The nudge back into the Imprint, shown on the Command Centre until it is
 * finished.
 *
 * Not a redirect. Somebody who chose "finish later" meant it, and bouncing
 * them back to the questions every time they open the product is how a nudge
 * becomes a reason to stop opening it. It says how much is left, links to
 * exactly where they stopped, and can be ignored indefinitely.
 *
 * Renders nothing once the Imprint is complete, and nothing for a colleague
 * who cannot do anything about it.
 */
export async function ImprintPrompt() {
  const workspace = await requireWorkspace();
  if (!workspace.permissions.has('manage_organisation')) return null;

  const imprint = await imprintFor(workspace.organisation.id);
  if (imprint.completedAt) return null;

  const answered = LAYER_IDS.filter((id) => imprint.layers[id].state !== 'unanswered').length;
  const left = LAYER_IDS.length - answered;
  const next = findLayer(imprint.resumeAt);

  return (
    <div className="mb-5 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand)]/8 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
          {answered === 0
            ? 'Describe your business and this fills with your own figures'
            : left === 0
              ? 'One thing left: review your Imprint and build the model'
              : `${left} of ${LAYER_IDS.length} layers left`}
        </p>
        <Link
          href={left === 0 ? '/imprint/review' : `/imprint/${imprint.resumeAt}`}
          className="text-[0.8125rem] font-medium text-[var(--brand)] underline underline-offset-2"
        >
          {answered === 0 ? 'Start' : 'Continue'}
        </Link>
      </div>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        {answered === 0
          ? 'Eight short layers. '
          : `Next: ${next.title.charAt(0).toLowerCase()}${next.title.slice(1)}. `}
        Answers are kept as you type, and anything you would rather not answer yet can be left —
        it is recorded as a gap rather than guessed at.
      </p>
    </div>
  );
}

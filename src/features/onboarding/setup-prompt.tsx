import Link from 'next/link';
import { requireWorkspace } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { STEP_IDS, resumeAt, step as findStep } from './steps';

/**
 * The nudge back into setup, shown on the Command Centre until it is finished.
 *
 * Not a redirect. Somebody who chose "finish later" meant it, and bouncing
 * them back to the questions every time they open the product is how a nudge
 * becomes a reason to stop opening it. It says how much is left, links to
 * exactly where they stopped, and can be ignored indefinitely.
 *
 * Renders nothing once setup is complete, and nothing for a colleague who
 * cannot do anything about it.
 */
export async function SetupPrompt() {
  const workspace = await requireWorkspace();
  if (!workspace.permissions.has('manage_organisation')) return null;

  const supabase = await createClient();
  const { data: progress } = await supabase
    .from('onboarding_progress')
    .select('completed_steps, skipped_steps, completed_at')
    .eq('organisation_id', workspace.organisation.id)
    .maybeSingle();

  if (progress?.completed_at) return null;

  const completed = progress?.completed_steps ?? [];
  const skipped = progress?.skipped_steps ?? [];
  const resume = resumeAt(completed, skipped);
  // Review is not a question, so it does not count towards what is left.
  const questions = STEP_IDS.length - 1;
  const answered = completed.filter((s) => s !== 'review').length + skipped.length;
  const left = Math.max(0, questions - answered);

  return (
    <div className="mb-5 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand)]/8 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
          {answered === 0
            ? 'Tell us about your business and this fills with your own figures'
            : left === 0
              ? 'One step left: review what you have told us and initialise'
              : `${left} of ${questions} questions left`}
        </p>
        <Link
          href={`/onboarding/${resume}`}
          className="text-[0.8125rem] font-medium text-[var(--brand)] underline underline-offset-2"
        >
          {answered === 0 ? 'Start' : 'Continue'}
        </Link>
      </div>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        Next: {findStep(resume).title.charAt(0).toLowerCase() + findStep(resume).title.slice(1)}.
        You can leave and come back — nothing is lost between sittings.
      </p>
    </div>
  );
}

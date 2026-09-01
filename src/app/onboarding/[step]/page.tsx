import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { requireWorkspace } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { LegalFooter } from '@/components/legal/legal-footer';
import { ProgressRail } from '@/features/onboarding/progress-rail';
import { ReviewPanel } from '@/features/onboarding/review-panel';
import {
  DataForm,
  IdentityForm,
  MarketForm,
  ObjectivesForm,
  StructureForm,
  SystemsForm,
} from '@/features/onboarding/forms';
import { skipStep } from '@/features/onboarding/actions';
import { isStepId, previousStep, step as findStep } from '@/features/onboarding/steps';

export const metadata: Metadata = { title: 'Set up' };

// Reads one organisation's progress; nothing here is the same for two people.
export const dynamic = 'force-dynamic';

/**
 * One step of setup.
 *
 * Outside the platform layout on purpose. The layout carries the whole
 * navigation, and offering twenty destinations to somebody halfway through
 * being asked seven questions is how the seven never get answered. The way out
 * is a single link, and it is always available — this is not a cage.
 */
export default async function OnboardingStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step: raw } = await params;
  if (!isStepId(raw)) notFound();

  const workspace = await requireWorkspace();
  const supabase = await createClient();

  // Definer and idempotent, so the first visit creates the record and a
  // refresh costs nothing.
  const { data: progress } = await supabase.rpc('ensure_onboarding', {
    p_organisation: workspace.organisation.id,
  });

  const completed = progress?.completed_steps ?? [];
  const skipped = progress?.skipped_steps ?? [];
  const definition = findStep(raw);
  const back = previousStep(raw);

  return (
    <div className="min-h-dvh px-5 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Image
              src="/brand/amryn-icon-mark.png"
              alt=""
              width={553}
              height={563}
              className="h-7 w-auto dark:hidden"
              priority
            />
            <Image
              src="/brand/amryn-icon-mark-white.png"
              alt=""
              width={553}
              height={563}
              className="hidden h-7 w-auto dark:block"
              priority
            />
            <span className="font-display text-[1.125rem] font-extrabold tracking-tight text-[var(--text-primary)]">
              Amryn<span className="tm">™</span>
            </span>
          </div>

          {/* Always reachable. Setup that traps you is setup people resent. */}
          <Link
            href="/command-centre"
            className="text-[0.8125rem] text-[var(--text-tertiary)] underline underline-offset-2 hover:text-[var(--text-secondary)]"
          >
            Finish later
          </Link>
        </div>

        <ProgressRail current={raw} completed={completed} skipped={skipped} />

        <h1 className="text-[1.5rem] font-semibold leading-tight text-[var(--text-primary)]">
          {definition.title}
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
          {definition.purpose}
        </p>

        <div className="mt-7">
          {raw === 'identity' ? (
            <IdentityForm
              industry={workspace.organisation.industry ?? ''}
              fiscalYearStart={workspace.organisation.fiscal_year_start}
              timezone={workspace.organisation.timezone}
            />
          ) : null}
          {raw === 'structure' ? <StructureForm /> : null}
          {raw === 'objectives' ? <ObjectivesForm defaultDue={endOfYear()} /> : null}
          {raw === 'systems' ? <SystemsForm /> : null}
          {raw === 'data' ? <DataForm /> : null}
          {raw === 'market' ? <MarketForm sectors={workspace.organisation.sector_scope} /> : null}
          {raw === 'review' ? (
            <ReviewPanel
              organisationId={workspace.organisation.id}
              completed={completed}
              skipped={skipped}
              alreadyDone={Boolean(progress?.completed_at)}
            />
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-4">
          {back ? (
            <Link
              href={`/onboarding/${back}`}
              className="text-[0.8125rem] text-[var(--text-secondary)] underline underline-offset-2"
            >
              Back
            </Link>
          ) : (
            <span />
          )}

          {definition.skippable ? (
            <form action={skipStep}>
              <input type="hidden" name="step" value={raw} />
              <button
                type="submit"
                className="text-[0.8125rem] text-[var(--text-tertiary)] underline underline-offset-2 hover:text-[var(--text-secondary)]"
              >
                Skip this — {shortReason(definition.ifSkipped)}
              </button>
            </form>
          ) : null}
        </div>

        <LegalFooter className="mt-10" />
      </div>
    </div>
  );
}

/** The last day of the current calendar year, as a sensible default target. */
function endOfYear(): string {
  return `${new Date().getFullYear()}-12-31`;
}

/** The first clause of the consequence, so the link says what skipping costs. */
function shortReason(consequence: string): string {
  const first = consequence.split(/[.:]/)[0] ?? '';
  return first.charAt(0).toLowerCase() + first.slice(1);
}

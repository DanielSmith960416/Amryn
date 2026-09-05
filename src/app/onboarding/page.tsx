import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { OnboardingForm } from '@/features/organisation/onboarding-form';
import { LegalFooter } from '@/components/legal/legal-footer';
import { getWorkspace, requireVerifiedUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { resumeAt } from '@/features/onboarding/steps';
import { isSupabaseConfigured } from '@/lib/env';
import { withBasePath } from '@/lib/base-path';

export const metadata: Metadata = { title: 'Set up your organisation' };

/**
 * Where a signed-in user with no organisation lands.
 *
 * Sits outside the platform layout, because that layout requires a workspace
 * and this is the page that creates one.
 */
// Reads the session to decide whether the caller already has a workspace.
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) redirect('/sign-in');

  // requireVerifiedUser, for the same reason requireWorkspace checks first: at
  // aal1 the database shows this person no organisations, and this page would
  // invite a long-standing member to create a new one.
  await requireVerifiedUser();
  const workspace = await getWorkspace();

  // The organisation already exists, so this page has nothing left to do —
  // but the seven questions after it may not have been answered. Sending
  // somebody who is halfway through to the Command Centre instead of back to
  // where they stopped is how a half-set-up account stays half set up.
  if (workspace) {
    const supabase = await createClient();
    const { data: progress } = await supabase
      .from('onboarding_progress')
      .select('completed_steps, skipped_steps, completed_at')
      .eq('organisation_id', workspace.organisation.id)
      .maybeSingle();

    if (progress?.completed_at) redirect('/command-centre');
    redirect(
      `/onboarding/${resumeAt(progress?.completed_steps ?? [], progress?.skipped_steps ?? [])}`,
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2.5">
          <Image
            src={withBasePath("/brand/amryn-icon-mark.png")}
            alt=""
            width={553}
            height={563}
            className="h-7 w-auto"
            priority
          />
          <span className="font-display text-[1.125rem] font-extrabold tracking-tight text-[var(--text-primary)]">
            Amryn<span className="tm">™</span>
          </span>
        </div>

        <h1 className="text-[1.5rem] font-semibold text-[var(--text-primary)]">
          Set up your organisation
        </h1>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
          This creates your workspace and makes you its administrator. Seven short questions
          follow, and you can leave and come back to them at any point — nothing is lost between
          sittings.
        </p>

        <div className="mt-7">
          <OnboardingForm />
        </div>

        <LegalFooter className="mt-10" />
      </div>
    </div>
  );
}

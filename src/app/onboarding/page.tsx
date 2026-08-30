import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { OnboardingForm } from '@/features/organisation/onboarding-form';
import { getWorkspace, requireUser } from '@/lib/auth/session';

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
  await requireUser();
  const workspace = await getWorkspace();
  if (workspace) redirect('/command-centre');

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2.5">
          <Image
            src="/brand/amryn-icon-mark.png"
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
          This creates your workspace and makes you its administrator. You can invite colleagues and
          connect data sources once it exists.
        </p>

        <div className="mt-7">
          <OnboardingForm />
        </div>
      </div>
    </div>
  );
}

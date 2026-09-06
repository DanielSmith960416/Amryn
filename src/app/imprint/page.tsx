import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { CreateOrganisationForm } from '@/features/organisation/create-organisation-form';
import { LegalFooter } from '@/components/legal/legal-footer';
import { getWorkspace, requireVerifiedUser } from '@/lib/auth/session';
import { imprintFor } from '@/features/imprint/record';
import { isSupabaseConfigured } from '@/lib/env';
import { withBasePath } from '@/lib/base-path';

export const metadata: Metadata = { title: 'Start your Imprint' };

/**
 * Where a signed-in user with no organisation lands.
 *
 * Sits outside the platform layout, because that layout requires a workspace
 * and this is the page that creates one.
 */
// Reads the session to decide whether the caller already has a workspace.
export const dynamic = 'force-dynamic';

export default async function ImprintPage() {
  if (!isSupabaseConfigured()) redirect('/sign-in');

  // requireVerifiedUser, for the same reason requireWorkspace checks first: at
  // aal1 the database shows this person no organisations, and this page would
  // invite a long-standing member to create a new one.
  await requireVerifiedUser();
  const workspace = await getWorkspace();

  // The organisation already exists, so this page has nothing left to do — but
  // the Imprint may not be finished. Sending somebody who is halfway through to
  // the Command Centre instead of back to where they stopped is how a
  // half-described business stays half described.
  if (workspace) {
    const imprint = await imprintFor(workspace.organisation.id);
    if (imprint.completedAt) redirect('/command-centre');
    redirect(`/imprint/${imprint.resumeAt}`);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2.5">
          <Image
            src={withBasePath('/brand/amryn-icon-mark.png')}
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
          This creates your workspace and makes you its administrator. Then we build your Amryn
          <span className="tm">™</span> Imprint<span className="tm">®</span> — eight short layers
          describing the business. You can leave and come back at any point; answers are kept as
          you type, and anything you would rather not answer yet can be left.
        </p>

        <div className="mt-7">
          <CreateOrganisationForm />
        </div>

        <LegalFooter className="mt-10" />
      </div>
    </div>
  );
}

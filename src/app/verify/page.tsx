import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { mfaState } from '@/lib/auth/mfa';
import { safeNextPath } from '@/features/auth/next-path';
import { VerifyForm } from '@/features/mfa/verify-form';

export const metadata: Metadata = {
  title: 'Two-step sign-in',
  robots: { index: false, follow: false },
};

// Reads the session to decide whether a challenge is outstanding.
export const dynamic = 'force-dynamic';

/**
 * The second step.
 *
 * Deliberately not inside the application shell: the shell reads the
 * workspace, and the database shows this session none of it until the
 * challenge is answered. A page that renders a navigation full of empty
 * sections while asking for a code would look broken at exactly the moment it
 * matters most.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await requireUser();

  const state = await mfaState();
  const params = await searchParams;
  const next = safeNextPath(params.next);

  // Nothing outstanding. Somebody has bookmarked this, or come back after
  // completing it in another tab.
  if (!state.required) redirect(next);

  return <VerifyForm next={next} />;
}

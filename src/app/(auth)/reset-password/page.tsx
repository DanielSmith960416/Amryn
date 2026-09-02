import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { ResetPasswordForm } from '@/features/auth/reset-password-form';

export const metadata: Metadata = { title: 'Set a new password', robots: { index: false } };

// Depends on the session the reset link established.
export const dynamic = 'force-dynamic';

/**
 * Setting the new password.
 *
 * Reached from the emailed link, which passes through /auth/callback — that
 * exchanges the code for a session and forwards here. Without that session
 * there is nothing to change, so the page says so rather than presenting a
 * form that cannot work.
 */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <>
        <h2 className="text-[1.5rem] font-semibold text-[var(--text-primary)]">
          This link has expired
        </h2>
        <p className="mt-1.5 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
          Reset links can be used once, and not indefinitely. Asking for another takes a moment.
        </p>
        <p className="mt-6">
          <Link
            href="/forgot-password"
            className="inline-flex h-10 items-center rounded-[var(--radius-field)] bg-[var(--brand)] px-4 text-[0.875rem] font-medium text-white"
          >
            Send a new link
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h2 className="text-[1.5rem] font-semibold text-[var(--text-primary)]">Set a new password</h2>
      <p className="mt-1.5 text-[0.875rem] text-[var(--text-secondary)]">
        For {user.email}. You will be signed in once it is saved.
      </p>

      <div className="mt-7">
        <ResetPasswordForm />
      </div>
    </>
  );
}

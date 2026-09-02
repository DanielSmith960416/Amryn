import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/features/auth/forgot-password-form';

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false } };

/**
 * Asking for a reset link.
 *
 * This route was in the middleware's public list before the page existed, so
 * anyone who forgot their password reached a 404 with no way back into their
 * account — and nothing on the sign-in page even offered it.
 */
export default function ForgotPasswordPage() {
  return (
    <>
      <h2 className="text-[1.5rem] font-semibold text-[var(--text-primary)]">
        Reset your password
      </h2>
      <p className="mt-1.5 text-[0.875rem] text-[var(--text-secondary)]">
        We will email you a link to set a new one.
      </p>

      <div className="mt-7">
        <ForgotPasswordForm />
      </div>

      <p className="mt-7 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        Remembered it?{' '}
        <Link href="/sign-in" className="font-medium text-[var(--brand)] hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

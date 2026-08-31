import type { Metadata } from 'next';
import Link from 'next/link';
import { ReturnForm } from '@/features/auth/forms';
import { DoorNotLock } from '@/components/shell/door-not-lock';

export const metadata: Metadata = { title: 'Continue' };

export default function SignInPage() {
  return (
    <div>
      <h1 className="font-display text-[1.625rem] font-semibold tracking-tight text-[var(--text-primary)]">
        Continue
      </h1>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
        Pick up where this device left off, in your Executive Command Centre.
      </p>

      <DoorNotLock className="mt-5" />

      <div className="mt-6">
        <ReturnForm />
      </div>

      <p className="mt-6 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        No workspace on this device yet?{' '}
        <Link href="/sign-up" className="font-medium text-[var(--brand)] hover:underline">
          Open the platform
        </Link>
      </p>
    </div>
  );
}

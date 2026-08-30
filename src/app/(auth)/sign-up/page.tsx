import type { Metadata } from 'next';
import Link from 'next/link';
import { SignUpForm } from '@/features/auth/sign-up-form';

export const metadata: Metadata = { title: 'Create an account' };

export default function SignUpPage() {
  return (
    <>
      <h2 className="text-[1.5rem] font-semibold text-[var(--text-primary)]">Create your account</h2>
      <p className="mt-1.5 text-[0.875rem] text-[var(--text-secondary)]">
        You will set up your organisation next.
      </p>

      <div className="mt-7">
        <SignUpForm />
      </div>

      <p className="mt-7 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-medium text-[var(--brand)] hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

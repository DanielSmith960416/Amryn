import type { Metadata } from 'next';
import Link from 'next/link';
import { OpenPlatformForm } from '@/features/auth/forms';
import { DoorNotLock } from '@/components/shell/door-not-lock';

export const metadata: Metadata = { title: 'Open the platform' };

export default function SignUpPage() {
  return (
    <div>
      <h1 className="font-display text-[1.625rem] font-semibold tracking-tight text-[var(--text-primary)]">
        Open the platform
      </h1>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
        Name your workspace and go straight to the Executive Command Centre. It opens on a
        demonstration business, so there is something to look at from the first screen.
      </p>

      <DoorNotLock className="mt-5" />

      <div className="mt-6">
        {/*
          `next` is deliberately not read from the query string here. A static
          export renders one HTML file for this route, so a search param cannot
          reach the server — and the form's own default destination is the
          Command Centre, which is where anyone opening a workspace wants to go.
        */}
        <OpenPlatformForm />
      </div>

      <p className="mt-6 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        Already opened one on this device?{' '}
        <Link href="/sign-in" className="font-medium text-[var(--brand)] hover:underline">
          Continue
        </Link>
      </p>
    </div>
  );
}

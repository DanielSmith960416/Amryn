'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from './app-shell';
import { readProfile, type Profile } from '@/lib/profile';

/**
 * The client area's entry check.
 *
 * A static export has no server, so this runs in the browser after the page has
 * already been delivered. It is a **door, not a lock**: it decides what the
 * reader is shown, not what they are able to fetch. Anyone who requests one of
 * these URLs directly receives the HTML regardless. `src/lib/profile.ts` sets
 * out why that is acceptable for a demonstration workspace and where it stops
 * being acceptable.
 *
 * The three states are kept distinct on purpose. "Checking" renders neither the
 * platform nor a redirect, because flashing a dashboard at someone before
 * bouncing them out is worse than a moment of nothing — and on a static host
 * that moment is a single frame.
 */
export function PlatformGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const found = readProfile();
    setProfile(found);
    setChecked(true);
    if (!found) router.replace('/sign-up');
  }, [router]);

  if (!checked) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <p className="animate-soft-pulse text-[0.875rem] text-[var(--text-secondary)]">
          Opening your workspace…
        </p>
      </div>
    );
  }

  if (!profile) {
    // The redirect is already in flight. Saying where they are going reads
    // better than an empty screen if it takes a beat.
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-[0.875rem] text-[var(--text-secondary)]">
          Taking you to open a workspace…
        </p>
      </div>
    );
  }

  return (
    <AppShell
      userName={profile.fullName}
      userEmail={profile.email}
      companyName={profile.companyName}
      isDemo
    >
      {children}
    </AppShell>
  );
}

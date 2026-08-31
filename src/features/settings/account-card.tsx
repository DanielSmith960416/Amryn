'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { readProfile, storageAvailable, type Profile } from '@/lib/profile';

/**
 * Who this device thinks it is.
 *
 * A client component because the answer lives in `localStorage`, which only
 * exists in the browser. It reports plainly that the workspace is remembered
 * on this device and nowhere else, rather than implying an account somewhere.
 */
export function AccountCard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [canStore, setCanStore] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setProfile(readProfile());
    setCanStore(storageAvailable());
    setChecked(true);
  }, []);

  return (
    <Card>
      <CardHeader title="Your workspace" subtitle="Remembered on this device" />
      <CardBody>
        <dl className="space-y-3">
          {[
            ['Name', profile?.fullName],
            ['Business', profile?.companyName],
            ['Email', profile?.email || '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="eyebrow">{k}</dt>
              <dd className="mt-0.5 text-[0.875rem] text-[var(--text-primary)]">
                {checked ? (v ?? '—') : '…'}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <p className="eyebrow mb-1.5">Where this is stored</p>
          <Badge tone={canStore ? 'info' : 'warning'}>
            {canStore ? 'This device only' : 'Not stored'}
          </Badge>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
            {canStore
              ? 'Your name and business are held in this browser. They are never sent anywhere, ' +
                'and another device or another browser will not know them. Clearing site data ' +
                'forgets them.'
              : 'This browser will not let the site store anything, so nothing is remembered ' +
                'between visits. Private browsing and blocked site data both do this.'}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

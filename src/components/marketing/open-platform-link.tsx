'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { readProfile } from '@/lib/profile';

/**
 * The public site's way into the platform.
 *
 * A static page cannot know whether this visitor already has a workspace, so
 * the destination is decided in the browser after the page has loaded. Until
 * it is, the link points at the workspace-opening page — the right destination
 * for the visitor who has never been here, which is most of them, and a
 * harmless extra step for the one who has.
 *
 * The label does not change once the check completes, only the destination.
 * Text that rewrites itself a moment after the page settles is the kind of
 * flicker that makes a site feel unfinished.
 */
export function OpenPlatformLink({ size = 'lg' }: { size?: 'sm' | 'md' | 'lg' }) {
  const [href, setHref] = useState('/sign-up');

  useEffect(() => {
    if (readProfile()) setHref('/command-centre');
  }, []);

  return (
    <Button asChild variant="primary" size={size}>
      <Link href={href}>Open the platform</Link>
    </Button>
  );
}

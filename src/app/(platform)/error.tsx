'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/states';

/**
 * Route-level error boundary.
 *
 * The message is deliberately not the raw error: a database or provider error
 * can carry internal detail, and a dashboard is not the place to leak it. The
 * digest is shown so a support conversation has something to match on.
 */
export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[amryn] route error', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-12">
      <Card>
        <ErrorState
          title="That did not load"
          description="Something went wrong fetching this page. Your data is unaffected — this is a display failure, not a data one."
          action={
            <div className="flex flex-col items-center gap-3">
              <Button onClick={reset} variant="primary">
                Try again
              </Button>
              {error.digest ? (
                <code className="font-mono text-[0.6875rem] text-[var(--text-tertiary)]">
                  Reference: {error.digest}
                </code>
              ) : null}
            </div>
          }
        />
      </Card>
    </div>
  );
}

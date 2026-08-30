'use client';

/**
 * Last-resort error boundary.
 *
 * Only reached when a route has no closer boundary of its own — the root page
 * and the sign-in group, in practice. Replaces Next's unbranded default with
 * something that names the digest, because "see the server logs" is not
 * actionable unless the reader knows which line to look for.
 *
 * It replaces the whole document, so it carries its own <html> and <body> and
 * inlines its styling: the stylesheet may be exactly what failed to load.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#081B33',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          padding: '1.5rem',
        }}
      >
        <main style={{ maxWidth: '30rem', textAlign: 'center' }}>
          <p
            style={{
              fontSize: '0.6875rem',
              letterSpacing: '0.16em',
              textTransform: 'none',
              color: '#3E7BD6',
              margin: 0,
            }}
          >
            Amryn
          </p>

          <h1 style={{ fontSize: '1.5rem', margin: '0.75rem 0 0', fontWeight: 600 }}>
            Something failed on the server
          </h1>

          <p style={{ color: '#8BA3C7', lineHeight: 1.6, margin: '0.75rem 0 0' }}>
            This is a fault in the application, not in your data. Nothing has been changed or lost.
          </p>

          {error.digest ? (
            <p
              style={{
                margin: '1.25rem 0 0',
                padding: '0.625rem 0.75rem',
                borderRadius: 8,
                background: '#0F243F',
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.75rem',
                color: '#8BA3C7',
              }}
            >
              Digest {error.digest}
              <br />
              Search your host&rsquo;s runtime logs for this to find the cause.
            </p>
          ) : null}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              padding: '0.625rem 1.25rem',
              borderRadius: 8,
              border: 0,
              background: '#3E7BD6',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { runDiagnostics, type CheckStatus } from '@/features/diagnostics/checks';
import { internalAccess } from '@/lib/auth/internal-access';
import { withBasePath } from '@/lib/base-path';

export const metadata: Metadata = {
  title: 'Diagnostics',
  // noindex, nofollow and nosnippet: an operator page in a search result is a
  // map of the system for anyone who was not looking for it.
  robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true },
};

// Always a live reading. A cached diagnosis is a wrong diagnosis.
export const dynamic = 'force-dynamic';

/**
 * What is wrong, in plain words.
 *
 * Deliberately reachable without signing in: most of what it can tell you is
 * about why signing in does not work. It reports whether variables are set,
 * never their values, so it is safe to leave in place and safe to screenshot.
 */
export default async function DiagnosticsPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  // Closed to customers. This page names settings, table counts and connection
  // states — legitimate for whoever runs the deployment, and not something a
  // customer should ever meet.
  const { key } = await searchParams;
  if ((await internalAccess(key)) === 'denied') notFound();

  // Access was established above, so the check that needs a direct database
  // connection is allowed here — this page has one reader and is not polled.
  const report = await runDiagnostics({ directConnection: true });
  const healthy = report.summary.fail === 0;

  return (
    <div className="min-h-dvh bg-[var(--bg)] px-5 py-10">
      <main className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-2.5">
          <Image
            src={withBasePath("/brand/amryn-icon-mark.png")}
            alt=""
            width={553}
            height={563}
            className="h-6 w-auto"
          />
          <span className="font-display text-[1.0625rem] font-extrabold tracking-tight text-[var(--text-primary)]">
            Amryn<span className="tm">™</span>
          </span>
        </div>

        <h1 className="text-[1.75rem] font-semibold text-[var(--text-primary)]">Diagnostics</h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
          {healthy
            ? 'Everything the platform needs is in place. Anything marked below as worth noting is optional or expected.'
            : 'Something is not set up correctly. Each item below says what, and what to do about it.'}
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Tally label="Working" count={report.summary.ok} tone="ok" />
          <Tally label="Worth noting" count={report.summary.warn} tone="warn" />
          <Tally label="Broken" count={report.summary.fail} tone="fail" />
        </div>

        <ul className="mt-7 space-y-2.5">
          {report.checks.map((check) => (
            <li
              key={check.name}
              className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div className="flex items-start gap-3">
                <StatusDot status={check.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem] font-medium text-[var(--text-primary)]">
                    {check.name}
                  </p>
                  <p className="mt-1 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
                    {check.detail}
                  </p>
                  {check.remedy ? (
                    <p className="mt-2 rounded-lg bg-[var(--card-inset)] px-3 py-2 text-[0.8125rem] leading-relaxed text-[var(--text-primary)]">
                      <span className="eyebrow !mb-0 mr-1.5 !inline">What to do</span>
                      {check.remedy}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-[var(--border)] pt-5">
          <Link
            href="/sign-in"
            className="rounded-lg bg-[var(--brand)] px-4 py-2 text-[0.875rem] font-medium text-[var(--on-brand)]"
          >
            Go to sign in
          </Link>
          <Link href="/diagnostics" className="text-[0.875rem] text-[var(--brand)] hover:underline">
            Run again
          </Link>
          <span className="numeric ml-auto text-right text-[0.6875rem] text-[var(--text-tertiary)]">
            {report.build.commit ? (
              <>
                build {report.build.commit}
                {report.build.ref ? ` · ${report.build.ref}` : ''}
                <br />
              </>
            ) : null}
            {report.generatedAt}
          </span>
        </div>

        <p className="mt-5 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
          This page reports whether settings are present, never what they are. No key or password
          appears on it, so it is safe to screenshot and share when asking for help.
          {report.build.commit ? (
            <>
              {' '}
              The build reference above says which commit answered — if it has not changed after a
              deploy, the deploy did not pick up the change.
            </>
          ) : null}
        </p>
      </main>
    </div>
  );
}

const TONE: Record<'ok' | 'warn' | 'fail', string> = {
  ok: 'bg-[var(--positive-soft)] text-[var(--positive)]',
  warn: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  fail: 'bg-[var(--negative-soft)] text-[var(--negative)]',
};

function Tally({ label, count, tone }: { label: string; count: number; tone: 'ok' | 'warn' | 'fail' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1 text-[0.8125rem] font-medium ${TONE[tone]}`}
    >
      <span className="numeric">{count}</span>
      {label}
    </span>
  );
}

function StatusDot({ status }: { status: CheckStatus }) {
  const look: Record<CheckStatus, { className: string; label: string }> = {
    ok: { className: 'bg-[var(--positive)]', label: 'Working' },
    warn: { className: 'bg-[var(--warning)]', label: 'Worth noting' },
    fail: { className: 'bg-[var(--negative)]', label: 'Broken' },
    skipped: { className: 'bg-[var(--text-tertiary)]', label: 'Not checked' },
  };
  const { className, label } = look[status];
  return (
    <span
      className={`mt-1.5 size-2.5 shrink-0 rounded-full ${className}`}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}

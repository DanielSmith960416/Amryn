import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { internalAccess } from '@/lib/auth/internal-access';
import { databaseUrl, looksLikePooler, readSchemaStatus, EXPECTED } from '@/lib/db/setup';
import { SetupForm } from '@/features/setup/setup-form';

export const metadata: Metadata = {
  title: 'Set up the database',
  robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true },
};

// Reads the live state of the database on every visit.
export const dynamic = 'force-dynamic';

/**
 * The platform building its own database.
 *
 * The schema was the one thing that could not be typed into a hosting
 * dashboard: it had to be pasted into a SQL editor, in order, by someone who
 * could not tell a completed run from a half-finished one. Given a connection
 * string, the application does it itself.
 *
 * Behind sign-in, and inert once the schema exists.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  // Signing in was never a strong enough gate on a page that runs schema
  // changes: any customer who signed up could reach it.
  const { key } = await searchParams;
  if ((await internalAccess(key)) === 'denied') notFound();

  const url = databaseUrl();
  const status = url ? await readSchemaStatus() : null;

  return (
    <div className="min-h-dvh bg-[var(--bg)] px-5 py-10">
      <main className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-2.5">
          <Image
            src="/brand/amryn-icon-mark.png"
            alt=""
            width={553}
            height={563}
            className="h-6 w-auto dark:hidden"
          />
          <Image
            src="/brand/amryn-icon-mark-white.png"
            alt=""
            width={553}
            height={563}
            className="hidden h-6 w-auto dark:block"
          />
          <span className="font-display text-[1.0625rem] font-extrabold tracking-tight text-[var(--text-primary)]">
            Amryn<span className="tm">™</span>
          </span>
        </div>

        <h1 className="text-[1.75rem] font-semibold text-[var(--text-primary)]">
          Set up the database
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
          {status?.state === 'ready'
            ? 'Everything is in place. There is nothing to do here.'
            : 'This builds the tables, the security policies and the permission catalogue. It runs once.'}
        </p>

        <div className="mt-8 space-y-5">
          {!url ? <MissingUrl /> : null}

          {url && !looksLikePooler(url) ? (
            <Card tone="warn" title="That looks like the direct connection string">
              <p>
                Supabase quotes two. The direct one reaches the database over IPv6 only, which most
                hosting platforms cannot route, and the attempt ends in a timeout that explains
                nothing. Use the <strong>Session pooler</strong> string — its host contains{' '}
                <code className="font-mono text-[0.85em]">pooler.supabase.com</code>.
              </p>
            </Card>
          ) : null}

          {status?.problem ? (
            <Card tone="fail" title="Could not reach the database">
              <p>{status.problem}</p>
              <p className="mt-2">
                Check the connection string is the pooler one, and that the password in it is
                right. Nothing here has changed anything.
              </p>
            </Card>
          ) : null}

          {status && !status.problem ? (
            <Card
              tone={status.state === 'ready' ? 'ok' : status.state === 'partial' ? 'warn' : 'plain'}
              title={
                status.state === 'ready'
                  ? 'Built'
                  : status.state === 'partial'
                    ? 'Half built'
                    : 'Empty, and ready to build'
              }
            >
              <dl className="grid grid-cols-3 gap-3">
                <Stat label="Tables" value={status.tables} of={EXPECTED.tables} />
                <Stat label="Permissions" value={status.permissions} of={EXPECTED.permissions} />
                <Stat label="Role grants" value={status.roleGrants} of={EXPECTED.minRoleGrants} />
              </dl>
              {status.state === 'partial' ? (
                <p className="mt-3">
                  An earlier attempt stopped part of the way through. Applying the schema over the
                  top would fail on the first table that already exists, so this will not try.
                  Clearing the public schema in Supabase and returning here is the way out —
                  destructive, and safe only because there is no real data yet.
                </p>
              ) : null}
            </Card>
          ) : null}

          <SetupForm canRun={Boolean(url) && status?.state === 'absent'} />

          <p className="text-[0.8125rem] text-[var(--text-tertiary)]">
            The statements come from this deployment, not from anything typed into this page. It
            runs only while the database is empty, and does nothing once it is built. The
            diagnostics page reports the whole picture, and is reached the same way as this
            one.
          </p>
        </div>
      </main>
    </div>
  );
}

function MissingUrl() {
  return (
    <Card tone="warn" title="One setting is needed first">
      <p>
        Building a schema needs a direct database connection, which is a different thing from the
        anon key the rest of the platform uses.
      </p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5">
        <li>
          In Supabase, open <strong>Project Settings → Database → Connection string</strong> and
          choose <strong>Session pooler</strong>.
        </li>
        <li>Copy it, and replace the password placeholder with your database password.</li>
        <li>
          In Vercel, add it as{' '}
          <code className="font-mono text-[0.85em]">SUPABASE_DB_URL</code>, then redeploy.
        </li>
      </ol>
      <p className="mt-3">
        No <code className="font-mono text-[0.85em]">NEXT_PUBLIC_</code> prefix. That prefix puts a
        value into every visitor&rsquo;s browser, and this one contains your database password.
      </p>
    </Card>
  );
}

function Stat({ label, value, of }: { label: string; value: number; of: number }) {
  const good = value >= of;
  return (
    <div>
      <dt className="text-[0.75rem] uppercase tracking-wide text-[var(--text-tertiary)]">
        {label}
      </dt>
      <dd
        className="mt-0.5 font-mono text-[1.125rem] tabular-nums"
        style={{ color: good ? 'var(--positive)' : 'var(--text-primary)' }}
      >
        {value}
        <span className="text-[0.8125rem] text-[var(--text-tertiary)]"> / {of}</span>
      </dd>
    </div>
  );
}

function Card({
  tone,
  title,
  children,
}: {
  tone: 'ok' | 'warn' | 'fail' | 'plain';
  title: string;
  children: React.ReactNode;
}) {
  const border = {
    ok: 'var(--positive)',
    warn: 'var(--warning)',
    fail: 'var(--negative)',
    plain: 'var(--border)',
  }[tone];

  return (
    <section
      className="rounded-[var(--radius-card)] border bg-[var(--card)] p-5"
      style={{ borderColor: border }}
    >
      <h2 className="text-[0.9375rem] font-medium text-[var(--text-primary)]">{title}</h2>
      <div className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
        {children}
      </div>
    </section>
  );
}

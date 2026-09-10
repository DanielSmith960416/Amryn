import { NextResponse } from 'next/server';
import { runDiagnostics } from '@/features/diagnostics/checks';
import { internalAccess } from '@/lib/auth/internal-access';

/**
 * Machine-readable health.
 *
 * /diagnostics answers "what is wrong and what do I do about it" for a person.
 * This answers "is it up" for something that polls — an uptime monitor, a
 * deploy gate, a status page — and neither can do the other's job.
 *
 * ── two audiences, two answers ────────────────────────────────────────────
 * A monitor needs to reach this without credentials: one that has to sign in
 * is reporting on the sign-in, not on the service. But the list of checks is a
 * description of the system's insides, and a monitoring URL ends up in logs,
 * dashboards and third-party services read by people who never chose to see
 * it.
 *
 * So the status code and one word are public, and everything else is not:
 *
 *   · Anyone: `{ status }` and the HTTP code. Enough to alert on, and it
 *     names nothing.
 *   · An administrator, or a caller holding INTERNAL_ACCESS_TOKEN: the
 *     individual checks and the build, for working out which thing broke.
 *
 * 200 while nothing is failing, 503 when something is, because that is the
 * part most monitors look at.
 *
 * ── what an anonymous caller is now told about the worker ─────────────────
 *
 * That it is running, or that it is not. This is the change that makes the
 * endpoint honest: the worker check existed before and was gated behind the
 * direct connection, so the only callers who could see it were the ones
 * already looking at /diagnostics. An anonymous monitor — the audience this
 * endpoint is for — got "ok" while every schedule was stopped, for
 * thirty-five minutes, which is exactly what happened.
 *
 * The gate was protecting the pooler rather than the information, and a cached
 * reading protects it better: see readWorkerHeartbeatCached.
 *
 * Backups and mail stay behind the gate, deliberately. A backup that has gone
 * stale is worth an operator's attention and is not an outage, and a monitor
 * that pages somebody at three in the morning for one is muted within a week —
 * after which it reports nothing at all. The same is true of a mail server
 * that will not answer: invitations fall back to a link passed on by hand, and
 * nothing else in the platform notices.
 *
 * Mail has a second reason. Verifying it opens a connection to somebody else's
 * server, and doing that once per anonymous request to a polled endpoint is
 * the pooler argument pointed outwards. The first probe of this endpoint after
 * it was ungated came back 503 in 4.2 seconds — the whole check budget, spent
 * waiting on SMTP.
 */

// Always measured, never cached: a cached health check reports the past.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  // Established before the checks run, not after: several of them open a
  // direct database connection, and this endpoint is polled by anything that
  // can reach it. A connection per anonymous request would exhaust the pooler
  // and cause the outage this endpoint exists to report.
  //
  // The worker check is the exception and is no longer gated on this — it is
  // read through a thirty-second cache instead, so any rate of polling costs
  // two connections a minute.
  const key = new URL(request.url).searchParams.get('key') ?? undefined;
  const detailed = (await internalAccess(key)) !== 'denied';

  const report = await runDiagnostics({ directConnection: detailed });
  const failing = report.summary.fail > 0;

  const status = failing ? 'failing' : report.summary.warn > 0 ? 'degraded' : 'ok';

  return NextResponse.json(
    {
      status,
      // Degraded is deliberately still a 200. A missing AI key or an unset
      // site URL is worth knowing about and is not an outage, and a monitor
      // that pages someone at 3am for one is muted within a week — after
      // which it reports nothing at all.
      ...(detailed
        ? {
            checks: report.checks.map((check) => ({ name: check.name, status: check.status })),
            summary: report.summary,
            build: report.build,
            generatedAt: report.generatedAt,
          }
        : {}),
    },
    {
      status: failing ? 503 : 200,
      headers: {
        // Belt and braces alongside force-dynamic: a CDN caching this would
        // make it report the past too.
        'cache-control': 'no-store, max-age=0',
      },
    },
  );
}

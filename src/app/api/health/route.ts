import { NextResponse } from 'next/server';
import { runDiagnostics } from '@/features/diagnostics/checks';

/**
 * Machine-readable health.
 *
 * /diagnostics answers the question "what is wrong and what do I do about it"
 * for a person. This answers "is it up" for something that polls — an uptime
 * monitor, a deploy gate, a status page — and neither can do the other's job:
 * a monitor cannot read prose, and a person cannot act on a status code.
 *
 * The HTTP status is the whole point. 200 while healthy, 503 when a check has
 * failed, because that is the only part most monitors look at.
 *
 * Names and statuses only. The prose on the diagnostics page is already
 * redacted, but a monitoring endpoint is pulled into logs, dashboards and
 * third-party services by people who never chose to read it, so it carries the
 * minimum that answers the question.
 */

// Always measured, never cached: a cached health check reports the past.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const report = await runDiagnostics();

  const status =
    report.summary.fail > 0 ? 'failing' : report.summary.warn > 0 ? 'degraded' : 'ok';

  return NextResponse.json(
    {
      status,
      // Degraded is deliberately still a 200: a missing AI key or an unset
      // site URL is worth knowing about and is not an outage, and a monitor
      // that pages someone at 3am for it will soon be muted.
      checks: report.checks.map((check) => ({ name: check.name, status: check.status })),
      summary: report.summary,
      build: report.build,
      generatedAt: report.generatedAt,
    },
    {
      status: report.summary.fail > 0 ? 503 : 200,
      headers: {
        // Belt and braces alongside force-dynamic: a CDN caching this would
        // make it report the past too.
        'cache-control': 'no-store, max-age=0',
      },
    },
  );
}

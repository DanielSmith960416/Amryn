import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth/current-user';
import { renderReport } from '@/lib/reports/render';
import { loadWorkspace } from '@/lib/workspace';

/**
 * The executive report, print-ready.
 *
 * The route is behind authentication like every other client-area surface —
 * `requireUser` would redirect, which is right for a page and wrong for a
 * fetch, so this returns a 401 the caller can act on instead.
 *
 * The document is generated per request rather than cached: it is small, it is
 * per-account, and a cached executive brief that quietly serves last week's
 * figures is a worse failure than a few milliseconds of work.
 */
export const dynamic = 'force-dynamic';

const PERIODS = new Set(['weekly', 'monthly']);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ period: string }> },
) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to generate a report.' }, { status: 401 });
  }

  const { period } = await params;
  if (!PERIODS.has(period)) {
    return NextResponse.json(
      { error: 'Unknown report period. Use "weekly" or "monthly".' },
      { status: 404 },
    );
  }

  const workspace = loadWorkspace();
  const brief = period === 'monthly' ? workspace.monthly : workspace.weekly;

  return new NextResponse(renderReport(workspace, brief), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // A report is per-account and time-sensitive. No shared cache should
      // ever hold one.
      'Cache-Control': 'private, no-store',
    },
  });
}

import { NextResponse } from 'next/server';

/**
 * Liveness: is this process serving?
 *
 * Sibling to /api/health, and answering a different question. That one is
 * *readiness* — it asks the database, the mail service and the model provider
 * whether they are well, and returns 503 when one of them is not. Correct for
 * a monitor, and wrong for a deployment gate, for a reason that only shows up
 * on the day it matters:
 *
 * A first deployment has no database configured yet. Readiness therefore
 * fails, the platform marks the deploy unhealthy and rolls it back, and the
 * page that would have let somebody configure the database — /setup — is
 * never reachable, because it lives in the deployment that was just rolled
 * back. The check designed to catch a broken deployment is the thing making
 * it impossible to fix.
 *
 * So the deploy gate points here. This says only that the server started and
 * is answering, which is the whole of what a platform needs in order to decide
 * whether to send it traffic. Whether the deployment is *configured* is
 * /api/health's question, and a human's to act on.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET() {
  return NextResponse.json(
    { status: 'live' },
    { status: 200, headers: { 'cache-control': 'no-store, max-age=0' } },
  );
}

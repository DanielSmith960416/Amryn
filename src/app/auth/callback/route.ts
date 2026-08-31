import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/features/auth/next-path';

/**
 * OAuth and magic-link landing point.
 *
 * Exchanges the one-time code for a session, then sends the user on. The
 * `next` parameter is validated as a relative path — an unchecked redirect
 * target here would turn the sign-in flow into an open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const requested = searchParams.get('next');

  // One rule, shared with the sign-in actions. Two copies of a redirect
  // check are two chances to disagree about what is safe.
  const next = safeNextPath(requested);

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

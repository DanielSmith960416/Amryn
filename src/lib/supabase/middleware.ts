import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured, publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

// Reachable without a session. /diagnostics especially: most of what it can
// tell you is why signing in does not work, so gating it behind signing in
// would make it useless exactly when it is needed.
const PUBLIC_PATHS = [
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/auth',
  '/diagnostics',
  // The machine-readable half of the same thing. A monitor cannot sign in, and
  // a health check that needs credentials reports on the credentials rather
  // than on the service.
  '/api/health',
  // Not open — internalAccess() closes both, admitting an administrator or a
  // caller holding the token. They are listed here so middleware lets the
  // request reach that check: redirecting to sign-in first would mean the
  // token could never be used, and the token exists precisely for when nobody
  // can sign in.
  '/setup',
  // An invitation is followed by someone who does not have an account yet, so
  // the page has to be readable signed out. It reveals only the organisation's
  // name, the role and the address the invitation was sent to — all of which
  // the recipient already has in front of them. Accepting is a separate step
  // and needs a session.
  '/invite',
  // Someone deciding whether to create an account has to be able to read these
  // first. A privacy policy behind a sign-in is not notice to anybody who has
  // not already agreed to it.
  '/legal',
];

/**
 * The assurance level recorded in an access token.
 *
 * Read rather than verified: this only decides a redirect, and a forged token
 * is refused by the auth server on the very next call and by the database on
 * every query. Decoding it here avoids a round trip on every request.
 */
function decodeAal(accessToken: string | undefined): string | undefined {
  if (!accessToken) return undefined;
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return undefined;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    return (JSON.parse(json) as { aal?: string }).aal;
  } catch {
    return undefined;
  }
}

/**
 * Refreshes the Supabase session on every request and guards the dashboard.
 *
 * The session cookie has to be written onto the response that is actually
 * returned, so the response object is created first and handed to the client.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  // Without valid configuration there is no session to refresh. Let the request
  // through: the pages handle a signed-out visitor already, and the sign-in
  // page explains what is missing. Throwing here would 500 every route in the
  // application, including the one page able to describe the problem.
  if (!isSupabaseConfigured()) return response;

  const env = publicEnv();
  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates against the auth server. getSession() only decodes the
  // cookie, which is not enough to gate a route on.
  //
  // If that call fails — Supabase unreachable, a network blip — treat the
  // caller as signed out rather than erroring. The worst case is a redirect to
  // sign-in; the alternative is the entire application returning 500 because
  // one upstream request timed out.
  let user: User | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    console.error('[amryn:auth] session refresh failed, treating as signed out', error);
  }

  const data = { user };
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!data.user && !isPublic && pathname !== '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // A session that owes a second factor is sent to answer it. This is the
  // courtesy, not the control — the database refuses that session its data on
  // every route regardless — but without it somebody would meet a Command
  // Centre rendered entirely empty and conclude the platform had lost their
  // business.
  //
  // Read from the token rather than by asking the auth server: middleware runs
  // on every request, and a round trip here would be a round trip on every
  // asset that is not excluded by the matcher. The claim is signed, so a
  // forged one fails at the database anyway.
  if (data.user && !isPublic && pathname !== '/verify' && pathname !== '/') {
    const session = await supabase.auth.getSession().catch(() => null);
    const claims = session?.data.session?.user.factors ?? [];
    const verified = claims.some((factor) => factor.status === 'verified');
    const aal = decodeAal(session?.data.session?.access_token);

    if (verified && aal === 'aal1') {
      const url = request.nextUrl.clone();
      url.pathname = '/verify';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  if (data.user && (pathname === '/sign-in' || pathname === '/sign-up')) {
    const url = request.nextUrl.clone();
    url.pathname = '/command-centre';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

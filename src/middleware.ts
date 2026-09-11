import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files — those never carry a
     * session and running auth on them would cost a round trip per asset.
     *
     * robots.txt and sitemap.xml are excluded for a different reason: a
     * crawler cannot sign in, so redirecting them to /sign-in meant the file
     * telling crawlers what not to index was itself unreachable. Found by
     * fetching it rather than by reading this line.
     */
    /*
     * api/health is excluded for a third reason again: the platform's own
     * health probe runs on a timer for ever, and every one of them was
     * reaching the session middleware and spending a round trip to the auth
     * server to establish that a monitor is not signed in. It never was, it
     * never will be, and the route is public anyway.
     */
    '/((?!_next/static|_next/image|api/health|favicon.ico|robots\\.txt|sitemap\\.xml|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

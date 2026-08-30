import 'server-only';

/**
 * Server Supabase clients.
 *
 * `createClient()` is the one to reach for: it carries the caller's session, so
 * every query is filtered by Row Level Security. `createAdminClient()` bypasses
 * RLS entirely and exists only for work that runs outside a user session —
 * scheduled ingestion, radar scans, invitations. Anything using it must apply
 * tenant scoping itself, in code.
 */
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { publicEnv, serviceRoleKey } from '@/lib/env';
import type { Database } from '@/types/database';

export async function createClient() {
  const env = publicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * RLS-bypassing client. Never call this in response to a user request without
 * first establishing, in code, which organisation the work belongs to.
 */
export function createAdminClient() {
  const env = publicEnv();
  return createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

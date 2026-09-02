import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseUrl } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * The one thing that needs a key stronger than the caller's own session.
 *
 * Removing a second factor from a session that has not presented that factor
 * is exactly what Supabase refuses, and rightly — it is the bypass the factor
 * exists to prevent. Recovery therefore has to be performed by something the
 * user is not, which means the service role.
 *
 * That key bypasses every row level security policy in the database, so it is
 * confined to this file, used for one call, and never given a client. It is
 * read from the environment at call time and never returned, logged, or put in
 * an error.
 */

export function serviceRoleKey(): string | undefined {
  if (typeof window !== 'undefined') {
    throw new Error('serviceRoleKey() must never be called in the browser');
  }
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return value && value.length > 0 ? value : undefined;
}

export interface RemovalResult {
  ok: boolean;
  problem?: string;
}

/**
 * Removes every second factor from one account.
 *
 * Takes the id from the caller's verified session, never from a request — this
 * function is one parameter away from being a way to strip anybody's
 * two-factor authentication, and that parameter must never come from outside.
 */
export async function removeAllFactors(userId: string): Promise<RemovalResult> {
  const key = serviceRoleKey();
  if (!key) return { ok: false, problem: 'SUPABASE_SERVICE_ROLE_KEY is not set.' };

  const url = resolveSupabaseUrl().url;
  if (!url) return { ok: false, problem: 'The project URL could not be resolved.' };

  try {
    const admin = createClient<Database>(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
    if (error) return { ok: false, problem: error.message };

    for (const factor of data?.factors ?? []) {
      const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({
        userId,
        id: factor.id,
      });
      if (deleteError) return { ok: false, problem: deleteError.message };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, problem: error instanceof Error ? error.message : String(error) };
  }
}

'use server';

/**
 * Building the database from the application.
 *
 * Two gates, and the reasoning for each:
 *
 *   · A signed-in caller. Sign-in works before the schema exists, because
 *     Supabase keeps accounts in a schema of its own, so this costs nothing
 *     and keeps an anonymous visitor away from a route that runs DDL.
 *   · applySchema() refuses unless the schema is absent. That is the gate that
 *     actually matters: once built, this route can do nothing at all.
 *
 * The statements are the repository's own, imported at build time. The caller
 * chooses whether to run them and never what they are.
 */
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { applySchema, type SetupResult } from '@/lib/db/setup';

export type SetupState = { status: 'idle' } | ({ status: 'done' } & SetupResult);

export async function buildDatabase(): Promise<SetupState> {
  await requireUser();
  const result = await applySchema();
  revalidatePath('/', 'layout');
  return { status: 'done', ...result };
}

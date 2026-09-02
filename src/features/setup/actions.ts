'use server';

/**
 * Building the database, or bringing it up to date, from the application.
 *
 * Two gates, and the reasoning for each:
 *
 *   · internalAccess(): an administrator, or a caller holding the internal
 *     token. The same gate the page carries — a server action is reachable
 *     without ever loading the page it belongs to, so a page-only check is not
 *     a check.
 *   · applySchema() decides what there is to do by looking. On an empty
 *     database it builds the whole schema in one transaction; on one that
 *     already exists it applies only the migrations that database has not
 *     recorded, each in its own.
 *
 * That second point used to read "refuses unless the schema is absent", which
 * was the gate that mattered while setup happened once. It stopped being
 * tenable the first time a migration had to reach a deployment with customers
 * in it: the answer then was to paste SQL into an editor by hand and remember
 * which files you had done. Widening what this can do is exactly why the first
 * gate had to be narrowed at the same time.
 *
 * The statements are the repository's own, imported at build time. The caller
 * chooses whether to run them and never what they are.
 */
import { revalidatePath } from 'next/cache';
import { internalAccess } from '@/lib/auth/internal-access';
import { applySchema, type SetupResult } from '@/lib/db/setup';

export type SetupState =
  | { status: 'idle' }
  | { status: 'refused'; message: string }
  | ({ status: 'done' } & SetupResult);

export async function buildDatabase(key?: string): Promise<SetupState> {
  if ((await internalAccess(key)) === 'denied') {
    return {
      status: 'refused',
      message: 'You do not have permission to change the database.',
    };
  }

  const result = await applySchema();
  revalidatePath('/', 'layout');
  return { status: 'done', ...result };
}

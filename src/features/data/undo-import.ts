'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { can, requirePermission } from '@/lib/auth/session';
import { recordEvent } from '@/lib/audit';
import { label } from './import-labels';
import { UNDO_ORDER, writePermission } from './import-permissions';

/**
 * Taking an import back out.
 *
 * ── why it did not exist ─────────────────────────────────────────────────
 * It could not. Nothing written by an import recorded which import wrote it,
 * so there was no set of rows to remove — and an import could therefore be
 * made and never undone. Every clean-up was somebody running DELETE against
 * production with a timestamp and an organisation id, which is not something
 * a customer can do and not something anybody should do for them.
 *
 * Migration 49 gives every imported row an import_id. This reads it.
 *
 * ── what it removes, and what it will not ────────────────────────────────
 * Only rows carrying this import's id. A figure typed in by hand, arriving
 * from a connector, or written before that column existed has a null
 * import_id and is not touched by anything here — undoing an import must
 * never take something with it that the import did not bring.
 *
 * The tables are cleared in the reverse of the order they were written, so a
 * failure part-way leaves the financial rows — the ones every screen reads —
 * for last rather than first.
 */

export type UndoState = { status: 'idle' } | { status: 'error'; message: string };

export async function undoImport(_previous: UndoState, formData: FormData): Promise<UndoState> {
  const workspace = await requirePermission('import_data');

  const id = formData.get('id');
  if (typeof id !== 'string' || id.length === 0) {
    return { status: 'error', message: 'That import could not be identified.' };
  }

  const supabase = await createClient();

  /*
   * Read it first, scoped to this organisation. Not a formality: the id comes
   * from a form, and a delete driven by an unchecked identifier is how one
   * customer removes another's figures. Row-level security would refuse it
   * too, but a check that relies on something else refusing stops refusing
   * the day that something else changes.
   */
  const { data: record } = await supabase
    .from('data_imports')
    .select('id, filename, rows_imported')
    .eq('id', id)
    .eq('organisation_id', workspace.organisation.id)
    .maybeSingle();

  if (!record) {
    return { status: 'error', message: 'That import is no longer here.' };
  }

  let removed = 0;

  for (const table of UNDO_ORDER) {
    /*
     * Opportunities and risks are governed by manage_opportunities and
     * manage_risks rather than import_data — the same split the import
     * itself respects. Somebody who could not have written them cannot
     * remove them, and is told rather than silently given a partial undo.
     */
    const needed = writePermission(table);
    if (needed && !can(workspace, needed)) {
      const { count } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('import_id', id);

      if ((count ?? 0) > 0) {
        return {
          status: 'error',
          message:
            `This import wrote ${count} ${label(table)}, and removing them needs a permission your ` +
            'role does not have. Nothing has been removed. Ask an administrator to undo it.',
        };
      }
      continue;
    }

    const { data, error } = await supabase.from(table).delete().eq('import_id', id).select('id');

    if (error) {
      return {
        status: 'error',
        message:
          removed > 0
            ? `Removed ${removed} rows, then ${label(table)} was refused: ${error.message}`
            : `The import could not be removed: ${error.message}`,
      };
    }

    removed += data?.length ?? 0;
  }

  // The record last, so a failure above leaves it in place with its rows and
  // the undo can be tried again. A history row with no rows behind it would
  // be a claim that an import happened and left nothing.
  const { error: closing } = await supabase.from('data_imports').delete().eq('id', id);
  if (closing) {
    return {
      status: 'error',
      message: `Its ${removed} rows were removed, but the history entry could not be: ${closing.message}`,
    };
  }

  await recordEvent(workspace.organisation.id, 'workbook.import_undone', {
    entityType: 'workbook',
    summary: `Removed ${removed} records imported from ${record.filename}`,
  });

  // Every screen in the product reads these tables.
  revalidatePath('/', 'layout');

  return { status: 'idle' };
}

'use server';

/**
 * Taking a file, whatever kind of file it is.
 *
 * ── the promise this makes, and the one it refuses to make ───────────────
 *
 * A spreadsheet is read: its sheets, its column headings and how many rows it
 * has are recorded, and what is in it can be used. Anything else is kept: it
 * is stored, listed, and handed back when asked for, and nobody — no model, no
 * scoring job, no page — has looked inside it.
 *
 * That second half is the important one and it is easy to erode. The obvious
 * next feature is "summarise this PDF", and the obvious shortcut is to let the
 * interface imply it already happened. Every row here records which of the two
 * things was done, so a page cannot claim the other by accident. It is the
 * same rule that stops the Twin filling a numeric gap from memory, applied to
 * files: a business relying on an analysis nobody performed is the failure,
 * and it does not announce itself.
 *
 * ── where the bytes go ───────────────────────────────────────────────────
 *
 * Supabase Storage, under `<organisation_id>/<document id>`, through the
 * caller's own client so the storage policies from migration 37 apply. Not
 * through the service-role client: that would bypass row level security and
 * leave tenant isolation resting on this file being written correctly, which
 * is exactly the thing the database is there to stop depending on.
 */
import { revalidatePath } from 'next/cache';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { checkLimit } from '@/lib/auth/rate-limit';
import { recordEvent } from '@/lib/audit';
import { ourFault } from '@/lib/errors';
import { readTable, SpreadsheetError } from '@/lib/files/table';
import { DOCUMENTS_BUCKET } from './bucket';
import {
  describeBytes,
  extensionOf,
  isRefused,
  isTable,
  kindOf,
  MAX_TABLE_BYTES,
  sizeLimitFor,
} from '@/lib/files/kinds';

export type UploadState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | {
      status: 'stored';
      filename: string;
      handling: 'table' | 'document';
      rowCount: number;
      columns: string[];
      readError: string;
    };

const noteSchema = z.string().trim().max(2000).optional();

export async function uploadDocument(
  _previous: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const workspace = await requirePermission('import_data');

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Choose a file to upload.' };
  }

  if (isRefused(file.name)) {
    return {
      status: 'error',
      message:
        `Amryn does not store ${extensionOf(file.name)} files. ` +
        'Everything on that short list is a program rather than a business record, and a ' +
        'platform that hands programs back is a way to pass somebody an installer that looks ' +
        'like it came from their finance team. If you have a reason to keep one here, say so ' +
        'and we will look at it properly.',
    };
  }

  const ceiling = sizeLimitFor(file.name);
  if (file.size > ceiling) {
    return {
      status: 'error',
      message:
        `That file is ${describeBytes(file.size)} and the limit is ${describeBytes(ceiling)}` +
        (ceiling === MAX_TABLE_BYTES
          ? ' for a spreadsheet, because its rows are read as well as stored.'
          : '.') +
        ' Something larger than this is a data feed rather than a document, and a feed wants a connection rather than an upload.',
    };
  }

  const note = noteSchema.safeParse(formData.get('note') ?? undefined);
  if (!note.success) {
    return { status: 'error', message: 'That note is longer than we can store. Keep it under 2,000 characters.' };
  }

  const limit = await checkLimit('documentUpload', workspace.organisation.id);
  if (!limit.allowed) return { status: 'error', message: limit.message! };

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Read before storing. A spreadsheet we cannot open is still worth keeping —
  // it is the customer's file — but the row has to say we tried and failed
  // rather than leaving it looking like an ordinary document nobody opened.
  let handling: 'table' | 'document' = isTable(file.name) ? 'table' : 'document';
  let sheetNames: string[] = [];
  let columns: string[] = [];
  let rowCount = 0;
  let readError = '';

  if (handling === 'table') {
    try {
      const table = readTable(file.name, bytes);
      sheetNames = table.sheetNames;
      columns = table.headers.filter((header) => header !== '');
      rowCount = table.rows.length;
    } catch (error) {
      handling = 'document';
      readError =
        error instanceof SpreadsheetError
          ? error.message
          : ourFault('documents', error, 'We could not read the rows in that file, so it has been kept as it is.');
    }
  }

  const checksum = createHash('sha256').update(bytes).digest('hex');
  const supabase = await createClient();

  // The row first, so the path is a real identifier rather than one this code
  // invented and hoped was unique. A row with no object behind it is visible
  // and fixable; an object with no row is litter nobody can find.
  const { data: document, error: rowError } = await supabase
    .from('data_documents')
    .insert({
      organisation_id: workspace.organisation.id,
      filename: file.name.slice(0, 300),
      content_type: file.type || (kindOf(file.name)?.contentTypes[0] ?? ''),
      byte_size: file.size,
      handling,
      storage_path: 'pending',
      checksum,
      sheet_names: sheetNames,
      columns_found: columns,
      row_count: rowCount,
      read_error: readError,
      note: note.data ?? '',
      uploaded_by: workspace.user.id,
    })
    .select('id')
    .single();

  if (rowError || !document) {
    return {
      status: 'error',
      message: ourFault('documents', rowError, 'We could not record that file. Nothing was stored.'),
    };
  }

  // The customer's own file name is deliberately not in the path. It would
  // have to be sanitised, sanitising is where path-traversal bugs live, and
  // the name is already in the column above.
  const path = `${workspace.organisation.id}/${document.id}`;

  const { error: storeError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, bytes, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (storeError) {
    // The row exists and the bytes do not, which would list a file that cannot
    // be opened. Removed rather than left, the same way a stocktake whose lines
    // failed to save removes its own audit.
    await supabase.from('data_documents').delete().eq('id', document.id);
    return {
      status: 'error',
      message: ourFault('documents', storeError, 'We could not store that file. Nothing was kept.'),
    };
  }

  const { error: pathError } = await supabase
    .from('data_documents')
    .update({ storage_path: path })
    .eq('id', document.id);

  if (pathError) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
    await supabase.from('data_documents').delete().eq('id', document.id);
    return {
      status: 'error',
      message: ourFault('documents', pathError, 'We could not finish storing that file. Nothing was kept.'),
    };
  }

  await recordEvent(workspace.organisation.id, 'document.uploaded', {
    entityType: 'data_document',
    entityId: document.id,
    summary: `${file.name} — ${describeBytes(file.size)}, ${handling === 'table' ? `${rowCount} rows read` : 'kept as a document'}`,
  });

  revalidatePath('/data/imports');
  revalidatePath('/data');

  return { status: 'stored', filename: file.name, handling, rowCount, columns, readError };
}

export type RemoveState = { status: 'idle' } | { status: 'error'; message: string } | { status: 'removed' };

export async function removeDocument(
  _previous: RemoveState,
  formData: FormData,
): Promise<RemoveState> {
  const workspace = await requirePermission('import_data');

  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return { status: 'error', message: 'That file could not be identified.' };

  const supabase = await createClient();

  // Read it back rather than trusting the form for the path. The row is behind
  // row level security, so a document id belonging to another organisation
  // returns nothing here — which is the check, not a courtesy.
  const { data: document } = await supabase
    .from('data_documents')
    .select('id, filename, storage_path')
    .eq('id', id.data)
    .eq('organisation_id', workspace.organisation.id)
    .single();

  if (!document) return { status: 'error', message: 'That file is not here any more.' };

  const { error: storeError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([document.storage_path]);
  if (storeError) {
    // Deliberately not fatal. Bytes left behind are a tidying problem; a row
    // that cannot be deleted because its object is already gone is a file the
    // customer cannot remove from their own list.
    ourFault('documents', storeError, '');
  }

  const { error } = await supabase.from('data_documents').delete().eq('id', document.id);
  if (error) {
    return {
      status: 'error',
      message: ourFault('documents', error, 'We could not remove that file. Please try again.'),
    };
  }

  await recordEvent(workspace.organisation.id, 'document.removed', {
    entityType: 'data_document',
    entityId: document.id,
    summary: document.filename,
  });

  revalidatePath('/data/imports');
  return { status: 'removed' };
}

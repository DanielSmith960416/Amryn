'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { can, requirePermission } from '@/lib/auth/session';
import { recordEvent } from '@/lib/audit';
import { isLegacyExcel, readWorkbook, SpreadsheetError } from '@/lib/files/xlsx';
import { planWorkbook, type Skipped } from '@/lib/import/plan';
import { label } from './import-labels';
import { partitionByPermission, WRITE_ORDER } from './import-permissions';

/**
 * Loading a management workbook into the tables the product reads.
 *
 * ── why this exists ──────────────────────────────────────────────────────
 * Amryn could show a business its own figures only if somebody typed them in
 * or connected a system. The workbook a business already keeps — the one their
 * accountant sends every month — had no way in at all. That made the product
 * demonstrable on a seeded example and on nothing else.
 *
 * ── what it will and will not do ─────────────────────────────────────────
 * It imports what the workbook states. It does not infer, default, or fill a
 * gap: a blank cell stays blank, a dash means "not recorded", and a sheet it
 * cannot read honestly is reported rather than half-read. Every sheet either
 * produces rows or produces a sentence saying why it did not, and the uploader
 * sees both.
 *
 * The reasons are worth reading rather than dismissing. "Gross profit is
 * calculated from the other lines" is not this importer being fussy — import
 * it beside revenue and cost of sales and the business reports a third more
 * revenue than it made, on a screen where nothing looks wrong.
 */

export type ImportState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | {
      status: 'done';
      imported: { table: string; rows: number }[];
      total: number;
      skipped: Skipped[];
      year: number | null;
      filename: string;
    };

/** More than any management pack, and a cheap refusal of a file built to hurt. */
const MAX_BYTES = 12 * 1024 * 1024;

export async function importWorkbook(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  /*
   * import_data, which is what the database itself requires: every policy on
   * data_imports is written against it. Deliberately not view_data_sources,
   * which is all the page needs — reading the list of connections and writing
   * six months of figures every colleague will treat as fact are not the same
   * act, and the check here should agree with the one underneath rather than
   * be a second opinion about it.
   */
  const workspace = await requirePermission('import_data');

  const file = formData.get('workbook');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Choose a workbook to import.' };
  }
  if (file.size > MAX_BYTES) {
    return { status: 'error', message: 'That file is larger than 12 MB.' };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const supabase = await createClient();

  if (isLegacyExcel(bytes)) {
    return {
      status: 'error',
      message:
        'That is the older .xls format, which cannot be read here. Open it and use Save As → Excel Workbook (.xlsx).',
    };
  }

  let sheets;
  try {
    const first = readWorkbook(bytes);
    sheets = first.sheetNames.map((name) => ({
      name,
      records: readWorkbook(bytes, name).records,
    }));
  } catch (thrown) {
    if (thrown instanceof SpreadsheetError) {
      return { status: 'error', message: thrown.message };
    }
    return { status: 'error', message: 'That file could not be read as a workbook.' };
  }

  /*
   * Has this exact file been imported before?
   *
   * It matters more here than in most importers. Every screen in the product
   * reads these tables by summing them, so importing the same workbook twice
   * does not produce a visible duplicate — it produces a business with twice
   * the revenue, on a dashboard where nothing looks wrong. That is the same
   * failure this importer refuses derived lines to avoid, and it would be
   * incoherent to guard one and ship the other.
   *
   * The file's own bytes are the identity, not its name: a workbook renamed on
   * the way through is the same workbook, and two different months exported
   * under one name are not.
   */
  const fingerprint = await sha256(bytes);
  const { data: already } = await supabase
    .from('data_imports')
    .select('created_at, rows_imported')
    .eq('organisation_id', workspace.organisation.id)
    .eq('status', 'complete')
    .contains('validation', { fingerprint })
    .maybeSingle();

  if (already) {
    // The date is formatted only if it is one. A row whose created_at is
    // missing or unreadable should not produce "already imported on Invalid
    // Date" — which reads as a broken product at the exact moment the reader
    // is being told their figures are safe.
    const when = readableDate(already.created_at);
    return {
      status: 'error',
      message:
        `This workbook was already imported${when ? ` on ${when}` : ''}, adding ${already.rows_imported} ` +
        'records. Importing it again would count the same figures twice, so nothing has been changed. ' +
        'Export a fresh workbook to add new months.',
    };
  }

  const plan = planWorkbook(sheets);

  /*
   * Which of the five tables this person may actually write to. import_data
   * is not the whole answer — see import-permissions.ts for what the database
   * asks for, and for the double count that discovering it mid-write caused.
   */
  const { allowed, refused } = partitionByPermission(plan.drafts, (permission) =>
    can(workspace, permission),
  );

  const skipped = [...plan.skipped, ...refused];

  if (allowed.length === 0) {
    return {
      status: 'done',
      imported: [],
      total: 0,
      skipped,
      year: plan.year,
      filename: file.name,
    };
  }

  const organisationId = workspace.organisation.id;
  const imported: { table: string; rows: number }[] = [];

  /*
   * The import record is opened before the rows, and finished after them.
   *
   * It used to be written only at the end, on the reasoning that a record
   * claiming an import which then failed half way is worse than no record —
   * the next attempt would be refused as a duplicate and the business would
   * be stuck with the partial import and no way through the interface.
   *
   * That reasoning was right about the danger and wrong about the fix. Rows
   * written before their record exists cannot carry its id, so no row knew
   * which import made it, so no import could be undone — and the partial
   * import it was protecting against was exactly the case somebody then could
   * not clear.
   *
   * Opening it as `importing` solves both. The duplicate guard above asks for
   * status 'complete', so a half-finished import never blocks a retry. And an
   * import that dies part-way is now a visible row that says so, with its
   * rows attached to it, which is what makes it removable.
   */
  const { data: record, error: opening } = await supabase
    .from('data_imports')
    .insert({
      organisation_id: organisationId,
      filename: file.name,
      status: 'importing',
      row_count: plan.drafts.length,
      rows_imported: 0,
      rows_rejected: 0,
      validation: {
        fingerprint,
        year: plan.year,
        skipped: skipped.map((entry) => ({ sheet: entry.sheet, reason: entry.reason })),
      },
      uploaded_by: workspace.user.id,
    })
    .select('id')
    .single();

  if (opening || !record) {
    return {
      status: 'error',
      message: `The import could not be started: ${opening?.message ?? 'no record was created'}`,
    };
  }

  const importId = record.id;

  /*
   * Written table by table rather than in one transaction, because PostgREST
   * has no transaction to offer across several of them. The order is chosen so
   * that a failure part-way leaves something coherent: the financial rows are
   * what every screen reads, so they land first, and a later failure leaves a
   * business with fewer records rather than with a broken set of them.
   *
   * Each batch reports what it wrote, so a partial import says so precisely
   * instead of claiming the whole file.
   */
  for (const table of WRITE_ORDER) {
    const rows = allowed.filter((draft) => draft.table === table).map((draft) => draft.row);
    if (rows.length === 0) continue;

    const { error } = await supabase
      .from(table)
      .insert(
        rows.map((row) => ({ ...row, organisation_id: organisationId, import_id: importId })) as never,
      );

    if (error) {
      return {
        status: 'error',
        message:
          imported.length > 0
            ? `Imported ${imported.map((i) => `${i.rows} ${label(i.table)}`).join(', ')}, then ${label(table)} was refused: ${error.message}`
            : `The import was refused: ${error.message}`,
      };
    }

    imported.push({ table, rows: rows.length });
  }

  const total = imported.reduce((sum, entry) => sum + entry.rows, 0);

  // Only now does it count as complete, which is the state the duplicate
  // guard looks for. Everything up to here is a row saying an import is in
  // progress, which is true and removable.
  await supabase
    .from('data_imports')
    .update({
      status: 'complete',
      rows_imported: total,
      rows_rejected: plan.drafts.length - total,
      completed_at: new Date().toISOString(),
    })
    .eq('id', importId);

  await recordEvent(organisationId, 'workbook.imported', {
    entityType: 'workbook',
    summary: `Imported ${total} records from ${file.name}`,
  });

  // Every screen in the product reads these tables.
  revalidatePath('/', 'layout');

  return {
    status: 'done',
    imported,
    total,
    skipped,
    year: plan.year,
    filename: file.name,
  };
}

function readableDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-ZA');
}

/**
 * A fingerprint of the file's bytes.
 *
 * SHA-256 through the platform's own crypto rather than a dependency: it is
 * present in every runtime this ships to, and the hash is used to recognise a
 * file, not to protect anything.
 */
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

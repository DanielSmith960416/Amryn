'use server';

/**
 * Importing a stocktake from a spreadsheet.
 *
 * The file is read, mapped and written in one action, and the whole thing is
 * one audit — so a partial import is not a possible outcome. Either the
 * stocktake exists with all its lines or it does not exist at all, which
 * matters because the compliance figures are counts: a stocktake missing forty
 * of its lines does not look broken, it looks compliant.
 *
 * ── refusing rows, and not refusing them ──────────────────────────────────
 * A row without a readable product name or expiry date cannot be evaluated —
 * expiry is what every section of the report sorts on — so those are reported
 * back with their line numbers and nothing is written. Everything softer is
 * absorbed: an unreadable action becomes 'Pending Review', a missing cost
 * becomes "not costed", a blank quantity becomes zero. The first import of a
 * real spreadsheet should not be a wall of rejections over spellings.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { checkLimit } from '@/lib/auth/rate-limit';
import { recordEvent } from '@/lib/audit';
import { ourFault } from '@/lib/errors';
import { findHeader, parseCsv } from '@/lib/inventory/csv';
import {
  actionFromText,
  centsFromText,
  dateFromText,
  quantityFromText,
} from '@/lib/inventory/mapping';
import type { InsertRow } from '@/types/database';

/**
 * What each column may be called.
 *
 * Spreadsheets in the wild name the same thing several ways, and insisting on
 * one spelling means the first thing a customer does is fail. Order matters:
 * the first match wins, so the most specific spelling comes first.
 */
const COLUMNS = {
  productName: ['product name', 'product', 'item name', 'item', 'description'],
  sku: ['sku', 'code', 'product code', 'item code', 'barcode'],
  batchNumber: ['batch number', 'batch', 'lot number', 'lot'],
  department: ['department', 'section', 'category', 'aisle'],
  location: ['location', 'shelf', 'bin', 'position'],
  qty: ['qty', 'quantity', 'count', 'units', 'on hand'],
  expiryDate: ['expiry date', 'expiry', 'expires', 'exp date', 'best before', 'use by'],
  action: ['action', 'action taken', 'status', 'outcome'],
  actionedBy: ['actioned by', 'checked by', 'by', 'staff'],
  actionedOn: ['date actioned', 'actioned on', 'action date'],
  notes: ['notes', 'comment', 'comments', 'remarks'],
  unitCost: ['unit cost', 'cost', 'price', 'unit price', 'cost price'],
  verified: ['verified', 'checked', 'confirmed'],
} as const;

const settingsSchema = z.object({
  siteName: z.string().trim().min(1, 'Name the site this stocktake covers').max(160),
  auditorName: z.string().trim().max(160).optional(),
  responsibleName: z.string().trim().max(160).optional(),
  shift: z.string().trim().max(80).optional(),
  complianceProfileId: z.string().trim().min(1).max(80),
  auditDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Give the date the stocktake was taken'),
});

export type ImportState =
  | { status: 'idle' }
  | { status: 'error'; message: string; rejected?: string[] }
  | { status: 'imported'; lines: number; auditId: string };

/** 5 MB. A stocktake of a hundred thousand lines is a different product. */
const MAX_BYTES = 5 * 1024 * 1024;

export async function importStocktake(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const workspace = await requirePermission('manage_inventory');

  const settings = settingsSchema.safeParse({
    siteName: formData.get('siteName'),
    auditorName: formData.get('auditorName') ?? undefined,
    responsibleName: formData.get('responsibleName') ?? undefined,
    shift: formData.get('shift') ?? undefined,
    complianceProfileId: formData.get('complianceProfileId'),
    auditDate: formData.get('auditDate'),
  });
  if (!settings.success) {
    return { status: 'error', message: settings.error.issues[0]?.message ?? 'Check the details.' };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Choose a spreadsheet to import.' };
  }
  if (file.size > MAX_BYTES) {
    return {
      status: 'error',
      message: 'That file is larger than we can take here. Split it by site or by department.',
    };
  }

  const limit = await checkLimit('stockImport', workspace.organisation.id);
  if (!limit.allowed) return { status: 'error', message: limit.message! };

  const { headers, rows } = parseCsv(await file.text());
  if (rows.length === 0) {
    return {
      status: 'error',
      message: 'That file has a header row and nothing under it.',
    };
  }

  const column = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, accepted]) => [key, findHeader(headers, accepted)]),
  ) as Record<keyof typeof COLUMNS, string | null>;

  // The two without which a line cannot be evaluated at all.
  if (!column.productName || !column.expiryDate) {
    const missing = [
      column.productName ? null : 'a product name',
      column.expiryDate ? null : 'an expiry date',
    ].filter(Boolean);
    return {
      status: 'error',
      message:
        `We could not find ${missing.join(' or ')} in that file. ` +
        `The columns we found were: ${headers.filter(Boolean).join(', ')}.`,
    };
  }

  const cell = (row: Record<string, string>, key: keyof typeof COLUMNS): string => {
    const header = column[key];
    return header ? (row[header] ?? '') : '';
  };

  const rejected: string[] = [];
  const lines: Omit<InsertRow<'stock_items'>, 'audit_id'>[] = [];

  for (const [index, row] of rows.entries()) {
    // Line 1 is the header, so a person counting rows in their spreadsheet
    // gets the number they can see.
    const line = index + 2;

    const productName = cell(row, 'productName');
    if (productName === '') {
      rejected.push(`Line ${line}: no product name`);
      continue;
    }

    const expiry = dateFromText(cell(row, 'expiryDate'));
    if (!expiry) {
      rejected.push(`Line ${line}: could not read the expiry date "${cell(row, 'expiryDate')}"`);
      continue;
    }

    const qty = quantityFromText(cell(row, 'qty'));
    if (qty === null) {
      rejected.push(`Line ${line}: could not read the quantity "${cell(row, 'qty')}"`);
      continue;
    }

    const action = actionFromText(cell(row, 'action'));
    // An actioned line must carry a date — the database refuses one that does
    // not, because a disposal without a date is not documentation. Where a
    // spreadsheet names an action and no date, the stocktake's own date is the
    // honest answer: that is when the count happened.
    const actionedOn =
      action === 'pending_review'
        ? null
        : (dateFromText(cell(row, 'actionedOn')) ?? settings.data.auditDate);

    const verifiedText = cell(row, 'verified').toLowerCase();

    lines.push({
      organisation_id: workspace.organisation.id,
      product_name: productName.slice(0, 300),
      sku: cell(row, 'sku').slice(0, 100),
      batch_number: cell(row, 'batchNumber').slice(0, 100),
      department: cell(row, 'department').slice(0, 120),
      location: cell(row, 'location').slice(0, 120),
      qty,
      expiry_date: expiry,
      action,
      actioned_by: cell(row, 'actionedBy').slice(0, 160),
      actioned_on: actionedOn,
      notes: cell(row, 'notes').slice(0, 2000),
      verified: ['y', 'yes', 'true', '1', '✓', 'x'].includes(verifiedText),
      unit_cost_cents: centsFromText(cell(row, 'unitCost')),
      position: lines.length + 1,
    });
  }

  if (lines.length === 0) {
    return {
      status: 'error',
      message: 'Nothing in that file could be read as a stock line.',
      rejected: rejected.slice(0, 20),
    };
  }

  const supabase = await createClient();

  const { data: audit, error: auditError } = await supabase
    .from('stock_audits')
    .insert({
      organisation_id: workspace.organisation.id,
      site_name: settings.data.siteName,
      auditor_name: settings.data.auditorName ?? '',
      responsible_name: settings.data.responsibleName ?? '',
      shift: settings.data.shift ?? '',
      compliance_profile_id: settings.data.complianceProfileId,
      audit_date: settings.data.auditDate,
      status: 'draft',
      created_by: workspace.user.id,
    })
    .select()
    .single();

  if (auditError || !audit) {
    return {
      status: 'error',
      message: ourFault('inventory', auditError, 'We could not start that stocktake. Please try again.'),
    };
  }

  const { error: linesError } = await supabase
    .from('stock_items')
    .insert(lines.map((line) => ({ ...line, audit_id: audit.id })));

  if (linesError) {
    // The audit exists and its lines do not, which would read as a stocktake
    // of an empty shop. Removed rather than left: a half-imported stocktake is
    // the one outcome the compliance figures cannot survive.
    await supabase.from('stock_audits').delete().eq('id', audit.id);
    return {
      status: 'error',
      message: ourFault('inventory', linesError, 'We could not save those stock lines. Nothing was imported.'),
    };
  }

  // Complete only once the lines are in, so the workspace — which reads the
  // latest completed stocktake — cannot pick up an empty one.
  await supabase
    .from('stock_audits')
    .update({ status: 'complete', completed_at: new Date().toISOString() })
    .eq('id', audit.id);

  await recordEvent(workspace.organisation.id, 'stocktake.imported', {
    entityType: 'stock_audit',
    entityId: audit.id,
    summary: `${settings.data.siteName} — ${lines.length} lines`,
  });

  revalidatePath('/inventory');
  revalidatePath('/inventory/audit-log');
  revalidatePath('/inventory/stock-report');

  return { status: 'imported', lines: lines.length, auditId: audit.id };
}

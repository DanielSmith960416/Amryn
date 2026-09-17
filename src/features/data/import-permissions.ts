/**
 * Which of the importer's five tables a person may actually write to.
 *
 * ── why this is not one permission ───────────────────────────────────────
 * The action holds import_data, because that is what data_imports and the
 * three record tables ask for. It is not what opportunities and risks ask
 * for: an opportunity and a risk are judgements about what might happen
 * rather than records of what did, and their policies were written against
 * manage_opportunities and manage_risks long before this importer existed.
 *
 * An analyst is exactly the role that falls in the gap. Its description says
 * "read everything, import data and define metrics" — it holds import_data
 * and neither of the other two, on purpose.
 *
 * ── what went wrong without it ───────────────────────────────────────────
 * The import wrote its way down the table order until the database refused
 * it: financial, sales and operational rows in, opportunities rejected by
 * row-level security, the whole thing reported as a partial failure. And the
 * data_imports row is written after the loop, so no fingerprint was recorded
 * — which left the second attempt allowed, and the second attempt would write
 * those first three tables again.
 *
 * That is the silent double count this module exists to prevent, arriving
 * through a door nobody was watching. So the split happens before anything is
 * written: what the person may import lands completely and is recorded, and
 * what they may not is reported in the same list, in the same words, as
 * everything else the workbook did not put on screen.
 */
import type { Draft, Skipped } from '@/lib/import/plan';
import { heading, label } from './import-labels';

export type WritePermission = 'manage_opportunities' | 'manage_risks';

/**
 * The permission the database requires for one table, or null where that is
 * import_data — already held by anyone who reached the action at all.
 */
export function writePermission(table: string): WritePermission | null {
  switch (table) {
    case 'opportunities':
      return 'manage_opportunities';
    case 'risks':
      return 'manage_risks';
    default:
      return null;
  }
}

/** How that permission reads to somebody who does not have it. */
export function permissionName(permission: string): string {
  switch (permission) {
    case 'manage_opportunities':
      return 'manage opportunities';
    case 'manage_risks':
      return 'manage risks';
    default:
      return permission.replace(/_/g, ' ');
  }
}

export interface Partitioned {
  /** The drafts this person may write, in the order they arrived. */
  allowed: Draft[];
  /** One entry per table held back, naming the permission and the count. */
  refused: Skipped[];
}

/**
 * Splits a plan's drafts into what may be written and what may not.
 *
 * `holds` is asked rather than a set passed, so the caller can hand this the
 * same check the rest of the application uses instead of a copy of it that
 * can drift.
 */
export function partitionByPermission(
  drafts: readonly Draft[],
  holds: (permission: WritePermission) => boolean,
): Partitioned {
  const allowed: Draft[] = [];
  const counts = new Map<string, number>();

  for (const draft of drafts) {
    const needed = writePermission(draft.table);
    if (needed && !holds(needed)) {
      counts.set(draft.table, (counts.get(draft.table) ?? 0) + 1);
      continue;
    }
    allowed.push(draft);
  }

  const refused: Skipped[] = [...counts].map(([table, count]) => {
    const needed = writePermission(table)!;
    return {
      sheet: heading(table),
      reason:
        `${count} ${count === 1 ? 'row was' : 'rows were'} read, but writing ${label(table)} needs ` +
        `the "${permissionName(needed)}" permission and your role does not have it. Everything ` +
        'else in the workbook was imported. Ask an administrator to grant it, or to upload this ' +
        'workbook themselves.',
    };
  });

  return { allowed, refused };
}

/**
 * The order an import writes its tables in.
 *
 * Financial rows first because every screen reads them: a failure part-way
 * then leaves a business with fewer records rather than with a broken set of
 * them.
 */
export const WRITE_ORDER = [
  'financial_records',
  'sales_records',
  'operational_records',
  'opportunities',
  'risks',
] as const;

/**
 * The order an undo removes them in — the reverse, derived rather than typed
 * out again.
 *
 * Two hand-written lists that must mirror each other stay mirrored until the
 * day somebody adds a table to one of them. Reversing the first is the only
 * version that cannot drift.
 *
 * Reverse because the same reasoning runs backwards: a failed undo should
 * leave the financial rows standing, not remove them and then fail on
 * something else.
 */
export const UNDO_ORDER = [...WRITE_ORDER].reverse() as readonly Draft['table'][];

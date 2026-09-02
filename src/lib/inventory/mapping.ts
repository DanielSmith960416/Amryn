import { STOCK_ACTIONS, type StockAction } from '@/lib/intelligence/inventory';
import type { Enums } from '@/types/database';

/**
 * Between the column and the label.
 *
 * The database stores `left_on_shelf`; the engine and the report say
 * "Left on Shelf". Two representations on purpose: the stored value is an
 * identifier that rules test against and must not move, and the label is
 * words an operator reads, which somebody will want to reword. Keeping them
 * apart means rewording is a change to this file and not a migration.
 */
export const ACTION_LABEL: Readonly<Record<Enums['stock_action'], StockAction>> = {
  pending_review: 'Pending Review',
  left_on_shelf: 'Left on Shelf',
  removed_from_shelf: 'Removed from Shelf',
  returned_to_supplier: 'Returned to Supplier',
  marked_down: 'Marked Down / Clearance',
  destroyed: 'Destroyed / Disposed',
};

export const ACTION_KEY: Readonly<Record<StockAction, Enums['stock_action']>> = {
  'Pending Review': 'pending_review',
  'Left on Shelf': 'left_on_shelf',
  'Removed from Shelf': 'removed_from_shelf',
  'Returned to Supplier': 'returned_to_supplier',
  'Marked Down / Clearance': 'marked_down',
  'Destroyed / Disposed': 'destroyed',
};

/**
 * What an importer found in a spreadsheet cell, as a stored action.
 *
 * Deliberately forgiving. A stocktaker types "removed", "Removed from shelf"
 * or "RETURNED TO SUPPLIER", and a column that only accepts one exact spelling
 * turns the first import into a wall of rejected rows. Anything unrecognised
 * is `pending_review`, which is the honest reading of a cell nobody can
 * interpret — the line still imports and a person decides what happened to it.
 */
export function actionFromText(value: string): Enums['stock_action'] {
  const text = value.trim().toLowerCase();
  if (text === '') return 'pending_review';

  const exact = STOCK_ACTIONS.find((label) => label.toLowerCase() === text);
  if (exact) return ACTION_KEY[exact];

  // The distinguishing word, in the order that avoids a wrong match:
  // "removed from shelf" and "left on shelf" both contain "shelf".
  if (text.includes('destroy') || text.includes('dispos')) return 'destroyed';
  if (text.includes('return') || text.includes('supplier')) return 'returned_to_supplier';
  if (text.includes('markdown') || text.includes('marked down') || text.includes('clearance')) {
    return 'marked_down';
  }
  if (text.includes('removed')) return 'removed_from_shelf';
  if (text.includes('left') || text.includes('on shelf')) return 'left_on_shelf';
  return 'pending_review';
}

/**
 * A date cell, as an ISO date.
 *
 * Spreadsheets produce four shapes and one of them is ambiguous. `2026-03-04`
 * is unambiguous; `04/03/2026` is the fourth of March in South Africa and the
 * third of April in the United States, and getting it backwards moves an
 * expiry by a month. So day-first is assumed — the deployment is South
 * African — and stated here rather than left for somebody to discover from a
 * batch that expired earlier than the report said.
 */
export function dateFromText(value: string): string | null {
  const text = value.trim();
  if (text === '') return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) return normalise(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slashed = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
  if (slashed) {
    const year = Number(slashed[3]);
    return normalise(
      // A two-digit year is this century. A stocktake's expiry dates are
      // near-future; reading "27" as 1927 would expire everything.
      year < 100 ? 2000 + year : year,
      Number(slashed[2]),
      Number(slashed[1]),
    );
  }

  // Excel sometimes writes a serial number when a cell was formatted as a
  // date and exported without formatting. Day 1 is 1900-01-01, and the
  // sheet's own leap-year bug means day 60 does not exist — offsetting from
  // 1899-12-30 reproduces what Excel displays.
  const serial = /^\d{5}$/.exec(text);
  if (serial) {
    const date = new Date(Date.UTC(1899, 11, 30) + Number(text) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function normalise(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects the 31st of a 30-day month rather than silently rolling it into
  // the next one, which would move an expiry date a day without saying so.
  if (date.getUTCMonth() !== month - 1) return null;
  return date.toISOString().slice(0, 10);
}

/** A money cell, in cents. Null where the cell is blank or not a number. */
export function centsFromText(value: string): number | null {
  const text = value.trim().replace(/[R$€£\s]/g, '').replace(/,/g, '');
  if (text === '') return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

/** A quantity cell. Zero where blank, because a counted-as-none line is data. */
export function quantityFromText(value: string): number | null {
  const text = value.trim().replace(/[\s,]/g, '');
  if (text === '') return 0;
  const qty = Number(text);
  if (!Number.isFinite(qty) || qty < 0) return null;
  return Math.round(qty);
}

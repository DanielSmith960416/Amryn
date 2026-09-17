/**
 * Reading a sheet that was laid out for a person, not for a machine.
 *
 * The importer this serves is fed real workbooks, and a real workbook does not
 * start with a header row. It starts with a title, a subtitle, a blank line,
 * and *then* a header — and it ends with a total, a blank line, and a couple of
 * bullet points somebody typed underneath. Between those, one sheet may hold
 * two unrelated tables stacked on top of each other, because that is what fits
 * on one printed page.
 *
 * Every function here exists because the demo workbook does one of those
 * things. None of it guesses at meaning: it finds where tables begin and end,
 * and turns text into numbers and dates. What a column *means* is decided in
 * plan.ts, where it can be read and argued with.
 */

export interface Block {
  /** The header row, trimmed. */
  header: string[];
  /** Data rows, each padded to the header's width. */
  rows: string[][];
  /** Which row of the sheet the header was on, for error messages. */
  headerRow: number;
}

/** Two cells is the least that can be a table; one is a heading or a note. */
const MIN_COLUMNS = 2;

/**
 * Every table in a sheet, in order.
 *
 * A header is a row of at least two non-empty cells whose *next* row also has
 * at least two. That second condition is what separates a header from a
 * two-word title: "Operations & Workforce" over a blank line is not a table,
 * and "Area | Current State | Target" over "Central store | …" is.
 *
 * A block ends at the first row that is blank, is narrower than the header, is
 * a total, or is prose. Everything after that is left alone — which is how the
 * bullet points under the inventory sheet stay out of the database.
 */
export function readBlocks(records: string[][]): Block[] {
  const blocks: Block[] = [];

  for (let i = 0; i < records.length; i += 1) {
    const candidate = trimmed(records[i] ?? []);
    if (filled(candidate) < MIN_COLUMNS) continue;

    const next = trimmed(records[i + 1] ?? []);
    if (filled(next) < MIN_COLUMNS) continue;
    // A row of numbers is data, not a heading for more data.
    if (candidate.every((cell) => cell === '' || toNumber(cell) !== null)) continue;

    const header = candidate;
    const rows: string[][] = [];

    let j = i + 1;
    for (; j < records.length; j += 1) {
      const row = trimmed(records[j] ?? []);
      if (filled(row) < MIN_COLUMNS) break;
      if (isTotal(row)) break;
      if (isNote(row)) break;
      rows.push(pad(row, header.length));
    }

    if (rows.length > 0) {
      blocks.push({ header, rows, headerRow: i });
      i = j - 1;
    }
  }

  return blocks;
}

/**
 * A total row, which is a restatement of rows already read.
 *
 * Importing one would double every figure it summarises, and it is not a
 * record of anything that happened — it is arithmetic about records. The
 * workbook writes them as "TOTAL" in the first column, sometimes with the
 * first cell empty and the rest filled.
 */
export function isTotal(row: string[]): boolean {
  const first = (row[0] ?? '').trim().toLowerCase();
  if (/^(total|totals|grand total|subtotal|sum)\b/.test(first)) return true;
  // "| | 1025000 | 640000" — a total with its label left out.
  return first === '' && filled(row) >= MIN_COLUMNS;
}

/**
 * Prose under a table: "Test signal: …", "• 46 SKUs have had no sale…",
 * "Additional stock signals:".
 *
 * Recognised by shape rather than by wording — one long cell, or a bullet —
 * because the wording is whatever the person writing the workbook chose.
 */
export function isNote(row: string[]): boolean {
  const cells = row.filter((cell) => cell.trim() !== '');
  if (cells.length === 0) return true;
  const first = cells[0]!.trim();
  if (/^[•*\-–—]/.test(first)) return true;
  return cells.length === 1 && first.length > 40;
}

/**
 * A number, or null when the cell does not hold one.
 *
 * Null rather than zero, and that distinction is the point: a blank cell and a
 * dash mean "not recorded", and recording them as 0 would be inventing a
 * measurement of nothing. Every caller here treats null as "leave it out".
 *
 * Handles what the workbook actually contains: plain numbers, thousands
 * separated by commas or by spaces, a currency prefix, a trailing percent, a
 * negative in brackets the way accountants write it, and an em dash for
 * nothing.
 */
export function toNumber(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const raw = text.trim();
  if (raw === '' || raw === '—' || raw === '–' || raw === '-' || raw === 'n/a') return null;

  const bracketed = /^\((.*)\)$/.exec(raw);
  const body = bracketed ? bracketed[1]! : raw;
  const percent = /%\s*$/.test(body);

  const cleaned = body
    .replace(/%/g, '')
    .replace(/[R$€£]/gi, '')
    .replace(/ /g, '')
    .replace(/(?<=\d)[ ,](?=\d)/g, '')
    .trim();

  if (cleaned === '' || !/^[+-]?\d*\.?\d+$/.test(cleaned)) return null;

  let value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  if (percent) value /= 100;
  if (bracketed) value = -value;
  return value;
}

/** Money as whole cents, rounded — the unit every amount column uses. */
export function toCents(text: string | null | undefined): number | null {
  const value = toNumber(text);
  return value === null ? null : Math.round(value * 100);
}

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

/**
 * A month column heading — "Sep 2026", "September 2026" — as the period it
 * covers.
 *
 * Returned as the first and last day, because that is what metric_values
 * stores and what makes two sheets about the same month line up.
 */
export function monthPeriod(
  label: string,
  fallbackYear?: number | null,
): { start: string; end: string } | null {
  const text = label.trim();

  /*
   * The year is optional, for the same reason it is optional in dayInYear:
   * a column headed "Apr" on a sheet whose title says 2026 is April 2026, and
   * a spreadsheet written for a person does not repeat the year twelve times
   * across a header row.
   *
   * This function used to require four digits. A real management pack was
   * imported with bare month headings, every column was refused, and the
   * sheet reported "no month could be read" — which was true of the pattern
   * and false about the sheet. Its twelve financial lines went nowhere and
   * the dashboard stayed at zero.
   *
   * Two digits are read as 20xx. A management workbook headed "Apr-26" means
   * 2026, and 1926 is not a year anybody is importing figures for.
   */
  const match = /([a-z]{3,9})\s*[-/ ]?\s*(\d{2,4})?/i.exec(text);
  if (!match) return null;

  const month = MONTHS.indexOf(match[1]!.slice(0, 3).toLowerCase());
  if (month < 0) return null;

  const stated = match[2];
  let year: number;
  if (stated === undefined) {
    // No year in the heading at all, so the sheet's own year decides. Without
    // one there is nothing to place this against, and a guess would file the
    // figures under a year nobody wrote down.
    if (fallbackYear === undefined || fallbackYear === null) return null;
    year = fallbackYear;
  } else if (stated.length === 2) {
    year = 2000 + Number(stated);
  } else {
    year = Number(stated);
  }

  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return { start: iso(start), end: iso(end) };
}

/**
 * A day cell written the way a spreadsheet shows it — "01-Sep", "1 Sep",
 * "2026-09-01".
 *
 * The year is usually missing, because the sheet's title already said it. It
 * is passed in rather than assumed: guessing the current year would file last
 * September's transactions under this one.
 */
export function dayInYear(label: string, year: number): string | null {
  const text = label.trim();

  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (full) return text;

  const dayMonth = /^(\d{1,2})\s*[-/ ]\s*([a-z]{3,9})$/i.exec(text);
  if (dayMonth) {
    const month = MONTHS.indexOf(dayMonth[2]!.slice(0, 3).toLowerCase());
    if (month < 0) return null;
    return dayOf(year, month, Number(dayMonth[1]));
  }

  const monthDay = /^([a-z]{3,9})\s*[-/ ]\s*(\d{1,2})$/i.exec(text);
  if (monthDay) {
    const month = MONTHS.indexOf(monthDay[1]!.slice(0, 3).toLowerCase());
    if (month < 0) return null;
    return dayOf(year, month, Number(monthDay[2]));
  }

  return null;
}

/** The year named anywhere in a sheet's title block, if one is. */
export function yearIn(text: string): number | null {
  const match = /\b(20\d{2})\b/.exec(text);
  return match ? Number(match[1]) : null;
}

function dayOf(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month, day));
  // Rejects 31 September rather than silently accepting 1 October.
  if (date.getUTCMonth() !== month) return null;
  return iso(date);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function trimmed(row: string[]): string[] {
  return row.map((cell) => (cell ?? '').trim());
}

function filled(row: string[]): number {
  return row.filter((cell) => cell !== '').length;
}

function pad(row: string[], width: number): string[] {
  const out = row.slice(0, width);
  while (out.length < width) out.push('');
  return out;
}

/**
 * The value under a header, by name.
 *
 * Matching is loose on purpose — case, spacing and punctuation vary between
 * one workbook and the next, and "Avg Basket" and "Average basket" are the
 * same column. It is not loose on *meaning*: a name either matches a heading
 * or it does not, and nothing is inferred from position.
 */
export function cell(block: Block, row: string[], ...names: string[]): string {
  for (const name of names) {
    const index = block.header.findIndex((heading) => same(heading, name));
    if (index >= 0) return row[index] ?? '';
  }
  return '';
}

export function hasColumn(block: Block, ...names: string[]): boolean {
  return names.some((name) => block.header.some((heading) => same(heading, name)));
}

function same(a: string, b: string): boolean {
  return normalise(a) === normalise(b);
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Reading an Excel workbook, because that is what a stocktake arrives as.
 *
 * The importer has always asked for CSV. Nobody counts stock in CSV. They
 * count it in Excel, and the file picker would not even let them choose the
 * file they had — which is the whole of the reported fault: not an error
 * message, an impossibility.
 *
 * ── written rather than installed, and this time the reasons are specific ──
 *
 * csv.ts made this argument once and it is stronger here, not weaker:
 *
 *   · The npm package everyone reaches for, `xlsx`, is pinned on the registry
 *     at a version with a published prototype-pollution advisory; its
 *     maintained releases are distributed from the vendor's own CDN, which a
 *     locked-down build cannot fetch.
 *   · The alternative, `exceljs`, is a writer as well as a reader and brings
 *     its own dependency tree for a job that is one direction only.
 *   · The worker is bundled and checked by scripts/check-worker-externals.mjs;
 *     every dependency added is a decision that script then has to be told
 *     about.
 *
 * Against which: a workbook is a ZIP of XML, we need four files out of it, and
 * the compression is in Node already. What follows is that, and its limits are
 * stated rather than discovered.
 *
 * ── what it reads, exactly ───────────────────────────────────────────────
 *
 * One sheet — the first, unless another is named. Cell values as the workbook
 * stored them, which for a formula is the result the spreadsheet program last
 * calculated and wrote down. Dates are recognised from the cell's format and
 * returned as text a person would recognise, because a stocktake's expiry
 * column is the one field the importer cannot do without and a bare 46387
 * helps nobody.
 *
 * It does not evaluate formulas, read charts, follow links to other workbooks,
 * or open the older binary .xls. The last of those is common enough to be
 * detected by name and refused with the remedy rather than a stack trace.
 */
import { ArchiveError, unzip } from './zip';
import { attribute, unescapeXml } from './xml';

export class SpreadsheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpreadsheetError';
  }
}

export interface Workbook {
  /** Every sheet, in the order the workbook shows them. */
  sheetNames: string[];
  /** Which one was read. */
  sheetRead: string;
  /** Rows of cells, already trimmed of wholly empty trailing rows. */
  records: string[][];
}

/** More than any stocktake, and a cheap way to refuse a file built to hurt. */
const MAX_ROWS = 200_000;
const MAX_COLUMNS = 1_024;

export function readWorkbook(bytes: Uint8Array, wanted?: string): Workbook {
  const files = open(bytes);

  const workbookXml = decode(files.get('xl/workbook.xml'));
  if (workbookXml === null) {
    throw new SpreadsheetError(
      'That file is a ZIP archive but not a spreadsheet. If it came out of Excel, open it and use Save As → Excel Workbook (.xlsx).',
    );
  }

  const sheets = listSheets(workbookXml);
  if (sheets.length === 0) throw new SpreadsheetError('That workbook has no sheets in it.');

  const chosen = wanted
    ? sheets.find((sheet) => sheet.name.toLowerCase() === wanted.trim().toLowerCase())
    : sheets[0];

  if (!chosen) {
    throw new SpreadsheetError(
      `That workbook has no sheet called "${wanted}". It has: ${sheets.map((s) => s.name).join(', ')}.`,
    );
  }

  const relations = readRelations(decode(files.get('xl/_rels/workbook.xml.rels')));
  const path = sheetPath(chosen, relations, files);
  const sheetXml = decode(files.get(path));

  if (sheetXml === null) {
    throw new SpreadsheetError(`That workbook names a sheet "${chosen.name}" that is not inside it.`);
  }

  return {
    sheetNames: sheets.map((sheet) => sheet.name),
    sheetRead: chosen.name,
    records: cells(
      sheetXml,
      sharedStrings(decode(files.get('xl/sharedStrings.xml'))),
      dateStyles(decode(files.get('xl/styles.xml'))),
      /date1904\s*=\s*"(1|true)"/i.test(workbookXml),
    ),
  };
}

/** True when the bytes are the older binary .xls, which this cannot read. */
export function isLegacyExcel(bytes: Uint8Array): boolean {
  // The OLE compound-document signature. Word .doc and PowerPoint .ppt of the
  // same era share it, which is fine: none of them is readable here either.
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return signature.every((byte, index) => bytes[index] === byte);
}

function open(bytes: Uint8Array): Map<string, Uint8Array> {
  if (isLegacyExcel(bytes)) {
    throw new SpreadsheetError(
      'That is the older Excel format (.xls). Open it in Excel and use Save As → Excel Workbook (.xlsx), or save it as CSV.',
    );
  }

  try {
    return unzip(bytes);
  } catch (error) {
    // The archive reader's messages are already written for a reader; this
    // only changes the type so callers have one thing to catch.
    throw new SpreadsheetError(
      error instanceof ArchiveError ? error.message : 'We could not open that file as a spreadsheet.',
    );
  }
}

// ── the four documents inside ───────────────────────────────────────────────

interface Sheet {
  name: string;
  relationId: string | null;
}

function listSheets(xml: string): Sheet[] {
  const sheets: Sheet[] = [];
  for (const match of xml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attributes = match[1] ?? '';
    const name = attribute(attributes, 'name');
    if (name === null) continue;
    sheets.push({ name: unescapeXml(name), relationId: attribute(attributes, 'r:id') });
  }
  return sheets;
}

function readRelations(xml: string | null): Map<string, string> {
  const relations = new Map<string, string>();
  if (xml === null) return relations;

  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attributes = match[1] ?? '';
    const id = attribute(attributes, 'Id');
    const target = attribute(attributes, 'Target');
    if (id !== null && target !== null) relations.set(id, unescapeXml(target));
  }
  return relations;
}

/**
 * Where the chosen sheet's XML lives.
 *
 * By relationship where the workbook gives one, because sheet order and file
 * name are not the same thing: a workbook whose first sheet was deleted and
 * recreated has "Sheet1" stored in sheet2.xml, and guessing from the position
 * would silently read the wrong sheet. The positional guess is the fallback
 * for files that omit the relationship, and it is a guess.
 */
function sheetPath(sheet: Sheet, relations: Map<string, string>, files: Map<string, Uint8Array>): string {
  const target = sheet.relationId ? relations.get(sheet.relationId) : undefined;

  if (target) {
    const path = target.startsWith('/')
      ? target.slice(1)
      : target.startsWith('xl/')
        ? target
        : `xl/${target}`;
    if (files.has(path)) return path;
  }

  return 'xl/worksheets/sheet1.xml';
}

function sharedStrings(xml: string | null): string[] {
  if (xml === null) return [];

  const strings: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) {
    const body = match[1];
    if (body === undefined) {
      strings.push('');
      continue;
    }
    // A string with formatting is split across <r><t> runs; the text is their
    // concatenation. <rPh> holds phonetic guides for Japanese and is not part
    // of the value, so it goes first.
    const withoutPhonetics = body.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    strings.push(textOf(withoutPhonetics));
  }
  return strings;
}

function textOf(xml: string): string {
  let out = '';
  for (const match of xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) {
    out += unescapeXml(match[1] ?? '');
  }
  return out;
}

// ── dates, which are the reason this file is longer than it looks ───────────

/**
 * The built-in number formats that mean "this is a date".
 *
 * A date in a spreadsheet is a number; only its format says otherwise. These
 * identifiers are fixed by the file format — 14 is the short date, 22 is date
 * and time — and a cell using one is a date however it was typed. Anything
 * from 164 upwards is defined by the workbook itself and is judged by its
 * format code instead.
 */
const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22,
  27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47,
  50, 51, 52, 53, 54, 55, 56, 57, 58,
]);

/**
 * Which style indexes are dates.
 *
 * A cell carries `s="4"`, which is an index into cellXfs, each entry of which
 * names a number format. Two lookups, so both are read once and flattened into
 * the one answer a cell needs.
 */
function dateStyles(xml: string | null): Set<number> {
  const dates = new Set<number>();
  if (xml === null) return dates;

  const custom = new Set<number>();
  for (const match of xml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const attributes = match[1] ?? '';
    const id = Number(attribute(attributes, 'numFmtId'));
    const code = attribute(attributes, 'formatCode');
    if (Number.isFinite(id) && code !== null && looksLikeADate(unescapeXml(code))) custom.add(id);
  }

  const section = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!section?.[1]) return dates;

  let index = 0;
  for (const match of section[1].matchAll(/<xf\b([^>]*?)(?:\/>|>)/g)) {
    const id = Number(attribute(match[1] ?? '', 'numFmtId'));
    if (Number.isFinite(id) && (BUILTIN_DATE_FORMATS.has(id) || custom.has(id))) dates.add(index);
    index += 1;
  }

  return dates;
}

/**
 * Whether a format code describes a date.
 *
 * The date parts are y, m, d, h and s, and they mean nothing inside quoted
 * literals, inside [colour] or [$-409] blocks, or after a backslash escape —
 * so those come out first. Without that, the perfectly ordinary currency
 * format `"R"#,##0.00` would be read as a date because it contains an "R"…
 * and, more to the point, `[Red]#,##0` contains a "d".
 */
function looksLikeADate(code: string): boolean {
  const bare = code
    .replace(/\\./g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '');
  return /[ymdhs]/i.test(bare);
}

/** A serial number, as text a person recognises. */
function fromSerial(serial: number, date1904: boolean): string {
  // Day 1 is the 1st of January 1900, and the format carries forward a
  // deliberate bug from Lotus 1-2-3: it believes 1900 was a leap year, so day
  // 60 is a date that never existed. Counting from the 30th of December 1899
  // reproduces what the spreadsheet displays, which is the only thing that
  // matters when the point is to read what somebody typed.
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const whole = Math.floor(serial);
  const fraction = serial - whole;

  const day = new Date(epoch + whole * 86_400_000);
  if (Number.isNaN(day.getTime())) return String(serial);

  const date = day.toISOString().slice(0, 10);
  if (fraction <= 0) return date;

  const seconds = Math.round(fraction * 86_400);
  const hh = String(Math.floor(seconds / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
  return `${date} ${hh}:${mm}`;
}

// ── the sheet ───────────────────────────────────────────────────────────────

/**
 * The grid, as rows of strings.
 *
 * Driven by each cell's own reference rather than by counting elements,
 * because a sheet omits empty cells and empty rows entirely: a row with
 * something in A and something in F stores two cells, and a reader that
 * counted would put the second value in column B. The reference is the truth.
 */
function cells(
  xml: string,
  strings: readonly string[],
  dates: ReadonlySet<number>,
  date1904: boolean,
): string[][] {
  const grid = new Map<number, string[]>();
  let lastRow = 0;

  for (const match of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attributes = match[1] ?? '';
    const body = match[2];

    const reference = attribute(attributes, 'r');
    const position = reference ? positionOf(reference) : null;
    if (!position) continue;
    if (position.row > MAX_ROWS || position.column >= MAX_COLUMNS) {
      throw new SpreadsheetError(
        'That sheet is larger than we can read here. Split it by site or by department.',
      );
    }

    const value = valueOf(body ?? '', attributes, strings, dates, date1904);
    if (value === '') continue;

    let row = grid.get(position.row);
    if (!row) {
      row = [];
      grid.set(position.row, row);
    }
    // The gaps this leaves are holes, not empty strings, so they are filled in
    // below rather than relied upon.
    row[position.column] = value;
    if (position.row > lastRow) lastRow = position.row;
  }

  const records: string[][] = [];
  for (let number = 1; number <= lastRow; number += 1) {
    const row = grid.get(number);
    if (!row) {
      // A blank row inside the data is kept, because it is a row the person
      // can see; parseCsv's own filter removes it downstream if it is empty.
      records.push([]);
      continue;
    }
    records.push(Array.from({ length: row.length }, (_, index) => row[index] ?? ''));
  }

  return records;
}

function valueOf(
  body: string,
  attributes: string,
  strings: readonly string[],
  dates: ReadonlySet<number>,
  date1904: boolean,
): string {
  const type = attribute(attributes, 't') ?? 'n';

  if (type === 'inlineStr') return textOf(body).trim();

  const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
  if (raw === undefined) return '';
  const value = unescapeXml(raw);

  if (type === 's') {
    const index = Number(value);
    return (Number.isInteger(index) ? strings[index] : undefined)?.trim() ?? '';
  }
  // 'str' is a formula that produced text; 'e' is a formula that produced an
  // error, and #N/A read as a product name would be worse than a blank.
  if (type === 'str') return value.trim();
  if (type === 'e') return '';
  if (type === 'b') return value === '1' ? 'TRUE' : 'FALSE';

  const style = Number(attribute(attributes, 's') ?? '');
  const number = Number(value);
  if (Number.isFinite(number) && Number.isInteger(style) && dates.has(style)) {
    return fromSerial(number, date1904);
  }

  return value.trim();
}

/** 'BC12' → row 12, column 54. */
function positionOf(reference: string): { row: number; column: number } | null {
  const match = /^([A-Za-z]+)(\d+)$/.exec(reference);
  if (!match?.[1] || !match[2]) return null;

  let column = 0;
  for (const letter of match[1].toUpperCase()) {
    column = column * 26 + (letter.charCodeAt(0) - 64);
  }

  return { row: Number(match[2]), column: column - 1 };
}

function decode(bytes: Uint8Array | undefined): string | null {
  return bytes === undefined ? null : new TextDecoder('utf-8').decode(bytes);
}

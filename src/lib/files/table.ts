/**
 * One way in for anything with rows and columns in it.
 *
 * The stocktake importer used to call parseCsv on file.text(), which is the
 * shortest correct thing to write and quietly decided that a stocktake must be
 * a CSV. It also decided how a mistake would present: a workbook read as text
 * is a page of ZIP bytes, so the first header comes back as mojibake and the
 * error a person sees is "we could not find a product name", which is true and
 * useless.
 *
 * This reads the file for what it is and says so when it cannot.
 */
import { tabulate, type ParsedCsv } from '@/lib/inventory/csv';
import { isLegacyExcel, readWorkbook, SpreadsheetError } from './xlsx';
import { extensionOf } from './kinds';

export { SpreadsheetError } from './xlsx';

export interface ReadTable extends ParsedCsv {
  /** Every sheet in the workbook, or empty for a CSV. */
  sheetNames: string[];
  /** The sheet these rows came from, or null for a CSV. */
  sheetRead: string | null;
}

/**
 * The file's rows, whatever the file is.
 *
 * Content decides, not the name. A file called `count.csv` that is really a
 * workbook is something people produce constantly — renaming an attachment is
 * easier than converting it — and trusting the extension would fail it with a
 * message about missing columns rather than reading it perfectly well.
 *
 * @throws SpreadsheetError with a sentence written for the person who chose
 *         the file, and a remedy wherever one exists.
 */
export function readTable(filename: string, bytes: Uint8Array): ReadTable {
  if (bytes.length === 0) {
    throw new SpreadsheetError('That file is empty.');
  }

  // 'PK' — every Office XML file and every ZIP begins with it.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const workbook = readWorkbook(bytes);
    return {
      ...tabulate(workbook.records),
      sheetNames: workbook.sheetNames,
      sheetRead: workbook.sheetRead,
    };
  }

  if (isLegacyExcel(bytes)) {
    throw new SpreadsheetError(
      'That is the older Excel format (.xls). Open it in Excel and use Save As → Excel Workbook (.xlsx), or save it as CSV.',
    );
  }

  const extension = extensionOf(filename);
  if (extension === '.xlsx' || extension === '.xlsm') {
    // Named as a workbook and not shaped like one. Almost always a CSV that
    // was renamed, so it is worth trying rather than refusing outright.
    const parsed = parseText(bytes);
    if (parsed.headers.length > 1) return { ...parsed, sheetNames: [], sheetRead: null };
    throw new SpreadsheetError(
      'That file is named as an Excel workbook but is not one. Open it and save it again as .xlsx or CSV.',
    );
  }

  return { ...parseText(bytes), sheetNames: [], sheetRead: null };
}

/**
 * Text, then rows.
 *
 * Split on whichever of comma, semicolon or tab the header row has most of.
 * A spreadsheet saved as CSV on a machine set to a comma-decimal locale — much
 * of Europe, and some South African installations — is semicolon-separated,
 * and reading it as commas produces exactly one column with the whole row in
 * it, which reports as a missing product name.
 */
function parseText(bytes: Uint8Array): ParsedCsv {
  const text = new TextDecoder('utf-8').decode(bytes);
  return tabulate(splitOn(text, dominantSeparator(text)));
}

function dominantSeparator(text: string): string {
  const firstLine = text.slice(0, 4096).split(/\r?\n/)[0] ?? '';
  const counts = [',', ';', '\t'].map((candidate) => ({
    candidate,
    count: firstLine.split(candidate).length - 1,
  }));
  counts.sort((a, b) => b.count - a.count);
  const best = counts[0];
  return best && best.count > 0 ? best.candidate : ',';
}

/**
 * Records, for a separator that may not be a comma.
 *
 * Same rules as csv.ts — quoted fields may hold the separator, newlines and
 * doubled quotes — expressed once against a parameter rather than copied per
 * separator.
 */
function splitOn(text: string, separator: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const char = text[i]!;

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
      i += 1;
      continue;
    }
    if (char === separator) {
      endField();
      i += 1;
      continue;
    }
    if (char === '\r') {
      endRecord();
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (char === '\n') {
      endRecord();
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  if (field !== '' || record.length > 0) endRecord();
  return records;
}

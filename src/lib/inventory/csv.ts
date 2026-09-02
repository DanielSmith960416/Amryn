/**
 * A CSV reader, because a stocktake arrives as a spreadsheet.
 *
 * Written rather than installed. The alternative is a dependency for what is
 * two hundred lines of well-specified behaviour, on a file this application
 * only ever reads — and a parser that lives here can be tested against the
 * things that actually break real imports, which are quoted commas, embedded
 * newlines, a byte-order mark from Excel, and the CRLF that Windows adds.
 *
 * RFC 4180, plus the two deviations every real file has: a trailing newline,
 * and lines that are shorter than the header when trailing cells were empty.
 */

export interface ParsedCsv {
  /** Lower-cased and trimmed, so the caller matches on meaning not on case. */
  headers: string[];
  /** One record per row, keyed by header. Missing trailing cells read ''. */
  rows: Record<string, string>[];
}

/**
 * Splits into fields, honouring quotes.
 *
 * A quoted field may contain commas, newlines and doubled quotes ("" is one
 * literal quote). Everything outside quotes is taken literally — including a
 * stray quote mid-field, which Excel emits and which a stricter parser would
 * reject on a file a human considers fine.
 */
function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;

  // Excel writes a byte-order mark, which otherwise becomes part of the first
  // header and makes it match nothing.
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
    if (char === ',') {
      endField();
      i += 1;
      continue;
    }
    if (char === '\r') {
      // CRLF and a lone CR both end the record.
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

  // A file that does not end in a newline still has a last record; one that
  // does must not produce an empty trailing one.
  if (field !== '' || record.length > 0) endRecord();

  return records;
}

export function parseCsv(text: string): ParsedCsv {
  const records = splitRecords(text).filter(
    // A row of nothing but empty cells is spacing, not data. Excel adds these
    // when somebody deletes content without deleting the row.
    (record) => record.some((cell) => cell.trim() !== ''),
  );

  const headerRow = records.shift();
  if (!headerRow) return { headers: [], rows: [] };

  const headers = headerRow.map((h) => h.trim().toLowerCase());

  const rows = records.map((record) => {
    const row: Record<string, string> = {};
    for (const [index, header] of headers.entries()) {
      if (header === '') continue;
      row[header] = (record[index] ?? '').trim();
    }
    return row;
  });

  return { headers, rows };
}

/**
 * The first header that matches, by any of its accepted spellings.
 *
 * Spreadsheets in the wild call the same column "Expiry", "Expiry Date",
 * "Exp. Date" and "Best Before". Insisting on one spelling means the first
 * thing a customer does with the importer is fail, so the importer knows the
 * common names and reports the ones it could not place.
 */
export function findHeader(
  headers: readonly string[],
  accepted: readonly string[],
): string | null {
  for (const name of accepted) {
    const found = headers.find((h) => h === name);
    if (found) return found;
  }
  // Then a looser pass: "expiry date (yyyy-mm-dd)" should still match
  // "expiry date". Prefix rather than substring, so "supplier name" does not
  // match a "name" column.
  for (const name of accepted) {
    const found = headers.find((h) => h.startsWith(name));
    if (found) return found;
  }
  return null;
}

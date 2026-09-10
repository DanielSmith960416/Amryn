import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { readWorkbook, isLegacyExcel, SpreadsheetError } from './xlsx';
import { unzip, ArchiveError } from './zip';
import { readTable } from './table';

/**
 * A real .xlsx, assembled here.
 *
 * Not a fixture file. A binary checked into the repository is a thing nobody
 * can read in a diff and nobody edits when the test needs a new case, and the
 * one property that matters — that this is genuinely what Excel writes, not
 * what the reader happens to accept — is better served by building the archive
 * from the format's own rules in front of the reader.
 */
function zip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(content);
    const deflated = new Uint8Array(deflateRawSync(raw));

    const local = new Uint8Array(30 + nameBytes.length + deflated.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 8, true); // deflate
    localView.setUint32(18, deflated.length, true);
    localView.setUint32(22, raw.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(deflated, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(10, 8, true);
    centralView.setUint32(20, deflated.length, true);
    centralView.setUint32(24, raw.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const directorySize = centrals.reduce((total, entry) => total + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centrals.length, true);
  endView.setUint16(10, centrals.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, end];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A workbook with one sheet, built from the pieces Excel actually writes. */
function workbook(options: {
  sheet: string;
  strings?: string[];
  styles?: string;
  sheetName?: string;
  date1904?: boolean;
}): Uint8Array {
  const name = options.sheetName ?? 'Sheet1';
  const shared = options.strings ?? [];

  return zip({
    '[Content_Types].xml': '<Types/>',
    'xl/workbook.xml':
      `<workbook><workbookPr${options.date1904 ? ' date1904="1"' : ''}/>` +
      `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml':
      `<sst count="${shared.length}">${shared.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`,
    'xl/styles.xml': options.styles ?? '<styleSheet><cellXfs count="1"><xf numFmtId="0"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${options.sheet}</sheetData></worksheet>`,
  });
}

describe('the archive reader', () => {
  it('gets the bytes back out', () => {
    const files = unzip(zip({ 'a.txt': 'hello', 'b/c.xml': '<x/>' }));
    expect(new TextDecoder().decode(files.get('a.txt'))).toBe('hello');
    expect(new TextDecoder().decode(files.get('b/c.xml'))).toBe('<x/>');
  });

  it('refuses something that is not an archive, rather than guessing', () => {
    expect(() => unzip(new TextEncoder().encode('just some text, quite long'))).toThrow(ArchiveError);
  });
});

describe('reading a sheet', () => {
  it('places cells by their reference, not by counting them', () => {
    // A and C are present, B is not. A reader that counted would put the
    // value from C into column B and shift every heading left of it.
    const sheet =
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>7</v></c></row>';

    const result = readTable('count.xlsx', workbook({ sheet, strings: ['Product', 'Qty', 'Panado'] }));

    expect(result.headers).toEqual(['product', '', 'qty']);
    expect(result.rows[0]).toEqual({ product: 'Panado', qty: '7' });
  });

  it('reads a date from its format rather than as a number', () => {
    // 46388 is the 1st of January 2027; numFmtId 14 is the short date. Without
    // the style lookup the expiry column arrives as five digits.
    const styles = '<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>';
    const sheet =
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
      '<row r="2"><c r="A2" s="1"><v>46388</v></c></row>';

    const result = readTable('c.xlsx', workbook({ sheet, strings: ['Expiry'], styles }));
    expect(result.rows[0]).toEqual({ expiry: '2027-01-01' });
  });

  it('does not mistake a currency format for a date', () => {
    // The bug this guards: [Red] contains a "d", and "R" is a literal. A
    // naive test on the format code turns every rand figure into 1970.
    const styles =
      '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="[Red]&quot;R&quot;#,##0.00"/></numFmts>' +
      '<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>';
    const sheet =
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
      '<row r="2"><c r="A2" s="1"><v>129.99</v></c></row>';

    const result = readTable('c.xlsx', workbook({ sheet, strings: ['Cost'], styles }));
    expect(result.rows[0]).toEqual({ cost: '129.99' });
  });

  it('joins the runs of a string that was formatted mid-cell', () => {
    const strings = '<sst><si><r><t>Pan</t></r><r><t>ado</t></r></si></sst>';
    const bytes = zip({
      'xl/workbook.xml': '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': strings,
      'xl/styles.xml': '<styleSheet><cellXfs><xf numFmtId="0"/></cellXfs></styleSheet>',
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
        '<row r="2"><c r="A2" t="inlineStr"><is><t>Disprin</t></is></c></row></sheetData></worksheet>',
    });

    const result = readTable('c.xlsx', bytes);
    expect(result.headers).toEqual(['panado']);
    expect(result.rows[0]).toEqual({ panado: 'Disprin' });
  });

  it('reads a formula as the value the spreadsheet last worked out', () => {
    const sheet =
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
      '<row r="2"><c r="A2"><f>2*3</f><v>6</v></c></row>';
    const result = readTable('c.xlsx', workbook({ sheet, strings: ['Total'] }));
    expect(result.rows[0]).toEqual({ total: '6' });
  });

  it('leaves a formula error blank rather than importing #N/A as a value', () => {
    const sheet =
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
      '<row r="2"><c r="A2" t="e"><v>#N/A</v></c></row>';
    const result = readTable('c.xlsx', workbook({ sheet, strings: ['Product'] }));
    expect(result.rows).toEqual([]);
  });

  it('follows the relationship to the sheet, not the file name', () => {
    // Sheet1 living in sheet3.xml is what a workbook looks like after a sheet
    // has been deleted and remade. Guessing sheet1.xml reads the wrong one.
    const bytes = zip({
      'xl/workbook.xml': '<workbook><sheets><sheet name="Count" sheetId="1" r:id="rId9"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId9" Target="worksheets/sheet3.xml"/></Relationships>',
      'xl/styles.xml': '<styleSheet><cellXfs><xf numFmtId="0"/></cellXfs></styleSheet>',
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>WRONG</t></is></c></row></sheetData></worksheet>',
      'xl/worksheets/sheet3.xml':
        '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Product</t></is></c></row>' +
        '<row r="2"><c r="A2" t="inlineStr"><is><t>Panado</t></is></c></row></sheetData></worksheet>',
    });

    const result = readTable('c.xlsx', bytes);
    expect(result.sheetRead).toBe('Count');
    expect(result.headers).toEqual(['product']);
  });

  it('unescapes what XML escaped', () => {
    const sheet =
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Notes &amp; remarks</t></is></c></row>' +
      '<row r="2"><c r="A2" t="inlineStr"><is><t>3 &lt; 5</t></is></c></row>';
    const result = readTable('c.xlsx', workbook({ sheet }));
    expect(result.headers).toEqual(['notes & remarks']);
    expect(result.rows[0]).toEqual({ 'notes & remarks': '3 < 5' });
  });
});

describe('files that are not workbooks', () => {
  it('names the older Excel format and gives the remedy', () => {
    const ole = new Uint8Array(64);
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(isLegacyExcel(ole)).toBe(true);
    expect(() => readTable('stock.xls', ole)).toThrow(/Save As/i);
  });

  it('says a ZIP that is not a workbook is not a workbook', () => {
    expect(() => readWorkbook(zip({ 'a.txt': 'hello' }))).toThrow(SpreadsheetError);
  });

  it('reads a CSV that somebody renamed to .xlsx', () => {
    // Renaming an attachment is easier than converting it, so people do. The
    // extension is a claim; the bytes are the fact.
    const csv = new TextEncoder().encode('Product,Qty\nPanado,4\n');
    const result = readTable('count.xlsx', csv);
    expect(result.rows[0]).toEqual({ product: 'Panado', qty: '4' });
  });

  it('reads a semicolon-separated export, which a comma reader sees as one column', () => {
    const csv = new TextEncoder().encode('Product;Qty;Expiry\nPanado;4;2027-01-01\n');
    const result = readTable('count.csv', csv);
    expect(result.headers).toEqual(['product', 'qty', 'expiry']);
    expect(result.rows[0]).toEqual({ product: 'Panado', qty: '4', expiry: '2027-01-01' });
  });

  it('still reads an ordinary comma CSV', () => {
    const csv = new TextEncoder().encode('Product,Qty\n"Panado, 500mg",4\n');
    const result = readTable('count.csv', csv);
    expect(result.rows[0]).toEqual({ product: 'Panado, 500mg', qty: '4' });
  });

  it('refuses an empty file plainly', () => {
    expect(() => readTable('count.csv', new Uint8Array(0))).toThrow(/empty/i);
  });
});

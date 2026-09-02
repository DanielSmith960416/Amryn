import { describe, expect, it } from 'vitest';
import { findHeader, parseCsv } from './csv';

/**
 * The cases here are the ones that break real imports, not the ones that make
 * a parser look complete. Every one of them comes out of a spreadsheet a
 * person actually produced: Excel's byte-order mark, its CRLF, a product name
 * with a comma in it, and a row somebody blanked without deleting.
 */
describe('parseCsv', () => {
  it('reads a plain file', () => {
    const { headers, rows } = parseCsv('Product,Qty\nAspirin,40\nIbuprofen,12\n');
    expect(headers).toEqual(['product', 'qty']);
    expect(rows).toEqual([
      { product: 'Aspirin', qty: '40' },
      { product: 'Ibuprofen', qty: '12' },
    ]);
  });

  it('lower-cases headers so the caller matches on meaning', () => {
    expect(parseCsv('Product Name,SKU\na,b').headers).toEqual(['product name', 'sku']);
  });

  it('keeps a comma inside a quoted field', () => {
    const { rows } = parseCsv('product,notes\n"Amoxicillin 500mg, 21s",fine\n');
    expect(rows[0]!.product).toBe('Amoxicillin 500mg, 21s');
    expect(rows[0]!.notes).toBe('fine');
  });

  it('keeps a newline inside a quoted field', () => {
    const { rows } = parseCsv('product,notes\nAspirin,"line one\nline two"\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.notes).toBe('line one\nline two');
  });

  it('reads a doubled quote as one literal quote', () => {
    const { rows } = parseCsv('product\n"6"" bandage"\n');
    expect(rows[0]!.product).toBe('6" bandage');
  });

  // Excel writes this, and it otherwise becomes part of the first header,
  // which then matches nothing and the import reports a missing column that
  // is plainly there on screen.
  it('strips the byte-order mark Excel writes', () => {
    const { headers } = parseCsv('﻿Product,Qty\na,1');
    expect(headers).toEqual(['product', 'qty']);
  });

  it('handles CRLF, and a lone CR', () => {
    expect(parseCsv('a,b\r\n1,2\r\n').rows).toEqual([{ a: '1', b: '2' }]);
    expect(parseCsv('a,b\r1,2\r').rows).toEqual([{ a: '1', b: '2' }]);
  });

  it('does not invent a trailing row for a trailing newline', () => {
    expect(parseCsv('a\n1\n').rows).toHaveLength(1);
    expect(parseCsv('a\n1').rows).toHaveLength(1);
  });

  it('drops a row somebody blanked without deleting', () => {
    expect(parseCsv('a,b\n1,2\n,\n3,4\n').rows).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('reads a short row as empty trailing cells rather than failing', () => {
    const { rows } = parseCsv('a,b,c\n1,2\n');
    expect(rows[0]).toEqual({ a: '1', b: '2', c: '' });
  });

  it('trims cells, because a spreadsheet pads them', () => {
    expect(parseCsv('a\n  spaced  \n').rows[0]!.a).toBe('spaced');
  });

  it('returns nothing for an empty file rather than throwing', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
    expect(parseCsv('\n\n')).toEqual({ headers: [], rows: [] });
  });
});

describe('findHeader', () => {
  const headers = ['product name', 'expiry date (yyyy-mm-dd)', 'supplier name', 'qty'];

  it('takes an exact match first', () => {
    expect(findHeader(headers, ['qty', 'quantity'])).toBe('qty');
  });

  it('falls back to a prefix, so a parenthetical note does not break it', () => {
    expect(findHeader(headers, ['expiry date', 'expiry'])).toBe('expiry date (yyyy-mm-dd)');
  });

  it('prefers the earlier accepted spelling', () => {
    expect(findHeader(['quantity', 'qty'], ['qty', 'quantity'])).toBe('qty');
  });

  // Prefix rather than substring, or "supplier name" answers a search for the
  // product's name column and every row imports under the wrong heading.
  it('does not match a column that merely contains the word', () => {
    expect(findHeader(headers, ['name'])).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(findHeader(headers, ['batch'])).toBeNull();
  });
});

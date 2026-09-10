import { describe, expect, it } from 'vitest';
import { COLUMNS, headingFor, REQUIRED_COLUMNS, templateCsv } from './columns';
import { findHeader, parseCsv } from './csv';

describe('the template', () => {
  const csv = templateCsv('2026-09-10');

  it('reads back through the importer that will receive it', () => {
    // The point of generating it from the same list: every heading the
    // template writes is one findHeader recognises. A template the importer
    // rejects is worse than no template — it looks like the official answer.
    const { headers } = parseCsv(csv);
    for (const [key, accepted] of Object.entries(COLUMNS)) {
      expect(findHeader(headers, accepted), key).not.toBeNull();
    }
  });

  it('shows a full row and a bare one, so the optional columns look optional', () => {
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(2);

    const [full, bare] = rows;
    expect(full?.['unit cost']).toBe('42.50');
    expect(bare?.['unit cost']).toBe('');
    for (const key of REQUIRED_COLUMNS) {
      expect(bare?.[COLUMNS[key][0]], key).not.toBe('');
    }
  });

  it('quotes a cell containing a comma rather than splitting the row', () => {
    const { rows } = parseCsv(csv);
    expect(rows[0]?.location).toBe('Aisle 3, shelf 2');
  });

  it('titles each heading the way a spreadsheet would', () => {
    expect(headingFor('productName')).toBe('Product Name');
    expect(headingFor('sku')).toBe('Sku');
  });
});

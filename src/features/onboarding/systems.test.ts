import { describe, expect, it } from 'vitest';
import { firstRepeatedName } from './systems';

/**
 * The failing case is the first one. It is what a real customer hit on the
 * live deployment: three attempts, three "We could not save those systems",
 * and the eight boxes emptied each time.
 */
describe('firstRepeatedName', () => {
  it('catches the same system named under two headings', () => {
    // Naming the accounting package and the spreadsheet the same thing is an
    // ordinary mistake, and the unique key does not include the category — so
    // Postgres rejected the whole batch and the step could never be completed.
    const repeat = firstRepeatedName([
      { category: 'accounting', name: 'Sage' },
      { category: 'spreadsheet', name: 'Sage' },
    ]);

    expect(repeat).toEqual({ name: 'Sage', category: 'spreadsheet', firstCategory: 'accounting' });
  });

  it('treats a difference of case as the same name', () => {
    // Stricter than the constraint on purpose: Postgres would take both, and
    // the result reads as a duplicate to everyone who sees it afterwards.
    expect(firstRepeatedName([
      { category: 'spreadsheet', name: 'Excel' },
      { category: 'database', name: 'excel' },
    ])?.name).toBe('excel');
  });

  it('ignores surrounding space, which the database also does not see', () => {
    expect(firstRepeatedName([
      { category: 'pos', name: 'Shopify' },
      { category: 'erp', name: '  Shopify  ' },
    ])).not.toBeNull();
  });

  it('allows distinct names, which is the ordinary case', () => {
    expect(
      firstRepeatedName([
        { category: 'accounting', name: 'Sage' },
        { category: 'pos', name: 'Shopify' },
        { category: 'crm', name: 'HubSpot' },
      ]),
    ).toBeNull();
  });

  it('does not treat several blanks as a repeat', () => {
    // Most of the eight boxes are left empty by design — the step says to name
    // only the systems you have. Empty is not a name, and reporting "“” is
    // named twice" would be worse than the bug it replaced.
    expect(
      firstRepeatedName([
        { category: 'accounting', name: '' },
        { category: 'pos', name: '   ' },
        { category: 'erp', name: '' },
      ]),
    ).toBeNull();
  });

  it('reports the first repeat when there are several', () => {
    const repeat = firstRepeatedName([
      { category: 'accounting', name: 'Xero' },
      { category: 'pos', name: 'Vend' },
      { category: 'erp', name: 'Xero' },
      { category: 'manual', name: 'Vend' },
    ]);

    expect(repeat?.name).toBe('Xero');
  });
});

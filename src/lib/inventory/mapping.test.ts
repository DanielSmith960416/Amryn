import { describe, expect, it } from 'vitest';
import { ACTION_KEY, ACTION_LABEL, actionFromText, centsFromText, dateFromText, quantityFromText } from './mapping';
import { STOCK_ACTIONS } from '@/lib/intelligence/inventory';

describe('the action mapping', () => {
  // Two representations of one thing, so the risk is that they drift. Asserted
  // both ways: every stored value has a label, and every label the engine
  // knows has a stored value.
  it('round-trips every action', () => {
    for (const label of STOCK_ACTIONS) {
      expect(ACTION_LABEL[ACTION_KEY[label]]).toBe(label);
    }
    for (const key of Object.keys(ACTION_LABEL) as (keyof typeof ACTION_LABEL)[]) {
      expect(ACTION_KEY[ACTION_LABEL[key]]).toBe(key);
    }
  });

  it('covers exactly the six the workbook defines', () => {
    expect(Object.keys(ACTION_LABEL)).toHaveLength(STOCK_ACTIONS.length);
  });
});

describe('actionFromText', () => {
  it('takes an exact label', () => {
    expect(actionFromText('Returned to Supplier')).toBe('returned_to_supplier');
  });

  it('ignores case and surrounding space', () => {
    expect(actionFromText('  left on shelf  ')).toBe('left_on_shelf');
  });

  // "removed from shelf" and "left on shelf" both contain "shelf", so the
  // order the words are tested in decides whether stock that was pulled reads
  // as stock that was left.
  it('does not confuse removed-from-shelf with left-on-shelf', () => {
    expect(actionFromText('Removed')).toBe('removed_from_shelf');
    expect(actionFromText('removed from shelf')).toBe('removed_from_shelf');
    expect(actionFromText('Left on shelf')).toBe('left_on_shelf');
  });

  it('reads the words a stocktaker actually writes', () => {
    expect(actionFromText('destroyed')).toBe('destroyed');
    expect(actionFromText('Disposed of')).toBe('destroyed');
    expect(actionFromText('returned')).toBe('returned_to_supplier');
    expect(actionFromText('clearance')).toBe('marked_down');
    expect(actionFromText('Marked down')).toBe('marked_down');
  });

  // A cell nobody can interpret still imports. Rejecting the row would lose a
  // counted line over a word.
  it('falls back to pending review rather than rejecting the row', () => {
    expect(actionFromText('')).toBe('pending_review');
    expect(actionFromText('ask Sipho')).toBe('pending_review');
  });
});

describe('dateFromText', () => {
  it('reads an ISO date', () => {
    expect(dateFromText('2026-03-04')).toBe('2026-03-04');
    expect(dateFromText('2026-3-4')).toBe('2026-03-04');
  });

  // The ambiguous one, and the reason it is written down: 04/03/2026 is the
  // fourth of March here and the third of April in the United States, and
  // getting it backwards moves an expiry by a month.
  it('reads a slashed date day-first, as South Africa writes them', () => {
    expect(dateFromText('04/03/2026')).toBe('2026-03-04');
    expect(dateFromText('4.3.2026')).toBe('2026-03-04');
    expect(dateFromText('04-03-2026')).toBe('2026-03-04');
  });

  it('reads a two-digit year as this century', () => {
    // A stocktake's expiry dates are near-future; 1927 would expire the lot.
    expect(dateFromText('04/03/27')).toBe('2027-03-04');
  });

  it('reads the serial number Excel writes when formatting is lost', () => {
    expect(dateFromText('45000')).toBe('2023-03-15');
  });

  // Rolling the 31st of a 30-day month into the 1st of the next would move an
  // expiry a day without saying so.
  it('refuses a day that does not exist rather than rolling it forward', () => {
    expect(dateFromText('31/04/2026')).toBeNull();
    expect(dateFromText('2026-02-30')).toBeNull();
  });

  it('returns null for a blank or unreadable cell', () => {
    expect(dateFromText('')).toBeNull();
    expect(dateFromText('   ')).toBeNull();
    expect(dateFromText('soon')).toBeNull();
  });
});

describe('centsFromText', () => {
  it('reads money as cents', () => {
    expect(centsFromText('12.50')).toBe(1250);
    expect(centsFromText('R 1,299.99')).toBe(129999);
    expect(centsFromText('0')).toBe(0);
  });

  it('returns null for blank or nonsense, so it does not read as free', () => {
    expect(centsFromText('')).toBeNull();
    expect(centsFromText('n/a')).toBeNull();
    expect(centsFromText('-5')).toBeNull();
  });
});

describe('quantityFromText', () => {
  it('reads a count', () => {
    expect(quantityFromText('40')).toBe(40);
    expect(quantityFromText('1 200')).toBe(1200);
  });

  // A line counted as none is data — the shelf was checked and was empty —
  // where an unreadable cell is not.
  it('reads blank as zero and nonsense as null', () => {
    expect(quantityFromText('')).toBe(0);
    expect(quantityFromText('some')).toBeNull();
    expect(quantityFromText('-3')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  cell,
  dayInYear,
  hasColumn,
  isNote,
  isTotal,
  monthPeriod,
  readBlocks,
  toCents,
  toNumber,
  yearIn,
} from './sheet';

/**
 * The shapes here are taken from the demo workbook rather than invented, so a
 * change that breaks a real sheet breaks a test.
 */
describe('readBlocks', () => {
  it('finds the table under a title block', () => {
    const blocks = readBlocks([
      ['Sales Intelligence — September 2026'],
      ['By unit / channel, ZAR'],
      [],
      ['Unit / Channel', 'Revenue', 'Transactions'],
      ['Kimberley Central', '338000', '1420'],
      ['Diamond Square', '271000', '1180'],
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.header).toEqual(['Unit / Channel', 'Revenue', 'Transactions']);
    expect(blocks[0]!.rows).toHaveLength(2);
    expect(blocks[0]!.headerRow).toBe(3);
  });

  /*
   * Operations & Workforce holds two unrelated tables stacked on one sheet,
   * because that is what fits on a printed page. Reading only the first would
   * silently drop half of it.
   */
  it('finds two tables stacked in one sheet', () => {
    const blocks = readBlocks([
      ['Operations & Workforce'],
      [],
      ['Area', 'Current State', 'Target / Note'],
      ['Central store', 'High traffic', 'Protect service levels'],
      ['Online', 'Fastest growth', 'Scale carefully'],
      [],
      ['KPI', 'Current', 'Target / Note'],
      ['Absenteeism', '4.8%', 'Target <3.5%'],
      ['Returns rate', '4.2%', 'Target <3.5%'],
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.header[0]).toBe('Area');
    expect(blocks[1]!.header[0]).toBe('KPI');
    expect(blocks[1]!.rows).toHaveLength(2);
  });

  it('stops at the total, which is arithmetic about rows already read', () => {
    const blocks = readBlocks([
      ['Category', 'Revenue'],
      ['Kitchen', '282000'],
      ['Storage', '176000'],
      ['TOTAL', '458000'],
      ['Other', '30000'],
    ]);

    expect(blocks[0]!.rows.map((r) => r[0])).toEqual(['Kitchen', 'Storage']);
  });

  it('stops at the notes somebody typed underneath', () => {
    const blocks = readBlocks([
      ['SKU', 'Qty'],
      ['KIT-001', '68'],
      [],
      ['Additional stock signals:'],
      ['• 46 SKUs have had no sale for 60+ days and that sentence is long'],
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.rows).toHaveLength(1);
  });

  it('does not mistake a row of numbers for a header', () => {
    const blocks = readBlocks([
      ['Revenue', '865000', '912000'],
      ['865000', '912000', '948000'],
      ['535000', '560000', '589000'],
    ]);
    expect(blocks[0]!.header[0]).toBe('Revenue');
  });

  it('returns nothing for a sheet that is all prose', () => {
    expect(readBlocks([['Amryn Demo Test Data Pack'], ['Synthetic organisation'], []])).toEqual([]);
  });
});

describe('isTotal', () => {
  it('catches the labelled and the unlabelled kind', () => {
    expect(isTotal(['TOTAL', '1025000'])).toBe(true);
    expect(isTotal(['Subtotal', '12'])).toBe(true);
    // The Product Category sheet writes its total with the label cell empty.
    expect(isTotal(['', '1025000', '640000'])).toBe(true);
    expect(isTotal(['Kitchen & cookware', '282000'])).toBe(false);
  });
});

describe('isNote', () => {
  it('catches a bullet and a long lone sentence', () => {
    expect(isNote(['• 12 SKUs are below reorder point'])).toBe(true);
    expect(isNote(['Test signal: Northside has the lowest margin of the three stores'])).toBe(true);
    expect(isNote(['Kitchen', '282000'])).toBe(false);
  });
});

describe('toNumber', () => {
  it('reads the plain cases', () => {
    expect(toNumber('1025000')).toBe(1025000);
    expect(toNumber('0.398')).toBe(0.398);
    expect(toNumber('-0.21')).toBe(-0.21);
  });

  it('reads money and separated thousands', () => {
    expect(toNumber('R 1 025 000')).toBe(1025000);
    expect(toNumber('1,025,000')).toBe(1025000);
    expect(toNumber('R1 250.50')).toBe(1250.5);
  });

  it('reads a percentage as a proportion', () => {
    expect(toNumber('4.8%')).toBe(0.048);
    expect(toNumber('18%')).toBe(0.18);
  });

  it('reads the accountant’s negative', () => {
    expect(toNumber('(19000)')).toBe(-19000);
  });

  /*
   * The distinction the whole importer rests on. A dash means "not recorded",
   * and recording it as zero would be inventing a measurement of nothing — the
   * marketing sheet has a dash for the print campaign's visits, and a zero
   * there would make its cost-per-visit infinite rather than unknown.
   */
  it('returns null for nothing, rather than zero', () => {
    for (const value of ['', '  ', '—', '–', '-', 'n/a', null, undefined]) {
      expect(toNumber(value), String(value)).toBeNull();
    }
  });

  it('returns null for text that merely contains a number', () => {
    expect(toNumber('28 days')).toBeNull();
    expect(toNumber('37 in Sep')).toBeNull();
    expect(toNumber('3x3=9/9')).toBeNull();
  });

  it('keeps a real zero', () => {
    expect(toNumber('0')).toBe(0);
    expect(toNumber('0%')).toBe(0);
  });
});

describe('toCents', () => {
  it('rounds to whole cents', () => {
    expect(toCents('1250.50')).toBe(125050);
    expect(toCents('1025000')).toBe(102500000);
    expect(toCents('0.005')).toBe(1);
    expect(toCents('—')).toBeNull();
  });
});

describe('monthPeriod', () => {
  it('turns a column heading into the month it covers', () => {
    expect(monthPeriod('Sep 2026')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(monthPeriod('September 2026')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(monthPeriod('Feb 2028')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });

  it('says nothing about a heading that is not a month', () => {
    expect(monthPeriod('Metric')).toBeNull();
    expect(monthPeriod('Revenue')).toBeNull();
    expect(monthPeriod('')).toBeNull();
  });
});

describe('dayInYear', () => {
  it('reads the way a spreadsheet shows a day', () => {
    expect(dayInYear('01-Sep', 2026)).toBe('2026-09-01');
    expect(dayInYear('1 Sep', 2026)).toBe('2026-09-01');
    expect(dayInYear('Sep-29', 2026)).toBe('2026-09-29');
    expect(dayInYear('2026-09-15', 2026)).toBe('2026-09-15');
  });

  /*
   * The year comes from the sheet's own title. Assuming the current year would
   * file last September's transactions under this one — which reads as a
   * catastrophic collapse in sales rather than as an import bug.
   */
  it('uses the year it is given', () => {
    expect(dayInYear('01-Sep', 2024)).toBe('2024-09-01');
  });

  it('refuses a day that does not exist rather than rolling into next month', () => {
    expect(dayInYear('31-Sep', 2026)).toBeNull();
    expect(dayInYear('30-Feb', 2026)).toBeNull();
  });

  it('says nothing about something that is not a date', () => {
    expect(dayInYear('Walk-in', 2026)).toBeNull();
    expect(dayInYear('', 2026)).toBeNull();
  });
});

describe('yearIn', () => {
  it('finds the year in a title', () => {
    expect(yearIn('Sales Transaction Sample — September 2026')).toBe(2026);
    expect(yearIn('Apr–Sep 2026, ZAR')).toBe(2026);
    expect(yearIn('Inventory / Stock Master')).toBeNull();
  });
});

describe('cell and hasColumn', () => {
  const block = {
    header: ['Unit / Channel', 'Revenue', 'Gross Margin', 'Avg Basket'],
    rows: [],
    headerRow: 3,
  };
  const row = ['Kimberley Central', '338000', '0.398', '238'];

  it('reads by name, ignoring case, spacing and punctuation', () => {
    expect(cell(block, row, 'Revenue')).toBe('338000');
    expect(cell(block, row, 'gross margin')).toBe('0.398');
    expect(cell(block, row, 'Unit/Channel')).toBe('Kimberley Central');
    expect(cell(block, row, 'avg  basket')).toBe('238');
  });

  it('takes the first name that matches, so a mapping can list alternatives', () => {
    expect(cell(block, row, 'Turnover', 'Revenue')).toBe('338000');
  });

  it('gives an empty string for a column that is not there', () => {
    expect(cell(block, row, 'Transactions')).toBe('');
    expect(hasColumn(block, 'Transactions')).toBe(false);
    expect(hasColumn(block, 'Revenue')).toBe(true);
  });
});

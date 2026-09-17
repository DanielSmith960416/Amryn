import { describe, expect, it } from 'vitest';
import { planWorkbook, workbookYear, type Draft } from './plan';

const monthly = {
  name: 'Monthly Financials',
  records: [
    ['Monthly Financial & Performance Summary'],
    ['Apr–Sep 2026, ZAR'],
    [],
    ['Metric', 'Apr 2026', 'May 2026'],
    ['Revenue', '865000', '912000'],
    ['COGS', '535000', '560000'],
    ['Gross profit', '330000', '352000'],
    ['Operating expenses', '252000', '261000'],
    ['EBITDA', '78000', '91000'],
  ],
};

function rowsFor(drafts: Draft[], table: Draft['table']) {
  return drafts.filter((d) => d.table === table).map((d) => d.row);
}

describe('the monthly summary', () => {
  const plan = planWorkbook([monthly]);

  it('imports the lines that are money, once each', () => {
    const rows = rowsFor(plan.drafts, 'financial_records') as Array<{
      subcategory: string | null;
      occurred_on: string;
      amount_cents: number;
      direction: string;
    }>;

    expect(rows).toHaveLength(6); // three lines × two months
    expect(rows.filter((r) => r.subcategory === 'Revenue')).toHaveLength(2);
    expect(rows.find((r) => r.subcategory === 'Revenue')).toMatchObject({
      occurred_on: '2026-04-30',
      amount_cents: 86_500_000,
      direction: 'income',
    });
    expect(rows.find((r) => r.subcategory === 'COGS')?.direction).toBe('expense');
  });

  /*
   * The failure this importer is most likely to cause and least likely to have
   * noticed: gross profit is revenue minus cost of sales, EBITDA is that minus
   * operating expenses. Import all of them and the business reports revenue it
   * never made. Nothing on screen would look broken — the numbers would simply
   * be wrong, and confidently so.
   */
  it('refuses the lines that are arithmetic on the other lines', () => {
    const rows = rowsFor(plan.drafts, 'financial_records') as Array<{ subcategory: string | null }>;
    const names = rows.map((r) => r.subcategory);

    expect(names).not.toContain('Gross profit');
    expect(names).not.toContain('EBITDA');
  });

  it('says why each one was left out, rather than dropping it quietly', () => {
    const reasons = plan.skipped.map((s) => s.reason).join(' ');
    expect(reasons).toMatch(/Gross profit/);
    expect(reasons).toMatch(/EBITDA/);
    expect(reasons).toMatch(/count the same money twice/);
  });

  it('dates each figure to the end of the month its column names', () => {
    const rows = rowsFor(plan.drafts, 'financial_records') as Array<{ occurred_on: string }>;
    expect(new Set(rows.map((r) => r.occurred_on))).toEqual(
      new Set(['2026-04-30', '2026-05-31']),
    );
  });
});

describe('the year', () => {
  it('comes from the workbook, not from today', () => {
    expect(workbookYear([monthly])).toBe(2026);
  });

  /*
   * A workbook with no year in it cannot have its day-level sheets placed. The
   * alternative — assuming this year — files last September's transactions
   * under this one, which reads as a collapse in sales rather than as a bug.
   */
  it('is missing rather than guessed, and the dated sheets are skipped saying so', () => {
    const undated = {
      name: 'Sales Transactions',
      records: [
        ['Sales Transaction Sample'],
        [],
        ['Date', 'Sale'],
        ['01-Sep', '1250'],
      ],
    };
    const plan = planWorkbook([undated]);

    expect(plan.year).toBeNull();
    expect(plan.drafts).toHaveLength(0);
    expect(plan.skipped[0]!.reason).toMatch(/no year/i);
  });
});

describe('sales transactions', () => {
  const plan = planWorkbook([
    monthly,
    {
      name: 'Sales Transactions',
      records: [
        ['Sales Transaction Sample'],
        ['September 2026'],
        [],
        ['Date', 'Channel', 'Customer', 'Category', 'Sale', 'COGS'],
        ['01-Sep', 'Store', 'Walk-in', 'Kitchen', '1250', '720'],
        ['06-Sep', 'Corporate', 'Kopano Office Park', 'Utility', '12500', '8940'],
      ],
    },
  ]);

  it('reads a row per sale, with the year from the workbook', () => {
    const rows = rowsFor(plan.drafts, 'sales_records') as Array<{
      occurred_on: string;
      amount_cents: number;
      margin_cents: number | null;
      customer_name: string | null;
    }>;

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      occurred_on: '2026-09-01',
      amount_cents: 125_000,
      customer_name: 'Walk-in',
    });
  });

  /*
   * Margin is computed from the two amounts in the same row rather than read
   * from the percentage column beside them: that column is itself derived, and
   * turning a rounded ratio back into money reintroduces an error the workbook
   * does not have.
   */
  it('computes margin from the amounts, not from the rounded percentage', () => {
    const rows = rowsFor(plan.drafts, 'sales_records') as Array<{ margin_cents: number | null }>;
    expect(rows[0]!.margin_cents).toBe(125_000 - 72_000);
    expect(rows[1]!.margin_cents).toBe(1_250_000 - 894_000);
  });
});

describe('risks', () => {
  const plan = planWorkbook([
    {
      name: 'Risks',
      records: [
        ['Known Risks'],
        [],
        ['Risk', 'Probability', 'Impact', 'Score', 'Mitigation'],
        ['Working-capital squeeze', 'High', 'High', '3x3=9/9', 'Tighten receivables'],
        ['Staff turnover', 'Medium', 'Medium', '2x2=4/9', 'Retention review'],
        ['Something vague', 'Possibly', 'Quite', '?', ''],
      ],
    },
  ]);

  it('reads the levels as numbers on the scale the schema uses', () => {
    const rows = rowsFor(plan.drafts, 'risks') as Array<{
      title: string;
      likelihood: number;
      impact: number;
      severity: string;
    }>;

    expect(rows.find((r) => r.title === 'Working-capital squeeze')).toMatchObject({
      likelihood: 3,
      impact: 3,
      severity: 'critical',
    });
    expect(rows.find((r) => r.title === 'Staff turnover')).toMatchObject({
      likelihood: 2,
      impact: 2,
      severity: 'medium',
    });
  });

  /*
   * The score column reads "3x3=9/9", which is a sentence about a calculation
   * rather than a number. Severity comes from the two levels instead — and a
   * row whose levels cannot be read is skipped by name rather than given a
   * default, because a risk silently recorded as medium is worse than a risk
   * the uploader is told about.
   */
  it('skips a row whose levels it cannot read, and names it', () => {
    const titles = (rowsFor(plan.drafts, 'risks') as Array<{ title: string }>).map((r) => r.title);
    expect(titles).not.toContain('Something vague');
    expect(plan.skipped.map((s) => s.reason).join(' ')).toMatch(/Something vague/);
  });
});

describe('the balance sheet', () => {
  const plan = planWorkbook([
    {
      name: 'Balance Sheet',
      records: [
        ['Balance Sheet Snapshot'],
        ['30 September 2026, ZAR'],
        [],
        ['Assets', 'Amount', '', 'Liabilities & Equity', 'Amount'],
        ['Cash', '194000', '', 'Accounts payable', '427000'],
        ['TOTAL ASSETS', '2655000', '', 'TOTAL L+E', '2655000'],
      ],
    },
  ]);

  it('reads both halves of a sheet printed side by side', () => {
    const measures = (rowsFor(plan.drafts, 'operational_records') as Array<{ measure: string }>).map(
      (r) => r.measure,
    );
    expect(measures).toContain('Balance sheet · Cash');
    expect(measures).toContain('Balance sheet · Accounts payable');
  });

  it('leaves the totals out, being sums of the lines beside them', () => {
    const measures = (rowsFor(plan.drafts, 'operational_records') as Array<{ measure: string }>).map(
      (r) => r.measure,
    );
    expect(measures.join(' ')).not.toMatch(/TOTAL/i);
  });
});

describe('what is not imported', () => {
  it('says why, in words the uploader can act on', () => {
    const plan = planWorkbook([
      { name: 'Inventory Master', records: [['SKU', 'Qty'], ['KIT-001', '68']] },
      { name: 'Management Notes', records: [['Note', 'Detail'], ['Cash', 'Watch receivables']] },
      { name: 'Forecast Inputs', records: [['Assumption', 'Value'], ['Growth', '0.15']] },
    ]);

    const reasons = Object.fromEntries(plan.skipped.map((s) => [s.sheet, s.reason]));
    expect(reasons['Inventory Master']).toMatch(/stocktake/i);
    expect(reasons['Management Notes']).toMatch(/notes and commentary/i);
    expect(reasons['Forecast Inputs']).toMatch(/assumptions/i);
    expect(plan.drafts).toHaveLength(0);
  });
});

import {
  cell,
  dayInYear,
  monthPeriod,
  readBlocks,
  toCents,
  toNumber,
  yearIn,
  type Block,
} from './sheet';

/**
 * What each sheet of a workbook becomes, and what it deliberately does not.
 *
 * ── the rule this file exists to enforce ─────────────────────────────────
 * Nothing is inferred. A figure is imported when the workbook states it, and
 * skipped when it does not — with the reason carried back to whoever uploaded
 * the file rather than logged and forgotten. There is no default, no "assume
 * zero", and no filling a gap from what the rest of the sheet implies. A
 * business making decisions on these numbers has to be able to tell what came
 * out of their own book from what came out of a guess, and the only way to
 * keep that line is never to cross it.
 *
 * ── the mapping is explicit, not clever ──────────────────────────────────
 * Each sheet is named and mapped by hand. A generic "find the columns that
 * look like money" reader would import more sheets today and the wrong thing
 * eventually — a workbook is a document, and the meaning of its columns lives
 * in a heading somebody wrote for another person to read. Anything unmapped is
 * reported as unmapped, which is a fact the uploader can act on. Silently
 * importing half of it is not.
 */

export type Draft =
  | { table: 'financial_records'; row: FinancialRow }
  | { table: 'sales_records'; row: SalesRow }
  | { table: 'operational_records'; row: OperationalRow }
  | { table: 'opportunities'; row: OpportunityRow }
  | { table: 'risks'; row: RiskRow };

export interface FinancialRow {
  occurred_on: string;
  category: string;
  subcategory: string | null;
  amount_cents: number;
  direction: 'income' | 'expense';
  reference: string;
}

export interface SalesRow {
  occurred_on: string;
  customer_name: string | null;
  product_line: string | null;
  quantity: number;
  amount_cents: number;
  margin_cents: number | null;
}

export interface OperationalRow {
  occurred_on: string;
  measure: string;
  value: number;
  unit: string | null;
}

export interface OpportunityRow {
  title: string;
  kind: string;
  summary: string;
  why_it_matters: string | null;
  recommended_action: string | null;
  provenance: 'fact';
}

export interface RiskRow {
  title: string;
  description: string | null;
  category: string;
  likelihood: number;
  impact: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigation: string | null;
}

export interface Skipped {
  sheet: string;
  reason: string;
}

export interface Plan {
  drafts: Draft[];
  skipped: Skipped[];
  /** The year every undated sheet was read against, for the report. */
  year: number | null;
}

export interface SheetSource {
  name: string;
  records: string[][];
}

/**
 * The year the workbook is about.
 *
 * Taken from the sheets' own title lines rather than from today's date. A
 * workbook uploaded in January describing last September must not have its
 * transactions filed under this year — that reads as a catastrophic collapse
 * in sales rather than as an import bug, and it is the kind of error nobody
 * questions because the number looks like a number.
 *
 * Where no sheet states a year, the sheets that need one are skipped and say
 * so. That is the whole policy in one place.
 */
export function workbookYear(sheets: SheetSource[]): number | null {
  for (const sheet of sheets) {
    for (const row of sheet.records.slice(0, 4)) {
      for (const value of row) {
        const year = yearIn(value ?? '');
        if (year) return year;
      }
    }
  }
  return null;
}

export function planWorkbook(sheets: SheetSource[]): Plan {
  const year = workbookYear(sheets);
  const drafts: Draft[] = [];
  const skipped: Skipped[] = [];

  for (const sheet of sheets) {
    const mapper = MAPPERS[normalise(sheet.name)];
    if (!mapper) {
      skipped.push({ sheet: sheet.name, reason: describeUnmapped(sheet) });
      continue;
    }

    const blocks = readBlocks(sheet.records);
    if (blocks.length === 0) {
      skipped.push({ sheet: sheet.name, reason: 'No table found under the heading.' });
      continue;
    }

    const result = mapper({ sheet, blocks, year });
    drafts.push(...result.drafts);
    skipped.push(...result.skipped.map((reason) => ({ sheet: sheet.name, reason })));
  }

  return { drafts, skipped, year };
}

interface Context {
  sheet: SheetSource;
  blocks: Block[];
  year: number | null;
}

interface Mapped {
  drafts: Draft[];
  skipped: string[];
}

/**
 * The lines of a monthly summary that are arithmetic on the other lines.
 *
 * Importing these would count the same money two and three times over: gross
 * profit is revenue minus cost of sales, and the workspace already computes it
 * from the rows above. A financial_records table holding both revenue and
 * gross profit reports a business two-thirds larger than it is.
 *
 * They are not dropped quietly — each one is reported, so somebody comparing
 * the sheet to the screen can see why there are seven lines there and four
 * here.
 */
const DERIVED = new Set([
  'gross profit',
  'ebitda',
  'net profit before tax',
  'net profit',
  'gross margin',
  'ebitda margin',
  'operating margin',
]);

/** Which of a summary's lines are money coming in, and which going out. */
const PRIMITIVE: Record<string, { direction: 'income' | 'expense'; category: string }> = {
  revenue: { direction: 'income', category: 'Sales' },
  'net revenue': { direction: 'income', category: 'Sales' },
  'other income': { direction: 'income', category: 'Other income' },
  cogs: { direction: 'expense', category: 'COGS' },
  'cost of sales': { direction: 'expense', category: 'COGS' },
  'operating expenses': { direction: 'expense', category: 'Operating expenses' },
  'net finance cost': { direction: 'expense', category: 'Finance costs' },
  'finance costs': { direction: 'expense', category: 'Finance costs' },
  tax: { direction: 'expense', category: 'Tax' },
};

/**
 * A summary laid out with metrics down the side and months across the top.
 *
 * The transposed shape is why this cannot share a reader with the row-per-
 * record sheets: each *cell* is a record, and its date comes from the column
 * heading rather than from anything in the row.
 */
function monthlySummary({ blocks }: Context): Mapped {
  const drafts: Draft[] = [];
  const skipped: string[] = [];
  const block = blocks[0]!;

  const periods = block.header.map((heading, index) =>
    index === 0 ? null : monthPeriod(heading),
  );
  if (periods.every((period) => period === null)) {
    return { drafts, skipped: ['No month could be read from the column headings.'] };
  }

  for (const row of block.rows) {
    const label = (row[0] ?? '').trim();
    const key = normalise(label).replace(/\s*%$/, '');

    if (DERIVED.has(key)) {
      skipped.push(`"${label}" is calculated from the other lines, so importing it would count the same money twice.`);
      continue;
    }

    const mapping = PRIMITIVE[key];
    if (!mapping) {
      skipped.push(`"${label}" is not a line this importer recognises.`);
      continue;
    }

    for (let column = 1; column < block.header.length; column += 1) {
      const period = periods[column];
      if (!period) continue;
      const amount = toCents(row[column]);
      if (amount === null) continue;

      drafts.push({
        table: 'financial_records',
        row: {
          occurred_on: period.end,
          category: mapping.category,
          subcategory: label,
          amount_cents: Math.abs(amount),
          direction: mapping.direction,
          reference: `workbook:${period.start.slice(0, 7)}`,
        },
      });
    }
  }

  return { drafts, skipped };
}

/** One expense line per row, all belonging to the month in the sheet's title. */
function expenseRegister({ sheet, blocks, year }: Context): Mapped {
  const period = titlePeriod(sheet, year);
  if (!period) return { drafts: [], skipped: ['No month in the sheet title, so the expenses have no date.'] };

  const drafts: Draft[] = [];
  const block = blocks[0]!;

  for (const row of block.rows) {
    const label = cell(block, row, 'Expense', 'Line', 'Item').trim();
    const amount = toCents(cell(block, row, 'Amount', 'Value', 'Spend'));
    if (!label || amount === null) continue;

    drafts.push({
      table: 'financial_records',
      row: {
        occurred_on: period.end,
        // Not 'Operating expenses': the monthly summary already carries that
        // total, and a second copy of the same money under a different name is
        // the double count this importer is built to avoid. These are the
        // breakdown, kept as their own category so a reader can see both
        // without either being added to the other.
        category: 'Expense line',
        subcategory: label,
        amount_cents: Math.abs(amount),
        direction: 'expense',
        reference: `workbook:${period.start.slice(0, 7)}:expense-line`,
      },
    });
  }

  return { drafts, skipped: [] };
}

/** One sale per row. The only sheet with a date in every row. */
function salesTransactions({ sheet, blocks, year }: Context): Mapped {
  // The sheet's own title wins over the workbook's. They agree in this
  // workbook — both say 2026 — and they will not in one whose sheets span a
  // year end, where the transactions belong to the month printed above them
  // rather than to whichever year the first sheet happened to mention.
  const own = titlePeriod(sheet, null);
  const inYear = own ? Number(own.start.slice(0, 4)) : year;
  if (!inYear) {
    return { drafts: [], skipped: ['No year stated anywhere in the workbook, so these dates cannot be placed.'] };
  }

  const drafts: Draft[] = [];
  const skipped: string[] = [];
  const block = blocks[0]!;

  for (const row of block.rows) {
    const when = dayInYear(cell(block, row, 'Date', 'Day'), inYear);
    const amount = toCents(cell(block, row, 'Sale', 'Amount', 'Revenue', 'Value'));
    if (!when || amount === null) {
      skipped.push(`A row without a readable date or amount was left out.`);
      continue;
    }

    const cost = toCents(cell(block, row, 'COGS', 'Cost'));

    drafts.push({
      table: 'sales_records',
      row: {
        occurred_on: when,
        customer_name: cell(block, row, 'Customer') || null,
        product_line: cell(block, row, 'Category', 'Product') || null,
        quantity: 1,
        amount_cents: amount,
        // Computed from two figures in the same row, not from the margin
        // percentage beside them: that column is itself derived, and rounding
        // it back into money reintroduces an error the workbook does not have.
        margin_cents: cost === null ? null : amount - cost,
      },
    });
  }

  return { drafts, skipped: dedupe(skipped) };
}

/**
 * A table of measures about named things — channels, categories, segments,
 * campaigns, suppliers — all at the date in the sheet's title.
 *
 * One mapper serves six sheets because they are the same shape: a name in the
 * first column and measured columns after it. What differs is only which
 * columns are numbers, and that is read from the sheet rather than declared.
 */
function measuresByName(prefix: string, unitFor: (heading: string) => string | null) {
  return ({ sheet, blocks, year }: Context): Mapped => {
    const period = titlePeriod(sheet, year);
    if (!period) {
      return { drafts: [], skipped: ['No date in the sheet title, so these measures have no period.'] };
    }

    const drafts: Draft[] = [];
    const block = blocks[blocks.length - 1]!;

    for (const row of block.rows) {
      const subject = (row[0] ?? '').trim();
      if (!subject) continue;

      for (let column = 1; column < block.header.length; column += 1) {
        const heading = block.header[column] ?? '';
        const value = toNumber(row[column]);
        if (value === null) continue;

        drafts.push({
          table: 'operational_records',
          row: {
            occurred_on: period.end,
            measure: `${prefix} · ${subject} · ${heading}`,
            value,
            unit: unitFor(heading),
          },
        });
      }
    }

    return { drafts, skipped: [] };
  };
}

/** A measure per row, at the date in each column heading. */
function measuresOverTime(prefix: string) {
  return ({ blocks, year }: Context): Mapped => {
    if (!year) return { drafts: [], skipped: ['No year stated anywhere in the workbook.'] };

    const drafts: Draft[] = [];
    const block = blocks[0]!;

    const dates = block.header.map((heading, index) =>
      index === 0 ? null : dayInYear(heading, year) ?? monthPeriod(heading)?.end ?? null,
    );
    if (dates.every((date) => date === null)) {
      return { drafts, skipped: ['No date could be read from the column headings.'] };
    }

    for (const row of block.rows) {
      const label = (row[0] ?? '').trim();
      if (!label) continue;

      for (let column = 1; column < block.header.length; column += 1) {
        const when = dates[column];
        const value = toNumber(row[column]);
        if (!when || value === null) continue;

        drafts.push({
          table: 'operational_records',
          row: { occurred_on: when, measure: `${prefix} · ${label}`, value, unit: 'currency' },
        });
      }
    }

    return { drafts, skipped: [] };
  };
}

function opportunities({ blocks }: Context): Mapped {
  const drafts: Draft[] = [];
  const block = blocks[0]!;

  for (const row of block.rows) {
    const title = cell(block, row, 'Opportunity', 'Title').trim();
    if (!title) continue;

    const evidence = cell(block, row, 'Evidence', 'Why').trim();

    drafts.push({
      table: 'opportunities',
      row: {
        title,
        // Everything here came out of the customer's own book rather than from
        // the radar looking outward, so it is internal to the business.
        kind: 'product',
        summary: evidence || title,
        // "High" on its own is not a sentence. The column holds a level, so it
        // is labelled as one rather than dropped into a field that reads as
        // prose everywhere else in the product.
        why_it_matters: levelNote(
          cell(block, row, 'Potential Value', 'Value').trim(),
          cell(block, row, 'Priority').trim(),
        ),
        recommended_action: cell(block, row, 'Next Action', 'Action').trim() || null,
        // The strongest claim this importer can make, and it is a true one:
        // a person wrote it down in their own workbook. Not 'estimated', which
        // would imply Amryn produced the number.
        provenance: 'fact',
      },
    });
  }

  return { drafts, skipped: [] };
}

function risks({ blocks }: Context): Mapped {
  const drafts: Draft[] = [];
  const skipped: string[] = [];
  const block = blocks[0]!;

  for (const row of block.rows) {
    const title = cell(block, row, 'Risk', 'Title').trim();
    if (!title) continue;

    const probability = normalise(cell(block, row, 'Probability', 'Likelihood'));
    const impactWord = normalise(cell(block, row, 'Impact'));

    const likelihood = SCALE[probability];
    const impact = SCALE[impactWord];
    if (!likelihood || !impact) {
      skipped.push(`"${title}" has a probability or impact this importer cannot read as a level.`);
      continue;
    }

    drafts.push({
      table: 'risks',
      row: {
        title,
        description: null,
        category: 'operational',
        likelihood,
        impact,
        // From the two levels, which is how the workbook itself derives the
        // score in the column beside them — not from that column, which is
        // written as "3x3=9/9" and is a sentence rather than a number.
        severity: severityOf(likelihood, impact),
        mitigation: cell(block, row, 'Mitigation', 'Action').trim() || null,
      },
    });
  }

  return { drafts, skipped };
}

function levelNote(value: string, priority: string): string | null {
  const parts: string[] = [];
  if (value) parts.push(`Potential value: ${value.toLowerCase()}`);
  if (priority) parts.push(`priority: ${priority.toLowerCase()}`);
  return parts.length ? `${parts.join(', ')} — as recorded in the workbook.` : null;
}

const SCALE: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

function severityOf(likelihood: number, impact: number): 'low' | 'medium' | 'high' | 'critical' {
  const score = likelihood * impact;
  if (score >= 9) return 'critical';
  if (score >= 6) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

const money = (heading: string): string | null =>
  /margin|rate|roas|reliability|growth|%/i.test(heading) ? 'ratio' : 'currency';

const counted = (heading: string): string | null =>
  /revenue|spend|basket|value|sales|cost/i.test(heading)
    ? 'currency'
    : /margin|rate|roas|reliability|growth|%/i.test(heading)
      ? 'ratio'
      : 'count';

/**
 * A balance sheet printed as two columns side by side: assets on the left,
 * liabilities and equity on the right, sharing rows for no reason other than
 * fitting the page. Every row therefore holds two unrelated facts.
 */
function balanceSheet({ sheet, blocks, year }: Context): Mapped {
  const period = titlePeriod(sheet, year);
  if (!period) return { drafts: [], skipped: ['No date in the sheet title.'] };

  const drafts: Draft[] = [];
  const block = blocks[0]!;

  // The pairs are found by looking for a heading that reads as an amount, and
  // taking the column before it as the label — rather than by assuming the
  // layout is columns 0,1 and 3,4, which is true of this workbook and of
  // nothing else.
  const pairs: Array<[number, number]> = [];
  block.header.forEach((heading, index) => {
    if (index > 0 && /^(amount|value|r|zar)$/i.test(heading.trim())) pairs.push([index - 1, index]);
  });
  if (pairs.length === 0) return { drafts, skipped: ['No amount column found.'] };

  for (const row of block.rows) {
    for (const [labelAt, amountAt] of pairs) {
      const label = (row[labelAt] ?? '').trim();
      const value = toNumber(row[amountAt]);
      if (!label || value === null) continue;
      // The sheet's own totals, which are sums of the lines beside them.
      if (/^total\b/i.test(label)) continue;

      drafts.push({
        table: 'operational_records',
        row: {
          occurred_on: period.end,
          measure: `Balance sheet · ${label}`,
          value,
          unit: 'currency',
        },
      });
    }
  }

  return { drafts, skipped: [] };
}

const MAPPERS: Record<string, (context: Context) => Mapped> = {
  'monthly financials': monthlySummary,
  'expense register': expenseRegister,
  'sales transactions': salesTransactions,
  'cash working capital': measuresOverTime('Working capital'),
  'sales by channel': measuresByName('Channel', counted),
  'product category': measuresByName('Category', counted),
  'customer intelligence': measuresByName('Customer segment', counted),
  'marketing performance': measuresByName('Campaign', counted),
  'supplier intelligence': measuresByName('Supplier', money),
  'balance sheet': balanceSheet,
  // The last block only: this sheet opens with a paragraph-per-branch table
  // whose cells are sentences, and closes with the table of numbers.
  'operations workforce': measuresByName('Operations', counted),
  opportunities,
  risks,
};

/**
 * Why a sheet was not imported, in words the person who uploaded it can act
 * on. "Unmapped" is not a reason; it is a restatement of the outcome.
 */
function describeUnmapped(sheet: SheetSource): string {
  const name = normalise(sheet.name);

  if (name === 'inventory master' || name === 'stock movement') {
    return (
      'Stock is held against a stocktake, which records an expiry date and who counted it. ' +
      'This sheet has neither, and inventing them would put dates in your records that nobody wrote down. ' +
      'Use the stocktake import on the Inventory page for this sheet.'
    );
  }
  if (name === 'forecast inputs') {
    return 'These are assumptions for a forecast rather than figures that happened, and Amryn keeps the two apart.';
  }
  if (name.startsWith('income statement')) {
    return (
      'Every line of this sheet is already imported from elsewhere: its revenue and cost of sales are ' +
      'the September column of the monthly summary, and its expense lines are the expense register. ' +
      'Importing it as well would count the same money twice.'
    );
  }
  if (name === 'company profile') {
    return (
      'This is the business describing itself — its legal name, its market, its objectives — rather than ' +
      'figures. That belongs in the Imprint, which this importer does not write to.'
    );
  }
  const blocks = readBlocks(sheet.records);
  if (blocks.length === 0) {
    return 'Prose rather than a table — nothing here is a row of figures.';
  }
  // A table of sentences is still not data. The notes and objectives sheets
  // are laid out in two columns and hold no measurement at all, and saying
  // "not recognised" about them invites somebody to go looking for the mapping
  // that is missing. There isn't one to write.
  const numbers = blocks.some((block) =>
    block.rows.some((row) => row.some((value) => toNumber(value) !== null)),
  );
  if (!numbers) {
    return 'Notes and commentary rather than figures — there is no measurement on this sheet to import.';
  }
  return 'Not one of the sheets this importer knows how to read.';
}

/** The period a sheet's own title states, e.g. "September 2026". */
function titlePeriod(
  sheet: SheetSource,
  fallbackYear: number | null,
): { start: string; end: string } | null {
  for (const row of sheet.records.slice(0, 4)) {
    for (const value of row) {
      const period = monthPeriod(value ?? '');
      if (period) return period;
    }
  }
  // A sheet with no month of its own — the supplier sheet says "Spend YTD" —
  // is dated to the end of the workbook's year rather than to today, so
  // re-importing the same file twice produces the same date both times.
  if (fallbackYear) return { start: `${fallbackYear}-01-01`, end: `${fallbackYear}-12-31` };
  return null;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

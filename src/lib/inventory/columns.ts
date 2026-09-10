/**
 * What a stocktake spreadsheet may call each of its columns.
 *
 * Lifted out of the import action so the template a person downloads and the
 * importer that reads it back are generated from the same list. They were two
 * lists for as long as there was a template at all, and a template whose
 * headings the importer does not recognise is worse than no template: it looks
 * like the official answer and it fails.
 *
 * Order matters — the first match wins, so the most specific spelling comes
 * first, and the first entry of each is what the template writes.
 */
export const COLUMNS = {
  productName: ['product name', 'product', 'item name', 'item', 'description'],
  sku: ['sku', 'code', 'product code', 'item code', 'barcode'],
  batchNumber: ['batch number', 'batch', 'lot number', 'lot'],
  department: ['department', 'section', 'category', 'aisle'],
  location: ['location', 'shelf', 'bin', 'position'],
  qty: ['qty', 'quantity', 'count', 'units', 'on hand'],
  expiryDate: ['expiry date', 'expiry', 'expires', 'exp date', 'best before', 'use by'],
  action: ['action', 'action taken', 'status', 'outcome'],
  actionedBy: ['actioned by', 'checked by', 'by', 'staff'],
  actionedOn: ['date actioned', 'actioned on', 'action date'],
  notes: ['notes', 'comment', 'comments', 'remarks'],
  unitCost: ['unit cost', 'cost', 'price', 'unit price', 'cost price'],
  verified: ['verified', 'checked', 'confirmed'],
} as const;

export type ColumnKey = keyof typeof COLUMNS;

/** The two a line cannot be evaluated without. */
export const REQUIRED_COLUMNS: readonly ColumnKey[] = ['productName', 'expiryDate'];

/** Title case, for a heading a person reads: 'Product Name'. */
export function headingFor(key: ColumnKey): string {
  return COLUMNS[key][0]
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * A starter file, as CSV.
 *
 * Two example rows rather than one. A single row cannot show that the optional
 * columns are optional, and the second row — name and expiry only — is the
 * fastest way to say "this is enough" without a paragraph saying it.
 */
export function templateCsv(today: string): string {
  const keys = Object.keys(COLUMNS) as ColumnKey[];
  const header = keys.map(headingFor);

  const example: Record<ColumnKey, string> = {
    productName: 'Panado 500mg 24s',
    sku: 'PAN500-24',
    batchNumber: 'B24-0912',
    department: 'Pharmacy',
    location: 'Aisle 3, shelf 2',
    qty: '14',
    expiryDate: '2027-01-31',
    action: 'Removed from Shelf',
    actionedBy: 'A. Mokoena',
    actionedOn: today,
    notes: 'Short-dated, pulled for return',
    unitCost: '42.50',
    verified: 'Yes',
  };

  const minimal: Partial<Record<ColumnKey, string>> = {
    productName: 'Disprin 300mg 24s',
    expiryDate: '2027-06-30',
  };

  const line = (row: Partial<Record<ColumnKey, string>>) =>
    keys.map((key) => quote(row[key] ?? '')).join(',');

  return `${header.map(quote).join(',')}\n${line(example)}\n${line(minimal)}\n`;
}

/** RFC 4180 quoting, so a comma in a note does not become a new column. */
function quote(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

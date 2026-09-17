/**
 * The names the import report gives the tables it wrote to.
 *
 * In its own module because import-workbook.ts is a 'use server' file, and
 * such a file may only export async functions — a synchronous helper there
 * fails the build rather than the type check, which is a good rule and an
 * unhelpful error. The words belong to the report either way, not to the
 * action that produces it.
 */
export function label(table: string): string {
  switch (table) {
    case 'financial_records':
      return 'financial records';
    case 'sales_records':
      return 'sales';
    case 'operational_records':
      return 'operational measures';
    case 'opportunities':
      return 'opportunities';
    case 'risks':
      return 'risks';
    default:
      return table;
  }
}

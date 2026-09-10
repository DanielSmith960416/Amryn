import { templateCsv } from '@/lib/inventory/columns';
import { requirePermission } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * The spreadsheet to start from.
 *
 * "There isn't a proper setup for it" was the report, and this is half of what
 * that meant: the importer knew thirteen columns and five spellings of each,
 * and the only way to discover any of it was to guess, fail, and read the
 * error. A person counting stock should be able to open the file we want,
 * type into it, and send it back.
 *
 * Generated rather than stored, from the same list the importer matches
 * against, so the two cannot drift — a stored template is correct on the day
 * it is written and silently wrong the first time a column is renamed.
 *
 * Behind the same permission as the page, because the columns describe how a
 * customer's stock is modelled and there is no reason for that to be public.
 */
export async function GET() {
  await requirePermission('manage_inventory');

  const today = new Date().toISOString().slice(0, 10);

  return new Response(templateCsv(today), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="amryn-stocktake-template.csv"',
      // A template that a browser cached would outlive a change to the columns.
      'Cache-Control': 'no-store',
    },
  });
}

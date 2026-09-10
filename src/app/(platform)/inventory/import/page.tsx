import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { requirePermission } from '@/lib/auth/session';
import { COMPLIANCE_PROFILES } from '@/lib/intelligence/inventory';
import { ImportForm } from '@/features/inventory/import-form';

export const metadata: Metadata = { title: 'Import a stocktake' };

export const dynamic = 'force-dynamic';

/**
 * Where a spreadsheet becomes a stocktake.
 *
 * The one screen in Advanced Inventory Control that writes rather than reads,
 * so it is behind manage_inventory rather than view_operations_data — actioning
 * stock is a decision about it, not a way of reading about it.
 */
export default async function ImportStocktakePage() {
  await requirePermission('manage_inventory');
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        eyebrow="Advanced Inventory Control"
        title="Import a stocktake"
        description="A counted shelf, from the spreadsheet you counted it on."
        actions={
          <div className="flex items-center gap-4">
            <a
              href="/inventory/import/template"
              className="text-[0.8125rem] text-[var(--brand)] underline underline-offset-2"
            >
              Download a template
            </a>
            <Link
              href="/inventory"
              className="text-[0.8125rem] text-[var(--text-secondary)] underline underline-offset-2"
            >
              Back to inventory
            </Link>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="The count"
              subtitle="Each import is one stocktake, kept whole — so a stocktake in March and one in June stop overwriting each other."
            />
            <CardBody>
              <ImportForm
                profiles={COMPLIANCE_PROFILES.map((profile) => ({
                  id: profile.id,
                  label: profile.label,
                  responsibleRoleLabel: profile.responsibleRoleLabel,
                  auditorRoleLabel: profile.auditorRoleLabel,
                  shifts: profile.shifts,
                }))}
                today={today}
              />
            </CardBody>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader title="What we look for" />
            <CardBody className="space-y-3 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
              <p>
                <strong className="text-[var(--text-primary)]">Required.</strong> A product name and
                an expiry date. Expiry is what every section of the report sorts on, so a line
                without one cannot be placed.
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Used if present.</strong> SKU, batch
                number, department, location, quantity, unit cost, what was done to the line, who
                did it and when, notes, and whether it was verified.
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Dates.</strong> Written day-first —
                04/03/2026 is the fourth of March. ISO dates are read as they are, and a cell
                Excel already knows is a date is read as the date it shows rather than as the
                number underneath it.
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">The file.</strong> An Excel workbook
                (.xlsx) or a CSV. We read the first sheet. The older .xls will not open anywhere
                that matters any more, so open it and save it again as .xlsx.
              </p>
              <p>
                A line we cannot read is listed back with its row number, and nothing is written
                until the whole file has been read. A half-imported stocktake would look compliant
                rather than broken.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

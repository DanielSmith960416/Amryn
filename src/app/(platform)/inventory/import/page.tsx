import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { requirePermission } from '@/lib/auth/session';
import { COMPLIANCE_PROFILES } from '@/lib/intelligence/inventory';
import { ImportForm } from '@/features/inventory/import-form';
import { SectionTabs } from '@/components/ui/section-tabs';
import { visibleTabs } from '@/components/shell/navigation';
import { requireWorkspace } from '@/lib/auth/session';

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
  // Resolved once per request by the layout; this is the same cached value.
  const workspace = await requireWorkspace();
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
      <SectionTabs tabs={visibleTabs('inventory', workspace.permissions)} />


      <div className="max-w-3xl">
        <div>
          <Card>
            <CardHeader
              title="The count"
              subtitle="Each import is one stocktake. Dates are read day-first — 04/03/2026 is the fourth of March."
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

      </div>
    </>
  );
}

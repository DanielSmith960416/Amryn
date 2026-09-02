import type { Metadata } from 'next';
import { Badge, EXPIRY_TONE } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { DemoNotice, PageHeader } from '@/components/ui/page-header';
import { Stat, StatGrid } from '@/components/ui/stat';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { count, date, daysLabel, percent } from '@/lib/format';
import { currentWorkspace } from '@/lib/workspace';
import { NoDataYet } from '@/components/intelligence/no-data-yet';

export const metadata: Metadata = { title: 'Audit Log' };

/**
 * AUDIT LOG, line for line.
 *
 * Every column the workbook records is here, including the verification tick,
 * because this table is the compliance record itself — the thing an insurer or
 * an inspector is shown. Dropping a column to make it fit a phone would make it
 * a summary of a compliance record, which is a different and much less useful
 * document. It scrolls instead.
 */
export default async function AuditLogPage() {
  const state = await currentWorkspace();
  if (state.kind === 'empty') {
    return <NoDataYet what="The audit trail of every stock action" organisationName={state.organisationName} />;
  }
  const w = state.workspace;

  // Reachable, and nothing counted yet. Worth saying explicitly: an
  // empty compliance dashboard and a fully compliant one look identical
  // when every count is zero, and the second is the one an owner wants
  // to believe.
  if (!w.inventory.recorded) {
    return (
      <NoDataYet
        what="The audit trail of every stock action"
        detail="No stocktake has been recorded yet. Import one from a spreadsheet and this fills in."
        action={{ href: '/inventory/import', label: 'Import a stocktake' }}
      />
    );
  }
  const { items, summary: s, settings, profile } = w.inventory;

  return (
    <>
      <PageHeader
        eyebrow="Compliance record"
        title="Expiry audit log"
        description={`${settings.siteName} · ${profile.auditorRoleLabel}: ${settings.auditorName} · ${profile.responsibleRoleLabel}: ${settings.responsibleName} · ${date(w.inventory.auditDate)} · ${settings.shift}`}
      />

      {w.isDemo ? <DemoNotice /> : null}

      <StatGrid className="mb-6">
        <Stat label="Total items" value={count(s.totalItems)} />
        <Stat label="Expired" value={count(s.expired)} tone={s.expired > 0 ? 'negative' : 'positive'} />
        <Stat label="Critical ≤30d" value={count(s.critical)} tone={s.critical > 0 ? 'warning' : 'positive'} />
        <Stat label="Warning ≤90d" value={count(s.warning)} />
        <Stat label="Verified" value={`${count(items.filter((i) => i.verified).length)}/${count(items.length)}`} />
        <Stat
          label="Compliance"
          value={percent(s.complianceRate, 0)}
          tone={s.complianceRate >= 0.9 ? 'positive' : 'warning'}
        />
      </StatGrid>

      <Card>
        <CardHeader
          title="Audit lines"
          subtitle={`Status is computed from the expiry date against ${date(w.asOf.toISOString().slice(0, 10))}, not stored`}
        />
        <TableWrap className="rounded-t-none border-0 border-t">
          <Table>
            <thead>
              <tr>
                <Th numeric>#</Th>
                <Th>Product name</Th>
                <Th>SKU / barcode</Th>
                <Th>Batch</Th>
                <Th>Department</Th>
                <Th>Location</Th>
                <Th numeric>Qty</Th>
                <Th>Expiry date</Th>
                <Th>Status</Th>
                <Th numeric>Days left</Th>
                <Th>Action taken</Th>
                <Th>Actioned by</Th>
                <Th>Date actioned</Th>
                <Th>Notes</Th>
                <Th>✓</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={`${i.sku}-${i.batchNumber}`}>
                  <Td numeric className="text-[var(--text-tertiary)]">
                    {i.index}
                  </Td>
                  <Td className="min-w-[14rem] font-medium">{i.productName}</Td>
                  <Td className="numeric whitespace-nowrap">{i.sku}</Td>
                  <Td className="numeric whitespace-nowrap">{i.batchNumber}</Td>
                  <Td className="whitespace-nowrap">{i.department}</Td>
                  <Td className="numeric whitespace-nowrap">{i.location}</Td>
                  <Td numeric>{i.qty}</Td>
                  <Td className="whitespace-nowrap">{date(i.expiryDate)}</Td>
                  <Td>
                    <Badge tone={EXPIRY_TONE[i.status]}>{i.status}</Badge>
                  </Td>
                  <Td numeric className={i.daysLeft < 0 ? 'text-[var(--negative)]' : ''}>
                    {daysLabel(i.daysLeft)}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {i.action || <span className="text-[var(--warning)]">—</span>}
                  </Td>
                  <Td className="whitespace-nowrap">{i.actionedBy || '—'}</Td>
                  <Td className="whitespace-nowrap">{i.dateActioned ? date(i.dateActioned) : '—'}</Td>
                  <Td className="min-w-[10rem] text-[var(--text-secondary)]">{i.notes || '—'}</Td>
                  <Td>
                    {/*
                      A tick and a cross, each with its own text, rather than
                      colour alone: on a record that may be printed in black and
                      white, colour is not a signal.
                    */}
                    <span
                      className={
                        i.verified ? 'text-[var(--positive)]' : 'text-[var(--text-tertiary)]'
                      }
                      title={i.verified ? 'Verified by the auditor' : 'Not yet verified'}
                    >
                      {i.verified ? '✓' : '✗'}
                      <span className="sr-only">
                        {i.verified ? 'Verified' : 'Not verified'}
                      </span>
                    </span>
                  </Td>
                </tr>
              ))}
              {items.length === 0 ? (
                <EmptyRow colSpan={15}>
                  No audit lines have been recorded for this period.
                </EmptyRow>
              ) : null}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <p className="mt-4 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
        {profile.retentionNote}
      </p>
    </>
  );
}

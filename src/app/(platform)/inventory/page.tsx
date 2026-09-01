import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, EXPIRY_TONE } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DemoNotice, PageHeader } from '@/components/ui/page-header';
import { Stat, StatGrid } from '@/components/ui/stat';
import { EmptyRow, Table, TableWrap, Td, Th, TotalRow } from '@/components/ui/table';
import { DepartmentMatrix } from '@/components/inventory/department-matrix';
import { STATUS_GUIDANCE, STATUS_LABEL, type ExpiryStatus } from '@/lib/intelligence/inventory';
import { count, date, money, percent } from '@/lib/format';
import { loadWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Advanced Inventory Control' };

/**
 * The compliance dashboard — DASHBOARD and DEPT SUMMARY in the workbook.
 *
 * The module is sector-neutral: the regulator, the sign-off role, the retention
 * wording and the department list all come from the workspace's compliance
 * profile. The demonstration workspace runs the pharmacy profile, which
 * reproduces the workbook exactly, but nothing on this page is written for a
 * pharmacy.
 */
export default function InventoryPage() {
  const w = loadWorkspace();
  const { summary: s, profile, settings, departments, items } = w.inventory;
  const currency = w.profile.currency;

  return (
    <>
      <PageHeader
        eyebrow={profile.regulator ? `${profile.label} · ${profile.regulator} aligned` : profile.label}
        title="Advanced Inventory Control"
        description={`${settings.siteName} · ${profile.responsibleRoleLabel}: ${settings.responsibleName} · Audited ${date(w.inventory.auditDate)} · ${settings.shift}`}
        actions={
          <Badge tone={s.urgent > 0 ? 'negative' : 'positive'}>
            {s.urgent > 0 ? `${s.urgent} urgent` : 'No urgent stock'}
          </Badge>
        }
      />

      {w.isDemo ? (
        <DemoNotice>
          The audit log below is the demonstration data from the Amryn
          <sup className="tm">™</sup> Advanced Inventory Control workbook. Expiry dates are
          positioned relative to today so every status band stays represented.
        </DemoNotice>
      ) : null}

      {/* ── Key performance indicators (workbook: DASHBOARD rows 5–13) ── */}
      <StatGrid className="mb-4">
        <Stat label="Total items" value={count(s.totalItems)} />
        <Stat label="Expired" value={count(s.expired)} tone={s.expired > 0 ? 'negative' : 'positive'} />
        <Stat label="Critical ≤30d" value={count(s.critical)} tone={s.critical > 0 ? 'warning' : 'positive'} />
        <Stat label="Warning ≤90d" value={count(s.warning)} />
        <Stat label="Clear >90d" value={count(s.clear)} tone="positive" />
        <Stat
          label="Compliance rate"
          value={percent(s.complianceRate, 0)}
          sub="Clear lines ÷ total"
          tone={s.complianceRate >= 0.9 ? 'positive' : s.complianceRate >= 0.6 ? 'warning' : 'negative'}
        />
      </StatGrid>

      <StatGrid className="mb-6">
        <Stat
          label="Urgent"
          value={count(s.urgent)}
          sub="Expired + critical"
          tone={s.urgent > 0 ? 'negative' : 'positive'}
        />
        <Stat
          label="Pending review"
          value={count(s.pendingReview)}
          sub="No action recorded"
          tone={s.pendingReview > 0 ? 'warning' : 'positive'}
        />
        <Stat label="Expired units" value={count(s.expiredQty)} sub="Write-off quantity" />
        <Stat
          label="Dormant"
          value={count(s.dormantItems)}
          sub={`${count(s.dormantQty)} units on shelf`}
        />
        <Stat
          label="Capital at risk"
          value={money(s.valueAtRisk, currency)}
          sub="Expired + critical, at cost"
          tone={s.valueAtRisk > 0 ? 'warning' : 'positive'}
          className="col-span-2"
        />
      </StatGrid>

      <div className="mb-6 flex flex-wrap gap-2">
        {([
          ['/inventory/audit-log', 'Open the audit log'],
          ['/inventory/stock-report', 'Stock intelligence report'],
        ] as const).map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--card)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--card-inset)]"
          >
            {label} →
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="Department stock health matrix"
              subtitle="Every configured department, including those holding nothing"
            />
            <DepartmentMatrix departments={departments} />
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Action breakdown" subtitle="What was recorded at the audit" />
            <CardBody>
              <TableWrap className="border-0">
                <Table>
                  <tbody>
                    {s.actionBreakdown.map((a) => (
                      <tr key={a.action}>
                        <Td>{a.action}</Td>
                        <Td numeric className="w-16">
                          {a.count}
                        </Td>
                      </tr>
                    ))}
                    <TotalRow>
                      <Td>Total lines</Td>
                      <Td numeric>{s.totalItems}</Td>
                    </TotalRow>
                  </tbody>
                </Table>
              </TableWrap>
              {s.pendingReview > 0 ? (
                <p className="mt-3 text-[0.75rem] leading-relaxed text-[var(--warning)]">
                  {s.pendingReview} line{s.pendingReview === 1 ? '' : 's'} carry no action. An audit
                  line without an action is not a completed audit — close these before the{' '}
                  {profile.responsibleRoleLabel} signs off.
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Status reference" subtitle="What each status obliges" />
            <CardBody>
              <dl className="space-y-3">
                {(['EXPIRED', 'CRITICAL', 'WARNING', 'CLEAR'] as ExpiryStatus[]).map((status) => (
                  <div key={status}>
                    <dt>
                      <Badge tone={EXPIRY_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                    </dt>
                    <dd className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                      {STATUS_GUIDANCE[status]}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 border-t border-[var(--border)] pt-3 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
                {profile.retentionNote}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Urgent lines"
          subtitle="Everything expired or within 30 days, soonest first"
        />
        <TableWrap className="rounded-t-none border-0 border-t">
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th>Batch</Th>
                <Th>Department</Th>
                <Th>Location</Th>
                <Th numeric>Qty</Th>
                <Th>Expiry</Th>
                <Th>Status</Th>
                <Th>Action taken</Th>
              </tr>
            </thead>
            <tbody>
              {items
                .filter((i) => i.status === 'EXPIRED' || i.status === 'CRITICAL')
                .sort((a, b) => a.daysLeft - b.daysLeft)
                .map((i) => (
                  <tr key={i.sku + i.batchNumber}>
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
                    <Td className="whitespace-nowrap">
                      {i.action || (
                        <span className="text-[var(--warning)]">Pending review</span>
                      )}
                    </Td>
                  </tr>
                ))}
              {s.urgent === 0 ? (
                <EmptyRow colSpan={9}>
                  Nothing is expired or within 30 days of expiry. Continue regular audit checks.
                </EmptyRow>
              ) : null}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </>
  );
}

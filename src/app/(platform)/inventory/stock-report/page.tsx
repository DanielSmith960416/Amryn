import type { Metadata } from 'next';
import { Badge, EXPIRY_TONE } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DemoNotice, PageHeader } from '@/components/ui/page-header';
import { Stat, StatGrid } from '@/components/ui/stat';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { DepartmentMatrix } from '@/components/inventory/department-matrix';
import { DORMANCY_DEFINITIONS, type DormancyClass } from '@/lib/intelligence/inventory';
import { count, date, daysLabel, money, percent } from '@/lib/format';
import { loadWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Stock Intelligence Report' };

const DORMANCY_ORDER: DormancyClass[] = ['WRITE-OFF', 'AT-RISK', 'SLOW-MOVING', 'DORMANT'];

/**
 * STOCK REPORT — sections A through E.
 *
 * The workbook subtitles this "For Insurance, Financial Review & Owner
 * Decision-Making", and that is exactly who it is for. It is the document an
 * owner takes to their broker and their accountant, so the insurance and
 * financial notes in section E are carried through in substance: dormant stock
 * inflates stated inventory value, and only clear stock should be reported at
 * full cost.
 */
export default function StockReportPage() {
  const w = loadWorkspace();
  const { summary: s, sections, departments, settings, profile, recommendations } = w.inventory;
  const currency = w.profile.currency;

  return (
    <>
      <PageHeader
        eyebrow="Stock expiry & dormancy intelligence"
        title="Stock Intelligence Report"
        description={`${settings.siteName} · ${profile.responsibleRoleLabel}: ${settings.responsibleName} · Generated ${date(w.asOf.toISOString().slice(0, 10))} · For insurance, financial review and owner decision-making`}
      />

      {w.isDemo ? <DemoNotice /> : null}

      <StatGrid className="mb-6">
        <Stat label="Total items" value={count(s.totalItems)} />
        <Stat label="Expired" value={count(s.expired)} sub={`${count(s.expiredQty)} units`} tone={s.expired > 0 ? 'negative' : 'positive'} />
        <Stat label="Dormant" value={count(s.dormantItems)} sub={`${count(s.dormantQty)} units on shelf`} />
        <Stat label="Stock at risk" value={count(s.urgent)} sub="Expired + critical" tone={s.urgent > 0 ? 'warning' : 'positive'} />
        <Stat label="Compliance rate" value={percent(s.complianceRate, 0)} />
        <Stat label="Capital at risk" value={money(s.valueAtRisk, currency)} sub="At cost" tone="warning" />
      </StatGrid>

      {/* ── Dormancy definitions ────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader
          title="Dormancy threshold definitions"
          subtitle="How stock is classified in this report"
        />
        <CardBody>
          <dl className="grid gap-4 sm:grid-cols-2">
            {DORMANCY_ORDER.map((k) => (
              <div key={k}>
                <dt className="font-mono text-[0.6875rem] font-medium tracking-wide text-[var(--text-primary)] uppercase">
                  {k}
                </dt>
                <dd className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  {DORMANCY_DEFINITIONS[k]}
                </dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      {/* ── Section A ───────────────────────────────────────────────── */}
      <ReportSection
        letter="A"
        title="Expired stock register"
        note="Insurance and disposal record"
        empty="No expired stock. Nothing to declare for write-off in this period."
        columns={['Product name', 'SKU', 'Department', 'Qty', 'Expiry date', 'Days overdue', 'Action taken', 'Notes', 'Flag']}
      >
        {sections.expired.map((i) => (
          <tr key={`${i.sku}-${i.batchNumber}`}>
            <Td className="min-w-[14rem] font-medium">{i.productName}</Td>
            <Td className="numeric whitespace-nowrap">{i.sku}</Td>
            <Td className="whitespace-nowrap">{i.department}</Td>
            <Td numeric>{i.qty}</Td>
            <Td className="whitespace-nowrap">{date(i.expiryDate)}</Td>
            <Td numeric className="text-[var(--negative)]">{Math.abs(i.daysLeft)}</Td>
            <Td className="whitespace-nowrap">{i.action || '—'}</Td>
            <Td className="min-w-[10rem] text-[var(--text-secondary)]">{i.notes || '—'}</Td>
            <Td>
              <Badge tone="negative">Write-off</Badge>
            </Td>
          </tr>
        ))}
      </ReportSection>

      {/* ── Section B ───────────────────────────────────────────────── */}
      <ReportSection
        letter="B"
        title="Critical stock"
        note="≤ 30 days to expiry — immediate action required"
        empty="Nothing is within 30 days of expiry."
        columns={['Product name', 'SKU', 'Department', 'Qty', 'Expiry date', 'Days left', 'Action taken', 'Location', 'Flag']}
      >
        {sections.critical.map((i) => (
          <tr key={`${i.sku}-${i.batchNumber}`}>
            <Td className="min-w-[14rem] font-medium">{i.productName}</Td>
            <Td className="numeric whitespace-nowrap">{i.sku}</Td>
            <Td className="whitespace-nowrap">{i.department}</Td>
            <Td numeric>{i.qty}</Td>
            <Td className="whitespace-nowrap">{date(i.expiryDate)}</Td>
            <Td numeric className="text-[var(--warning)]">{daysLabel(i.daysLeft)}</Td>
            <Td className="whitespace-nowrap">
              {i.action || <span className="text-[var(--warning)]">Pending review</span>}
            </Td>
            <Td className="numeric whitespace-nowrap">{i.location}</Td>
            <Td>
              <Badge tone={EXPIRY_TONE.CRITICAL}>At risk</Badge>
            </Td>
          </tr>
        ))}
      </ReportSection>

      {/* ── Section C ───────────────────────────────────────────────── */}
      <ReportSection
        letter="C"
        title="Dormant and slow-moving stock"
        note="Owner and financial review — capital tied up on the shelf"
        empty="No dormant or slow-moving stock identified."
        columns={['Product name', 'SKU', 'Department', 'Qty', 'Expiry date', 'Days left', 'Location', 'Value at cost', 'Class']}
      >
        {sections.dormant.map((i) => (
          <tr key={`${i.sku}-${i.batchNumber}`}>
            <Td className="min-w-[14rem] font-medium">{i.productName}</Td>
            <Td className="numeric whitespace-nowrap">{i.sku}</Td>
            <Td className="whitespace-nowrap">{i.department}</Td>
            <Td numeric>{i.qty}</Td>
            <Td className="whitespace-nowrap">{date(i.expiryDate)}</Td>
            <Td numeric>{daysLabel(i.daysLeft)}</Td>
            <Td className="numeric whitespace-nowrap">{i.location}</Td>
            <Td numeric>{i.valueAtRisk > 0 ? money(i.valueAtRisk, currency) : '—'}</Td>
            <Td>
              <Badge tone={i.dormancy === 'SLOW-MOVING' ? 'info' : 'warning'}>{i.dormancy}</Badge>
            </Td>
          </tr>
        ))}
      </ReportSection>

      {/* ── Section D ───────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader
          eyebrow="Section D"
          title="Department stock health matrix"
          subtitle="Management and financial overview"
        />
        <DepartmentMatrix departments={departments} />
      </Card>

      {/* ── Section E ───────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader
          eyebrow="Section E"
          title="Owner recommendations"
          subtitle="Insurance and financial declaration"
        />
        <CardBody>
          <dl className="space-y-4">
            {recommendations.map((r) => (
              <div key={r.heading}>
                <dt className="font-display text-[0.875rem] font-semibold text-[var(--text-primary)]">
                  {r.heading}
                </dt>
                <dd className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  {r.body}
                </dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      {/* ── Declaration ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Declaration and sign-off" />
        <CardBody>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {[
              ['Site / branch', settings.siteName],
              [profile.responsibleRoleLabel, settings.responsibleName],
              ['Report date', date(w.asOf.toISOString().slice(0, 10))],
              [`Prepared by / ${profile.auditorRoleLabel.toLowerCase()}`, settings.auditorName],
              ['Compliance profile', profile.label],
              ['Regulator', profile.regulator ?? 'Not sector-regulated'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="eyebrow">{k}</dt>
                <dd className="mt-0.5 text-[0.875rem] text-[var(--text-primary)]">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 grid gap-6 border-t border-[var(--border)] pt-5 sm:grid-cols-2">
            {[
              `${profile.responsibleRoleLabel} signature`,
              'Owner sign-off',
              'Insurance reference #',
              'Next audit due',
            ].map((label) => (
              <div key={label}>
                <div className="h-8 border-b border-[var(--border-strong)]" />
                <p className="mt-1.5 text-[0.75rem] text-[var(--text-tertiary)]">{label}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 border-t border-[var(--border)] pt-4 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
            {profile.disposalNote} {profile.retentionNote}
          </p>
        </CardBody>
      </Card>
    </>
  );
}

function ReportSection({
  letter,
  title,
  note,
  columns,
  empty,
  children,
}: {
  letter: string;
  title: string;
  note: string;
  columns: string[];
  empty: string;
  children: React.ReactNode;
}) {
  const rows = Array.isArray(children) ? children : [children];
  const isEmpty = rows.flat().filter(Boolean).length === 0;

  return (
    <Card className="mb-6">
      <CardHeader eyebrow={`Section ${letter}`} title={title} subtitle={note} />
      <TableWrap className="rounded-t-none border-0 border-t">
        <Table>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <Th key={c} numeric={i === 3 || i === 5}>
                  {c}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isEmpty ? <EmptyRow colSpan={columns.length}>{empty}</EmptyRow> : children}
          </tbody>
        </Table>
      </TableWrap>
    </Card>
  );
}

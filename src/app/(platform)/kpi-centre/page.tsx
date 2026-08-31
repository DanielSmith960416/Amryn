import type { Metadata } from 'next';
import { Badge, KPI_TONE } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { DemoNotice, PageHeader } from '@/components/ui/page-header';
import { Stat, StatGrid } from '@/components/ui/stat';
import { Table, TableWrap, Td, Th } from '@/components/ui/table';
import { byFormat, count, signedPercent } from '@/lib/format';
import { loadWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'KPI Centre' };

/**
 * KPI_CENTRE — current against target, with the variance and the band.
 *
 * One correction to the workbook is visible on this page. Its status formula
 * assumes higher is always better, which makes "Risks Open" against a target of
 * zero read as ON TARGET no matter how many are open. Metrics where lower is
 * the better outcome are marked, and the comparison is inverted for them.
 */
export default function KpiCentrePage() {
  const w = loadWorkspace();
  const currency = w.profile.currency;

  const onTarget = w.kpis.filter((k) => k.status === 'ON TARGET').length;
  const near = w.kpis.filter((k) => k.status === 'NEAR TARGET').length;
  const below = w.kpis.filter((k) => k.status === 'BELOW TARGET').length;

  return (
    <>
      <PageHeader
        eyebrow="Performance intelligence"
        title="KPI Centre"
        description="Every measure with a target, its variance, and whether it is on track. On target, or within 10% of it, or below."
      />

      {w.isDemo ? <DemoNotice /> : null}

      <StatGrid className="mb-6">
        <Stat label="Measures tracked" value={count(w.kpis.length)} />
        <Stat label="On target" value={count(onTarget)} tone="positive" />
        <Stat label="Near target" value={count(near)} tone="warning" />
        <Stat label="Below target" value={count(below)} tone={below > 0 ? 'negative' : 'positive'} />
      </StatGrid>

      <Card>
        <CardHeader title="Key performance indicators" subtitle="Grouped by category" />
        <TableWrap className="rounded-t-none border-0 border-t">
          <Table>
            <thead>
              <tr>
                <Th>KPI</Th>
                <Th>Category</Th>
                <Th numeric>Current</Th>
                <Th numeric>Target</Th>
                <Th numeric>Variance</Th>
                <Th numeric>Variance %</Th>
                <Th>Owner</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {w.kpis.map((k) => (
                <tr key={k.kpi}>
                  <Td className="font-medium whitespace-nowrap">
                    {k.kpi}
                    {k.lowerIsBetter ? (
                      <span
                        className="ml-1.5 font-mono text-[0.625rem] text-[var(--text-tertiary)]"
                        title="Lower is the better outcome for this measure."
                      >
                        lower is better
                      </span>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap">{k.category}</Td>
                  <Td numeric>{byFormat(k.current, k.format, currency)}</Td>
                  <Td numeric>{byFormat(k.target, k.format, currency)}</Td>
                  <Td numeric>{byFormat(k.variance, k.format, currency)}</Td>
                  <Td numeric>{k.target === 0 ? '—' : signedPercent(k.variancePct)}</Td>
                  <Td className="whitespace-nowrap">{k.owner}</Td>
                  <Td>
                    <Badge tone={KPI_TONE[k.status]}>{k.status}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </>
  );
}

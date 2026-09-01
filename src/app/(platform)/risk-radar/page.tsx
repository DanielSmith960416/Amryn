import type { Metadata } from 'next';
import { Badge, RISK_TONE } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { DemoNotice, PageHeader } from '@/components/ui/page-header';
import { Stat, StatGrid } from '@/components/ui/stat';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { count, date } from '@/lib/format';
import { loadWorkspace } from '@/lib/workspace';
import { requireEntitlement } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Risk Radar' };

const TREND_TONE = { Worsening: 'negative', Stable: 'neutral', Improving: 'positive' } as const;

/**
 * RISK_RADAR and RISK_REGISTER as one page.
 *
 * Risks are ranked by score, and ties break on trend — of two risks scoring the
 * same, the one getting worse is the one to look at first.
 */
export default async function RiskRadarPage() {
  // Sends the reader to billing with the feature named, rather than to an
  // empty page or a refusal they cannot act on.
  await requireEntitlement('risk_radar');

  const w = loadWorkspace();

  return (
    <>
      <PageHeader
        eyebrow="Exposure"
        title="Risk Radar"
        description="Probability × impact, with an owner, a mitigation and a date against every entry."
      />

      {w.isDemo ? <DemoNotice /> : null}

      <StatGrid className="mb-6">
        <Stat label="Total risks" value={count(w.riskSummary.total)} />
        <Stat label="Open" value={count(w.riskSummary.open)} tone="warning" />
        <Stat label="Monitoring" value={count(w.riskSummary.monitoring)} />
        <Stat label="Planning" value={count(w.riskSummary.planning)} />
        <Stat
          label="Highest score"
          value={w.riskSummary.highestScore.toFixed(2)}
          tone={w.riskSummary.highestScore > 0.6 ? 'negative' : 'warning'}
        />
        <Stat
          label="Worsening"
          value={count(w.riskSummary.worsening)}
          tone={w.riskSummary.worsening > 0 ? 'negative' : 'positive'}
        />
      </StatGrid>

      <Card>
        <CardHeader
          title="Active risk register"
          subtitle="Scores band at 0.60 (critical), 0.40 (high) and 0.20 (medium)"
        />
        <TableWrap className="rounded-t-none border-0 border-t">
          <Table>
            <thead>
              <tr>
                <Th>ID</Th>
                <Th>Risk</Th>
                <Th>Category</Th>
                <Th numeric>Prob.</Th>
                <Th numeric>Impact</Th>
                <Th numeric>Score</Th>
                <Th>Class</Th>
                <Th>Owner</Th>
                <Th>Mitigation</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th>Trend</Th>
              </tr>
            </thead>
            <tbody>
              {w.risks.map((r) => (
                <tr key={r.id}>
                  <Td className="numeric whitespace-nowrap">{r.id}</Td>
                  <Td className="min-w-[14rem] font-medium">{r.risk}</Td>
                  <Td className="whitespace-nowrap">{r.category}</Td>
                  <Td numeric>{r.probability.toFixed(2)}</Td>
                  <Td numeric>{r.impact.toFixed(2)}</Td>
                  <Td numeric>{r.score.toFixed(2)}</Td>
                  <Td>
                    <Badge tone={RISK_TONE[r.classification]}>{r.classification}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap">{r.owner}</Td>
                  <Td className="min-w-[16rem]">{r.mitigation}</Td>
                  <Td className="whitespace-nowrap">{date(r.dueDate)}</Td>
                  <Td className="whitespace-nowrap">{r.status}</Td>
                  <Td>
                    <Badge tone={TREND_TONE[r.trend]}>{r.trend}</Badge>
                  </Td>
                </tr>
              ))}
              {w.risks.length === 0 ? (
                <EmptyRow colSpan={12}>
                  Nothing is on the register. That is a state worth confirming rather than
                  assuming — an empty register usually means risks are not being recorded.
                </EmptyRow>
              ) : null}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </>
  );
}

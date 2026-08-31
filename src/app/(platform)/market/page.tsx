import type { Metadata } from 'next';
import { Badge, type Tone } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { DemoNotice, PageHeader } from '@/components/ui/page-header';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import type { ImpactLevel, SignalDirection } from '@/lib/intelligence/types';
import { loadWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Market & Competitor Intelligence' };

const IMPACT_TONE: Readonly<Record<ImpactLevel, Tone>> = {
  HIGH: 'negative',
  MEDIUM: 'warning',
  LOW: 'neutral',
};

const DIRECTION: Readonly<Record<SignalDirection, { label: string; tone: Tone }>> = {
  Positive: { label: '↑ Positive', tone: 'positive' },
  Negative: { label: '↓ Negative', tone: 'negative' },
  Opportunity: { label: '→ Opportunity', tone: 'info' },
};

/**
 * MARKET_INTELLIGENCE and COMPETITOR_INTELLIGENCE.
 *
 * These are the "market outside" half of the positioning, and both tables end
 * in the same column: what management should do about it. A signal with no
 * implication is trivia, and the workbook is right to insist on the column.
 */
export default function MarketPage() {
  const w = loadWorkspace();

  return (
    <>
      <PageHeader
        eyebrow="Outside view"
        title="Market & Competitor Intelligence"
        description="Demand shifts, economic signals and competitor moves — each with the management implication it carries."
      />

      {w.isDemo ? <DemoNotice /> : null}

      <Card className="mb-6">
        <CardHeader
          title="Market signals"
          subtitle="What is changing around the business, and what it means"
        />
        <TableWrap className="rounded-t-none border-0 border-t">
          <Table>
            <thead>
              <tr>
                <Th>Signal</Th>
                <Th>Type</Th>
                <Th>Direction</Th>
                <Th>Confidence</Th>
                <Th>Impact</Th>
                <Th>Management implication</Th>
                <Th>Source</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {w.signals.map((s) => (
                <tr key={s.signal}>
                  <Td className="min-w-[16rem] font-medium">{s.signal}</Td>
                  <Td className="whitespace-nowrap">{s.type}</Td>
                  <Td>
                    <Badge tone={DIRECTION[s.direction].tone}>{DIRECTION[s.direction].label}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap">{s.confidence}</Td>
                  <Td>
                    <Badge tone={IMPACT_TONE[s.impact]}>{s.impact}</Badge>
                  </Td>
                  <Td className="min-w-[16rem]">{s.implication}</Td>
                  <Td className="whitespace-nowrap text-[var(--text-secondary)]">{s.source}</Td>
                  <Td className="whitespace-nowrap text-[var(--text-secondary)]">{s.date}</Td>
                </tr>
              ))}
              {w.signals.length === 0 ? (
                <EmptyRow colSpan={8}>No market signals are being tracked.</EmptyRow>
              ) : null}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <Card>
        <CardHeader
          title="Competitor intelligence"
          subtitle="Every weakness a competitor has is an opening this business could take"
        />
        <TableWrap className="rounded-t-none border-0 border-t">
          <Table>
            <thead>
              <tr>
                <Th>Competitor</Th>
                <Th>Products</Th>
                <Th>Pricing</Th>
                <Th>Location</Th>
                <Th>Threat</Th>
                <Th>Key strength</Th>
                <Th>Key weakness</Th>
                <Th>Opportunity created</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {w.competitors.map((c) => (
                <tr key={c.competitor}>
                  <Td className="min-w-[12rem] font-medium">{c.competitor}</Td>
                  <Td className="whitespace-nowrap">{c.products}</Td>
                  <Td className="whitespace-nowrap">{c.pricing}</Td>
                  <Td className="whitespace-nowrap">{c.location}</Td>
                  <Td>
                    <Badge tone={IMPACT_TONE[c.threat]}>{c.threat}</Badge>
                  </Td>
                  <Td>{c.keyStrength}</Td>
                  <Td>{c.keyWeakness}</Td>
                  <Td className="min-w-[14rem] text-[var(--positive)]">{c.opportunityCreated}</Td>
                  <Td className="whitespace-nowrap text-[var(--text-secondary)]">{c.lastUpdated}</Td>
                </tr>
              ))}
              {w.competitors.length === 0 ? (
                <EmptyRow colSpan={9}>No competitors are being tracked.</EmptyRow>
              ) : null}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </>
  );
}

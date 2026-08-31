import type { Metadata } from 'next';
import { Badge, OPPORTUNITY_TONE } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DemoNotice, PageHeader } from '@/components/ui/page-header';
import { Stat, StatGrid } from '@/components/ui/stat';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { OpportunityDial } from '@/components/intelligence/opportunity-dial';
import { VALUE_ONLY_CEILING, opportunityFactors } from '@/lib/intelligence/opportunity';
import { count, date, money, percent, score } from '@/lib/format';
import { loadWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'OpportunityRadar®' };

/**
 * OPPORTUNITY_RADAR, OPPORTUNITY_DATABASE and OPPORTUNITY_SCORING as one page.
 *
 * The prototype has a scoring sheet that is a placeholder. It is filled in
 * here — every opportunity can be expanded to show what each of the six factors
 * contributed to its score. A ranked list nobody can interrogate is a ranked
 * list nobody trusts.
 */
export default function OpportunityRadarPage() {
  const w = loadWorkspace();
  const currency = w.profile.currency;

  return (
    <>
      <PageHeader
        eyebrow="Outside view"
        title={
          <>
            Amryn<sup className="tm">™</sup>OpportunityRadar<sup className="tm">®</sup>
          </>
        }
        description="Everything happening around the business — demand shifts, competitor moves, and openings worth a week of attention."
      />

      {w.isDemo ? <DemoNotice /> : null}

      {w.opportunities.some((o) => o.atCeiling) ? (
        <p className="mb-6 rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--warning-soft)] px-4 py-2.5 text-[0.8125rem] leading-relaxed text-[var(--warning)]">
          <strong className="font-semibold">
            {w.opportunities.filter((o) => o.atCeiling).length} of {w.opportunities.length}{' '}
            opportunities score above the scale.
          </strong>{' '}
          The scoring model&rsquo;s value factor was calibrated for smaller deals, so these read
          100/100 whatever else they score on. They are still ranked correctly — ordering uses the
          unclamped score — but the number on the card has stopped separating them.
        </p>
      ) : null}

      <StatGrid className="mb-6">
        <Stat label="Opportunities" value={count(w.pipeline.total)} />
        <Stat label="Active" value={count(w.pipeline.active)} tone="positive" />
        <Stat label="Evaluating" value={count(w.pipeline.evaluating)} />
        <Stat label="Planning" value={count(w.pipeline.planning)} />
        <Stat
          label="Total est. value"
          value={money(w.pipeline.totalEstValue, currency)}
          tone="brand"
          className="col-span-2"
        />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-[20rem_1fr] [&>*]:min-w-0">
        <Card className="self-start">
          <CardHeader title="The radar" subtitle="Urgency by distance, value by size" />
          <CardBody>
            <OpportunityDial opportunities={w.opportunities} />
            <ul className="mt-4 space-y-1.5 border-t border-[var(--border)] pt-3">
              {(['HIGH', 'MEDIUM', 'MONITOR'] as const).map((c) => (
                <li key={c} className="flex items-center gap-2 text-[0.75rem]">
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{
                      background:
                        c === 'HIGH'
                          ? 'var(--positive)'
                          : c === 'MEDIUM'
                            ? 'var(--info)'
                            : 'var(--text-tertiary)',
                    }}
                  />
                  <span className="text-[var(--text-secondary)]">
                    {c} — {c === 'HIGH' ? 'scores above 60' : c === 'MEDIUM' ? 'scores 41–60' : 'scores 40 and below'}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <div className="min-w-0 space-y-4">
          {w.opportunities.map((o) => (
            <Card key={o.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow">
                    {o.id} · {o.category} · via {o.source}
                  </p>
                  <h3 className="font-display mt-1 text-[1rem] font-semibold text-[var(--text-primary)]">
                    {o.title}
                  </h3>
                  <p className="numeric mt-1 text-[0.8125rem] text-[var(--text-secondary)]">
                    {money(o.estValue, currency)} · {percent(o.probability, 0)} probability ·{' '}
                    {o.owner} · identified {date(o.date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="numeric text-[1.5rem] leading-none font-semibold text-[var(--text-primary)]">
                    {score(o.score, 0)}
                    <span className="text-[0.875rem] text-[var(--text-tertiary)]">/100</span>
                  </p>
                  <Badge tone={OPPORTUNITY_TONE[o.classification]} className="mt-1.5">
                    {o.classification}
                  </Badge>
                  {/*
                    Two cards both reading 100 are not equally attractive — they
                    are both off the top of a scale built for smaller deals. The
                    unclamped figure is what ranks them, so it is shown.
                  */}
                  {o.atCeiling ? (
                    <p
                      className="numeric mt-1 text-[0.6875rem] whitespace-nowrap text-[var(--warning)]"
                      title="The unclamped score exceeded 100. Ranking uses the unclamped figure."
                    >
                      at ceiling · raw {score(o.rawScore, 1)}
                    </p>
                  ) : null}
                </div>
              </div>

              <details className="mt-3 border-t border-[var(--border)] pt-3">
                <summary className="cursor-pointer text-[0.8125rem] font-medium text-[var(--brand)]">
                  How this score was reached
                </summary>
                <TableWrap className="mt-3">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Factor</Th>
                        <Th numeric>Weight</Th>
                        <Th numeric>Points</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {opportunityFactors(o).map((f) => (
                        <tr key={f.factor}>
                          <Td>
                            {f.factor}
                            {f.note ? (
                              <span className="mt-0.5 block text-[0.75rem] text-[var(--text-tertiary)]">
                                {f.note}
                              </span>
                            ) : null}
                          </Td>
                          <Td numeric>{percent(f.weight, 0)}</Td>
                          <Td numeric>{f.contribution.toFixed(1)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
                <p className="mt-2 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
                  Reported scores are capped at 100. The value factor is unbounded in the source
                  model — {money(VALUE_ONLY_CEILING, currency)} of estimated value reaches the
                  ceiling on value alone — so ranking uses the unclamped score rather than the
                  capped one, and opportunities at the ceiling still have an order.
                </p>
              </details>
            </Card>
          ))}

          {w.opportunities.length === 0 ? (
            <Card>
              <CardBody className="py-10 text-center text-[0.875rem] text-[var(--text-secondary)]">
                No opportunities are on the radar yet.
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Opportunity database" subtitle="Every field the scoring engine reads" />
        <TableWrap className="rounded-t-none border-0 border-t">
          <Table>
            <thead>
              <tr>
                <Th>ID</Th>
                <Th>Opportunity</Th>
                <Th>Category</Th>
                <Th numeric>Est. value</Th>
                <Th numeric>Prob.</Th>
                <Th numeric>Fit</Th>
                <Th numeric>Urgency</Th>
                <Th numeric>Effort</Th>
                <Th>Owner</Th>
                <Th>Status</Th>
                <Th numeric>Score</Th>
              </tr>
            </thead>
            <tbody>
              {w.opportunities.map((o) => (
                <tr key={o.id}>
                  <Td className="numeric whitespace-nowrap">{o.id}</Td>
                  <Td className="min-w-[16rem]">{o.title}</Td>
                  <Td className="whitespace-nowrap">{o.category}</Td>
                  <Td numeric>{money(o.estValue, currency)}</Td>
                  <Td numeric>{percent(o.probability, 0)}</Td>
                  <Td numeric>{percent(o.strategicFit, 0)}</Td>
                  <Td numeric>{percent(o.urgency, 0)}</Td>
                  <Td numeric>{percent(o.effort, 0)}</Td>
                  <Td className="whitespace-nowrap">{o.owner}</Td>
                  <Td className="whitespace-nowrap">{o.status}</Td>
                  <Td numeric>{score(o.score, 0)}</Td>
                </tr>
              ))}
              {w.opportunities.length === 0 ? (
                <EmptyRow colSpan={11}>Nothing in the database yet.</EmptyRow>
              ) : null}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </>
  );
}

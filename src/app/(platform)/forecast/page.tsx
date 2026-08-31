import type { Metadata } from 'next';
import { Card, CardHeader } from '@/components/ui/card';
import { DemoNotice, PageHeader } from '@/components/ui/page-header';
import { Table, TableWrap, Td, Th, TotalRow } from '@/components/ui/table';
import { compactMoney, money, signedPercent } from '@/lib/format';
import { loadWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Forecast' };

/**
 * FORECAST — projections on the year-to-date monthly average.
 *
 * The workbook's own banner reads "FORECAST — NOT GUARANTEED. Forecasts use YTD
 * averages. Do not present as guaranteed results." That warning is reproduced
 * at the top of the page rather than in a footnote, because a forecast table
 * that looks like the actuals table is exactly how a projection gets quoted as
 * a commitment.
 */
export default function ForecastPage() {
  const w = loadWorkspace();
  const currency = w.profile.currency;

  const totals = w.forecast.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      grossProfit: acc.grossProfit + r.grossProfit,
      netProfit: acc.netProfit + r.netProfit,
      revenueTarget: acc.revenueTarget + r.revenueTarget,
    }),
    { revenue: 0, grossProfit: 0, netProfit: 0, revenueTarget: 0 },
  );

  return (
    <>
      <PageHeader
        eyebrow="Projection"
        title="Forecast"
        description="Revenue, gross profit and net profit projected forward on the year-to-date monthly average."
      />

      <p className="mb-6 rounded-[var(--radius-tile)] border border-[var(--negative)] bg-[var(--negative-soft)] px-4 py-3 text-[0.8125rem] leading-relaxed text-[var(--negative)]">
        <strong className="font-semibold">Forecast — not guaranteed.</strong> These figures are
        arithmetic on the {w.ytd.monthsReported}-month year-to-date average, not a commitment and
        not a prediction of demand. Do not present them as guaranteed results. Update with actuals
        each month.
      </p>

      {w.isDemo ? <DemoNotice /> : null}

      <Card>
        <CardHeader
          title="Revenue and profit forecast"
          subtitle={`Basis: year-to-date average across ${w.ytd.monthsReported} reported months, with the workbook's growth ladder applied`}
        />
        <TableWrap className="rounded-t-none border-0 border-t">
          <Table>
            <thead>
              <tr>
                <Th>Period</Th>
                <Th>Basis</Th>
                <Th numeric>Revenue forecast</Th>
                <Th numeric>Gross profit</Th>
                <Th numeric>Net profit</Th>
                <Th numeric>Revenue target</Th>
                <Th numeric>Vs target</Th>
              </tr>
            </thead>
            <tbody>
              {w.forecast.map((r) => (
                <tr key={r.period}>
                  <Td className="whitespace-nowrap">{r.period}</Td>
                  <Td className="numeric whitespace-nowrap text-[var(--text-secondary)]">
                    {r.basis}
                  </Td>
                  <Td numeric>{money(r.revenue, currency)}</Td>
                  <Td numeric>{money(r.grossProfit, currency)}</Td>
                  <Td numeric>{money(r.netProfit, currency)}</Td>
                  <Td numeric>{money(r.revenueTarget, currency)}</Td>
                  <Td
                    numeric
                    className={r.vsTarget < 0 ? 'text-[var(--negative)]' : 'text-[var(--positive)]'}
                  >
                    {signedPercent(r.vsTarget)}
                  </Td>
                </tr>
              ))}

              <TotalRow>
                <Td>Period total</Td>
                <Td />
                <Td numeric>{money(totals.revenue, currency)}</Td>
                <Td numeric>{money(totals.grossProfit, currency)}</Td>
                <Td numeric>{money(totals.netProfit, currency)}</Td>
                <Td numeric>{money(totals.revenueTarget, currency)}</Td>
                <Td numeric>
                  {totals.revenueTarget === 0
                    ? '—'
                    : signedPercent(totals.revenue / totals.revenueTarget - 1)}
                </Td>
              </TotalRow>
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <p className="mt-4 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        Annual revenue target {compactMoney(w.profile.revenueTargetAnnual, currency)}, divided
        evenly across twelve months. A business with real seasonality should replace that even
        split with its own phasing before reading the variance column.
      </p>
    </>
  );
}

import type { Metadata } from 'next';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DemoNotice, PageHeader } from '@/components/ui/page-header';
import { Stat, StatGrid } from '@/components/ui/stat';
import { EmptyRow, Table, TableWrap, Td, Th, TotalRow } from '@/components/ui/table';
import { RevenueChart } from '@/components/intelligence/revenue-chart';
import { isReported } from '@/lib/intelligence/finance';
import { compactMoney, count, money, percent } from '@/lib/format';
import { loadWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Financial Intelligence' };

/**
 * FINANCIAL_INTELLIGENCE — the monthly performance table, with its year-to-date
 * summary above it.
 *
 * Months with no data are shown greyed rather than omitted, so the shape of the
 * year is visible: eight reported months out of twelve is itself information,
 * and a table that silently stops at August looks like a table that broke.
 */
export default function FinancialPage() {
  const w = loadWorkspace();
  const currency = w.profile.currency;

  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Financial Intelligence"
        description={`${w.profile.companyName} · ${w.profile.fiscalYearStart} fiscal year start · figures in ${currency}`}
      />

      {w.isDemo ? <DemoNotice /> : null}

      <StatGrid className="mb-6">
        <Stat label="Total revenue" value={compactMoney(w.ytd.revenue, currency)} sub="YTD" />
        <Stat label="Gross profit" value={compactMoney(w.ytd.grossProfit, currency)} sub={percent(w.ytd.grossMargin)} />
        <Stat label="Net profit" value={compactMoney(w.ytd.netProfit, currency)} sub={percent(w.ytd.netMargin)} />
        <Stat label="OpEx YTD" value={compactMoney(w.ytd.opex, currency)} />
        <Stat
          label="Gross margin"
          value={percent(w.ytd.grossMargin)}
          sub={`Target ${percent(w.profile.grossMarginTarget, 0)}`}
          tone={w.ytd.grossMargin >= w.profile.grossMarginTarget ? 'positive' : 'warning'}
        />
        <Stat
          label="Net cash YTD"
          value={compactMoney(w.ytd.netCash, currency)}
          tone={w.ytd.netCash >= 0 ? 'positive' : 'negative'}
        />
      </StatGrid>

      <Card className="mb-6">
        <CardHeader title="Revenue trend" subtitle="Reported months only" />
        <CardBody>
          <RevenueChart months={w.months} currency={currency} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Monthly performance"
          subtitle={`${w.ytd.monthsReported} of ${w.months.length} months reported`}
        />
        <TableWrap className="rounded-t-none border-0 border-t">
          <Table>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th numeric>Revenue</Th>
                <Th numeric>COGS</Th>
                <Th numeric>Gross profit</Th>
                <Th numeric>Gross %</Th>
                <Th numeric>OpEx</Th>
                <Th numeric>Net profit</Th>
                <Th numeric>Net %</Th>
                <Th numeric>Cash in</Th>
                <Th numeric>Cash out</Th>
                <Th numeric>Net cash</Th>
                <Th numeric>New cust.</Th>
              </tr>
            </thead>
            <tbody>
              {w.months.map((m) => {
                const reported = isReported(m);
                return (
                  <tr key={m.month} className={reported ? '' : 'text-[var(--text-tertiary)]'}>
                    <Td className="whitespace-nowrap">{m.month}</Td>
                    {reported ? (
                      <>
                        <Td numeric>{money(m.revenue, currency)}</Td>
                        <Td numeric>{money(m.cogs, currency)}</Td>
                        <Td numeric>{money(m.grossProfit, currency)}</Td>
                        <Td numeric>{percent(m.grossMargin)}</Td>
                        <Td numeric>{money(m.opex, currency)}</Td>
                        <Td numeric>{money(m.netProfit, currency)}</Td>
                        <Td numeric>{percent(m.netMargin)}</Td>
                        <Td numeric>{money(m.cashIn, currency)}</Td>
                        <Td numeric>{money(m.cashOut, currency)}</Td>
                        <Td numeric className={m.netCash < 0 ? 'text-[var(--negative)]' : ''}>
                          {money(m.netCash, currency)}
                        </Td>
                        <Td numeric>{count(m.newCustomers)}</Td>
                      </>
                    ) : (
                      <Td colSpan={11} className="text-[0.75rem] italic">
                        Not yet reported
                      </Td>
                    )}
                  </tr>
                );
              })}

              {w.ytd.monthsReported > 0 ? (
                <TotalRow>
                  <Td>Year to date</Td>
                  <Td numeric>{money(w.ytd.revenue, currency)}</Td>
                  <Td numeric>{money(w.ytd.cogs, currency)}</Td>
                  <Td numeric>{money(w.ytd.grossProfit, currency)}</Td>
                  <Td numeric>{percent(w.ytd.grossMargin)}</Td>
                  <Td numeric>{money(w.ytd.opex, currency)}</Td>
                  <Td numeric>{money(w.ytd.netProfit, currency)}</Td>
                  <Td numeric>{percent(w.ytd.netMargin)}</Td>
                  <Td numeric>{money(w.ytd.cashIn, currency)}</Td>
                  <Td numeric>{money(w.ytd.cashOut, currency)}</Td>
                  <Td numeric>{money(w.ytd.netCash, currency)}</Td>
                  <Td numeric>{count(w.ytd.newCustomers)}</Td>
                </TotalRow>
              ) : (
                <EmptyRow colSpan={12}>No months have been reported yet.</EmptyRow>
              )}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </>
  );
}

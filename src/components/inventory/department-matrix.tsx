import { Badge, type Tone } from '@/components/ui/badge';
import { Table, TableWrap, Td, Th, TotalRow } from '@/components/ui/table';
import type { DepartmentRisk, DepartmentRow } from '@/lib/intelligence/inventory';
import { percent } from '@/lib/format';

const RISK_TONE: Readonly<Record<DepartmentRisk, Tone>> = {
  'ACTION NEEDED': 'negative',
  'REVIEW DORMANCY': 'warning',
  HEALTHY: 'positive',
};

/**
 * The department stock health matrix — DEPT SUMMARY and STOCK REPORT section D.
 *
 * Departments holding nothing are shown rather than dropped. On a compliance
 * record "we hold nothing here" and "we did not look here" must not render
 * identically, and a matrix that quietly omits nine of its rows is the second
 * one wearing the first one's clothes. Their compliance cell reads "—" rather
 * than the workbook's 0%, because a department holding no stock is not failing.
 */
export function DepartmentMatrix({
  departments,
}: {
  departments: { rows: DepartmentRow[]; total: DepartmentRow };
}) {
  const { rows, total } = departments;

  return (
    <TableWrap className="rounded-t-none border-0 border-t">
      <Table>
        <thead>
          <tr>
            <Th>Department</Th>
            <Th numeric>Total</Th>
            <Th numeric>Expired</Th>
            <Th numeric>Critical</Th>
            <Th numeric>Warning</Th>
            <Th numeric>Clear</Th>
            <Th numeric>Compliance</Th>
            <Th numeric>Dormant</Th>
            <Th>Risk assessment</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.department} className={r.total === 0 ? 'text-[var(--text-tertiary)]' : ''}>
              <Td className="whitespace-nowrap">{r.department}</Td>
              <Td numeric>{r.total}</Td>
              <Td numeric className={r.expired > 0 ? 'text-[var(--negative)]' : ''}>
                {r.expired}
              </Td>
              <Td numeric className={r.critical > 0 ? 'text-[var(--warning)]' : ''}>
                {r.critical}
              </Td>
              <Td numeric>{r.warning}</Td>
              <Td numeric>{r.clear}</Td>
              <Td numeric>{r.total === 0 ? '—' : percent(r.complianceRate, 0)}</Td>
              <Td numeric>{r.dormantItems}</Td>
              <Td>
                {r.total === 0 ? (
                  <span className="text-[0.75rem]">No stock held</span>
                ) : (
                  <Badge tone={RISK_TONE[r.risk]}>{r.risk}</Badge>
                )}
              </Td>
            </tr>
          ))}

          <TotalRow>
            <Td>TOTAL</Td>
            <Td numeric>{total.total}</Td>
            <Td numeric>{total.expired}</Td>
            <Td numeric>{total.critical}</Td>
            <Td numeric>{total.warning}</Td>
            <Td numeric>{total.clear}</Td>
            <Td numeric>{total.total === 0 ? '—' : percent(total.complianceRate, 0)}</Td>
            <Td numeric>{total.dormantItems}</Td>
            <Td>
              <Badge tone={RISK_TONE[total.risk]}>{total.risk}</Badge>
            </Td>
          </TotalRow>
        </tbody>
      </Table>
    </TableWrap>
  );
}

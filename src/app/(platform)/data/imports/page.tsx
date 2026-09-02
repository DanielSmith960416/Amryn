import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatRelative, humanise } from '@/lib/utils/format';
import type { Enums } from '@/types/database';

export const metadata: Metadata = { title: 'Data Imports' };

const IMPORT_TONE: Record<Enums['import_status'], 'positive' | 'negative' | 'info' | 'warning' | 'neutral'> = {
  complete: 'positive',
  failed: 'negative',
  importing: 'info',
  validating: 'info',
  mapping: 'warning',
  uploaded: 'warning',
  ready: 'info',
};

/** Import history (specification §22): upload, map, validate, preview, import. */
export default async function DataImportsPage() {
  const workspace = await requirePermission('view_data_sources');
  const supabase = await createClient();

  const { data: imports } = await supabase
    .from('data_imports')
    .select('*')
    .eq('organisation_id', workspace.organisation.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = imports ?? [];

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Data Imports"
        description="Every file that has been brought into Amryn, and what happened to each row."
      />

      <Card>
        <CardHeader
          title="Import history"
          subtitle="Upload, column mapping, validation, preview, import, analysis"
        />
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing imported yet"
            description="Amryn accepts CSV and Excel files, mapping your columns onto its metrics. Rows that fail validation are reported rather than silently dropped."
          />
        ) : (
          <div className="overflow-x-auto border-t border-[var(--border)]">
            <table className="w-full text-left text-[0.8125rem]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['File', 'Status', 'Rows', 'Imported', 'Rejected', 'When'].map((heading) => (
                    <th
                      key={heading}
                      className="eyebrow px-5 py-2.5 !mb-0 font-normal whitespace-nowrap"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-[var(--card-inset)]">
                    <td className="px-5 py-3 font-medium text-[var(--text-primary)]">
                      {row.filename ?? 'Untitled'}
                      {row.error_message ? (
                        <p className="mt-0.5 text-[0.75rem] font-normal text-[var(--negative)]">
                          {row.error_message}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={IMPORT_TONE[row.status]}>{humanise(row.status)}</Badge>
                    </td>
                    <td className="numeric px-5 py-3 text-[var(--text-secondary)]">
                      {row.row_count}
                    </td>
                    <td className="numeric px-5 py-3 text-[var(--positive)]">{row.rows_imported}</td>
                    <td
                      className={
                        'numeric px-5 py-3 ' +
                        (row.rows_rejected > 0
                          ? 'text-[var(--negative)]'
                          : 'text-[var(--text-tertiary)]')
                      }
                    >
                      {row.rows_rejected}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-[var(--text-secondary)]">
                      {formatRelative(row.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

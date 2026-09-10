import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatRelative, humanise } from '@/lib/utils/format';
import { describeBytes } from '@/lib/files/kinds';
import { UploadForm } from '@/features/data/upload-form';
import { RemoveButton } from '@/features/data/remove-button';
import type { Enums } from '@/types/database';

export const metadata: Metadata = { title: 'Files and imports' };

export const dynamic = 'force-dynamic';

const IMPORT_TONE: Record<Enums['import_status'], 'positive' | 'negative' | 'info' | 'warning' | 'neutral'> = {
  complete: 'positive',
  failed: 'negative',
  importing: 'info',
  validating: 'info',
  mapping: 'warning',
  uploaded: 'warning',
  ready: 'info',
};

/**
 * Files, and what became of them.
 *
 * This page used to be a history table and nothing else, while /data linked to
 * it with a button reading "Import a file". There was no import on it. The
 * promise was made in one place and kept in none, which is the whole of what
 * was reported.
 *
 * It now has three parts, in the order somebody actually needs them: put a
 * file in, see the files that are in, see what happened to the rows of the
 * ones that had rows.
 */
export default async function DataImportsPage() {
  const workspace = await requirePermission('view_data_sources');
  const supabase = await createClient();

  const [documents, imports] = await Promise.all([
    supabase
      .from('data_documents')
      .select('*')
      .eq('organisation_id', workspace.organisation.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('data_imports')
      .select('*')
      .eq('organisation_id', workspace.organisation.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const files = documents.data ?? [];
  const rows = imports.data ?? [];
  const mayUpload = workspace.permissions.has('import_data');

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Files and imports"
        description="Anything you give Amryn directly, rather than through a connected system. Spreadsheets have their rows read; everything else is stored and given back when you ask for it."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader
              title={`Files (${files.length})`}
              subtitle="Newest first. Removing one deletes the file itself, not just the entry."
            />
            {files.length === 0 ? (
              <EmptyState
                title="Nothing uploaded yet"
                description="A PDF, a spreadsheet, a scanned delivery note — whatever the business actually holds. Amryn keeps it and reads the rows of anything that has rows."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {files.map((file) => (
                  <li key={file.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/data/documents/${file.id}`}
                          className="truncate text-[0.9375rem] font-medium text-[var(--text-primary)] underline underline-offset-2"
                        >
                          {file.filename}
                        </Link>
                        {/*
                          The two states, said in the list rather than only at
                          the moment of upload. A page that showed a folder of
                          PDFs under a heading about analysis would be claiming
                          work nobody did.
                        */}
                        <Badge tone={file.handling === 'table' ? 'positive' : 'neutral'}>
                          {file.handling === 'table' ? 'Rows read' : 'Held, not read'}
                        </Badge>
                      </div>

                      {file.note ? (
                        <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">{file.note}</p>
                      ) : null}

                      {file.handling === 'table' && file.row_count > 0 ? (
                        <p className="mt-1 text-[0.75rem] text-[var(--text-tertiary)]">
                          {file.row_count.toLocaleString('en-ZA')}{' '}
                          {file.row_count === 1 ? 'row' : 'rows'}
                          {file.columns_found.length > 0
                            ? ` · ${file.columns_found.slice(0, 6).join(', ')}${file.columns_found.length > 6 ? '…' : ''}`
                            : ''}
                          {file.sheet_names.length > 1
                            ? ` · first of ${file.sheet_names.length} sheets`
                            : ''}
                        </p>
                      ) : null}

                      {file.read_error ? (
                        <p className="mt-1 text-[0.75rem] leading-relaxed text-[var(--warning)]">
                          We tried to read its rows and could not: {file.read_error} The file is
                          kept exactly as you sent it.
                        </p>
                      ) : null}
                    </div>

                    <div className="text-right">
                      <p className="text-[0.75rem] text-[var(--text-secondary)]">
                        {describeBytes(Number(file.byte_size))}
                      </p>
                      <p className="text-[0.6875rem] text-[var(--text-tertiary)]">
                        {formatRelative(file.created_at)}
                      </p>
                      {mayUpload ? (
                        <div className="mt-1">
                          <RemoveButton id={file.id} filename={file.filename} />
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Import history"
              subtitle="Rows brought into Amryn's own tables — upload, column mapping, validation, preview, import."
            />
            {rows.length === 0 ? (
              <EmptyState
                title="Nothing imported yet"
                description="Uploading a spreadsheet keeps it and reads its columns. Turning those rows into stock lines is done from Import a stocktake."
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
                        <td className="numeric px-5 py-3 text-[var(--positive)]">
                          {row.rows_imported}
                        </td>
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
        </div>

        <div className="space-y-5">
          {mayUpload ? (
            <Card>
              <CardHeader title="Upload a file" />
              <CardBody>
                <UploadForm />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="What happens to it" />
            <CardBody className="space-y-3 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
              <p>
                <strong className="text-[var(--text-primary)]">A spreadsheet is read.</strong> Excel
                or CSV: we record its sheets, its column headings and how many rows it has, so what
                is in it can be used.
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Everything else is kept.</strong> A
                PDF, a contract, a photograph — stored, listed, and handed back when you ask for
                it. Nobody has read it and nothing has been concluded from it. If a page ever
                suggests otherwise, that is a bug worth reporting.
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Turning rows into records.</strong>{' '}
                Uploading a stock count keeps the file; making it a stocktake is a separate,
                deliberate act on{' '}
                <Link href="/inventory/import" className="underline underline-offset-2">
                  Import a stocktake
                </Link>
                .
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Where it lives.</strong> Encrypted
                at rest with your organisation&rsquo;s other data, in the European Union — see{' '}
                <Link href="/legal/privacy" className="underline underline-offset-2">
                  the privacy notice
                </Link>{' '}
                for what that means. Only members of your organisation can reach it, and links to a
                file expire five minutes after they are made.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatRelative } from '@/lib/utils/format';
import { describeBytes, extensionOf, kindOf } from '@/lib/files/kinds';

export const metadata: Metadata = { title: 'File' };

export const dynamic = 'force-dynamic';

/**
 * One file: what it is, what came out of it, and the thing itself.
 *
 * The list can say a PDF has 4,300 words in it. Only this page can show them,
 * and showing them is the difference between "we extracted the text" being a
 * claim and being something a person can check. If the extraction is wrong —
 * a two-column layout read across the columns, a scan that produced nothing —
 * this is where that becomes obvious, which is the point.
 */
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const workspace = await requirePermission('view_data_sources');
  const { id } = await params;

  const supabase = await createClient();
  const { data: document } = await supabase
    .from('data_documents')
    .select('*')
    .eq('id', id)
    .eq('organisation_id', workspace.organisation.id)
    .maybeSingle();

  if (!document) notFound();

  // Fetched only here. The list page never touches this table, which is the
  // whole reason migration 38 put the text somewhere else.
  const { data: extracted } = await supabase
    .from('data_document_text')
    .select('content')
    .eq('document_id', document.id)
    .maybeSingle();

  const extension = extensionOf(document.filename);
  const kind = kindOf(document.filename);
  const isPdf = extension === '.pdf';
  const isImage = ['.png', '.jpg', '.jpeg'].includes(extension);

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title={document.filename}
        description={
          [
            kind?.label ?? 'File',
            describeBytes(Number(document.byte_size)),
            document.page_count > 0
              ? `${document.page_count} ${isPdf ? (document.page_count === 1 ? 'page' : 'pages') : document.page_count === 1 ? 'slide' : 'slides'}`
              : null,
            `uploaded ${formatRelative(document.created_at)}`,
          ]
            .filter(Boolean)
            .join(' · ')
        }
        actions={
          <div className="flex items-center gap-3">
            <Button asChild variant="secondary" size="sm">
              <a href={`/data/documents/${document.id}/file?download=1`}>Download</a>
            </Button>
            <Link
              href="/data/imports"
              className="text-[0.8125rem] text-[var(--text-secondary)] underline underline-offset-2"
            >
              All files
            </Link>
          </div>
        }
      />

      {document.note ? (
        <Card className="mb-5">
          <CardBody className="text-[0.875rem] text-[var(--text-secondary)]">{document.note}</CardBody>
        </Card>
      ) : null}

      {document.read_error ? (
        <Card tone="warning" className="mb-5">
          <CardBody className="text-[0.875rem] leading-relaxed text-[var(--text-primary)]">
            {document.read_error}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="The file"
            subtitle={
              isPdf || isImage
                ? 'As it is. Nothing here is reconstructed.'
                : 'This kind of file cannot be shown in a page.'
            }
          />
          {isPdf ? (
            /*
             * The browser's own PDF viewer, pointed at the signed link.
             *
             * No renderer is shipped to do this. Every browser has one, it is
             * better than anything that would be written here, and a page that
             * re-drew the document would be showing an interpretation of the
             * file rather than the file — which is exactly the wrong thing
             * when somebody is checking a contract.
             */
            <iframe
              src={`/data/documents/${document.id}/file`}
              title={document.filename}
              className="h-[36rem] w-full border-t border-[var(--border)] bg-[var(--card-inset)]"
            />
          ) : isImage ? (
            <div className="border-t border-[var(--border)] bg-[var(--card-inset)] p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- a private
                  signed URL behind a redirect, which the image optimiser
                  cannot fetch and must not cache. */}
              <img
                src={`/data/documents/${document.id}/file`}
                alt={document.note !== '' ? document.note : document.filename}
                className="mx-auto max-h-[36rem] w-auto"
              />
            </div>
          ) : (
            <CardBody className="space-y-3 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
              <p>
                A browser cannot display {kind?.label ?? (extension || 'this format')} in a page.
                Download it and open it in the program that made it.
              </p>
              <Button asChild variant="secondary" size="sm">
                <a href={`/data/documents/${document.id}/file?download=1`}>Download {document.filename}</a>
              </Button>
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader
            title="What was read out of it"
            subtitle={
              document.handling === 'table'
                ? `${document.row_count.toLocaleString('en-ZA')} rows across ${document.columns_found.length} columns`
                : document.handling === 'text'
                  ? `${document.text_chars.toLocaleString('en-ZA')} characters${document.text_truncated ? ', cut at the limit' : ''}`
                  : 'Nothing — this file is kept as it is'
            }
          />

          {document.handling === 'table' ? (
            <CardBody className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {document.columns_found.map((column) => (
                  <Badge key={column} tone="outline">
                    {column}
                  </Badge>
                ))}
              </div>
              {document.sheet_names.length > 1 ? (
                <p className="text-[0.8125rem] text-[var(--text-tertiary)]">
                  Read from the first of {document.sheet_names.length} sheets:{' '}
                  {document.sheet_names.join(', ')}.
                </p>
              ) : null}
              <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                Turning these rows into stock lines is a separate, deliberate act on{' '}
                <Link href="/inventory/import" className="underline underline-offset-2">
                  Import a stocktake
                </Link>
                .
              </p>
            </CardBody>
          ) : extracted?.content ? (
            <>
              <div className="max-h-[32rem] overflow-y-auto border-t border-[var(--border)] bg-[var(--card-inset)]">
                <pre className="px-5 py-4 text-[0.8125rem] leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)]">
                  {extracted.content}
                </pre>
              </div>
              <CardBody className="border-t border-[var(--border)]">
                <p className="text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
                  These are the words in the file, extracted so they can be searched and quoted.
                  Nobody has read them and nothing has been concluded from them — no term noted,
                  no figure taken. Layout is lost in extraction, so a table or a two-column page
                  will read out of order here while being perfectly correct in the file above.
                </p>
              </CardBody>
            </>
          ) : (
            <CardBody className="text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
              {document.read_error
                ? 'The reason is above. The file itself is unaffected and can be downloaded.'
                : 'Amryn has no reader for this kind of file, so it is stored and given back rather than read.'}
            </CardBody>
          )}
        </Card>
      </div>
    </>
  );
}

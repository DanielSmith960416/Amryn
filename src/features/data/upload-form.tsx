'use client';

import { useActionState, useState, type ChangeEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/field';
import {
  describeBytes,
  extensionOf,
  hasText,
  isRefused,
  isTable,
  kindOf,
  MAX_DOCUMENT_BYTES,
  sizeLimitFor,
} from '@/lib/files/kinds';
import { uploadDocument, type UploadState } from './documents';

/**
 * The control that takes any file.
 *
 * No `accept` filter on purpose. Every other file input in the application
 * narrows what the picker will show, because each of them feeds something that
 * can only read one shape. This one exists to take whatever a business
 * actually has, and a filter here would recreate the fault it was built to
 * fix — a person unable to select the file in front of them, with nothing on
 * screen explaining why.
 *
 * What the file is gets said back to them instead, before they send it.
 */
export function UploadForm() {
  const [state, action] = useActionState(uploadDocument, { status: 'idle' } as UploadState);
  const [chosen, setChosen] = useState<{ name: string; size: number } | null>(null);

  const inspect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    setChosen(file ? { name: file.name, size: file.size } : null);
  };

  const verdict = chosen ? describe(chosen) : null;

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="document">The file</Label>
        <input
          id="document"
          name="file"
          type="file"
          required
          onChange={inspect}
          className="block w-full text-[0.875rem] text-[var(--text-secondary)] file:mr-3 file:rounded-[var(--radius-field)] file:border-0 file:bg-[var(--brand)] file:px-3 file:py-2 file:text-[0.8125rem] file:font-medium file:text-[var(--on-brand)]"
        />
        <p className="mt-1.5 text-[0.75rem] text-[var(--text-tertiary)]">
          Up to {describeBytes(MAX_DOCUMENT_BYTES)}. Programs and installers are refused.
        </p>
      </div>

      {verdict ? (
        <p
          className={
            'rounded-lg px-3 py-2 text-[0.8125rem] leading-relaxed ' +
            (verdict.blocked
              ? 'bg-[var(--card-inset)] text-[var(--negative)]'
              : 'bg-[var(--card-inset)] text-[var(--text-secondary)]')
          }
        >
          {verdict.text}
        </p>
      ) : null}

      <div>
        <Label htmlFor="note">What is it (optional)</Label>
        <Textarea
          id="note"
          name="note"
          rows={2}
          maxLength={2000}
          placeholder="August bank statement — Standard Bank, current account"
        />
      </div>

      {state.status === 'error' ? (
        <p role="alert" className="text-[0.8125rem] leading-relaxed text-[var(--negative)]">
          {state.message}
        </p>
      ) : null}

      {state.status === 'stored' ? (
        <div role="status" className="space-y-1">
          <p className="text-[0.8125rem] text-[var(--positive)]">{state.filename} stored.</p>
          <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
            {state.handling === 'table'
              ? `We read ${state.rowCount.toLocaleString('en-ZA')} ${state.rowCount === 1 ? 'row' : 'rows'}` +
                (state.columns.length > 0 ? ` across ${state.columns.length} columns.` : '.')
              : state.handling === 'text'
                ? `We extracted ${state.textChars.toLocaleString('en-ZA')} characters` +
                  (state.pages > 0 ? ` from ${state.pages} ${state.pages === 1 ? 'page' : 'pages'}.` : '.') +
                  ' Having the words is not the same as understanding them — open the file to see exactly what was read.'
                : state.scanned
                  ? 'That is a scan, so there is nothing in the file to lift out. A worker is reading the pages with character recognition now — refresh the file in a moment to see what it found.'
                  : state.readError
                    ? state.readError
                    : 'It is kept as it is — Amryn has not read what is inside it.'}
          </p>

          {/*
            The correction that has to happen here, not later.

            A spreadsheet dropped on this page is filed and its rows counted.
            It does not reach financial_records, sales_records or any other
            table a dashboard reads — that is the workbook importer's job, and
            this page has no way to know whether somebody wanted a file kept or
            their figures on screen.

            Saying nothing is the expensive silence. Somebody uploads their
            management pack here, sees "we read 210 rows", goes to the Command
            Centre and finds it empty, and concludes the product is broken. The
            upload worked exactly as designed and the person was never told
            what it was designed to do.
          */}
          {state.handling === 'table' ? (
            <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
              Those rows are kept as a file — they do not appear on the Command
              Centre or the financial screens. To put a workbook&rsquo;s figures
              behind your dashboards, use{' '}
              <a
                href="/data"
                className="text-[var(--brand)] underline underline-offset-2"
              >
                Import a workbook
              </a>{' '}
              on Connected Sources.
            </p>
          ) : null}

          <a
            href={`/data/documents/${state.id}`}
            className="inline-block text-[0.75rem] text-[var(--brand)] underline underline-offset-2"
          >
            Open it
          </a>
        </div>
      ) : null}

      <Submit blocked={verdict?.blocked ?? false} />
    </form>
  );
}

/**
 * What will happen to this file, said before it is sent.
 *
 * Checked in the browser as well as on the server, and not for politeness: a
 * body over the framework's limit is refused before the action runs, so the
 * server's own message about size is unreachable for exactly the files that
 * need it.
 */
function describe(file: { name: string; size: number }): { text: string; blocked: boolean } {
  if (isRefused(file.name)) {
    return {
      text: `${extensionOf(file.name)} files are programs rather than records, and Amryn does not store them.`,
      blocked: true,
    };
  }

  const ceiling = sizeLimitFor(file.name);
  if (file.size > ceiling) {
    return {
      text: `That file is ${describeBytes(file.size)}, and the limit is ${describeBytes(ceiling)}.`,
      blocked: true,
    };
  }

  const kind = kindOf(file.name);
  const label = kind ? kind.label : `${extensionOf(file.name) || 'That'} file`;

  if (isTable(file.name)) {
    return {
      text: `${label}, ${describeBytes(file.size)}. Its columns and rows will be read.`,
      blocked: false,
    };
  }

  if (hasText(file.name)) {
    return {
      text:
        `${label}, ${describeBytes(file.size)}. The words in it will be extracted so they can be ` +
        'searched — which is not the same as anybody reading it. A scan has no words in it and will say so.',
      blocked: false,
    };
  }

  return {
    text: `${label}, ${describeBytes(file.size)}. It will be stored and given back when you ask for it. Amryn will not read what is inside it.`,
    blocked: false,
  };
}

function Submit({ blocked }: { blocked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending || blocked}>
      {pending ? 'Uploading…' : 'Upload'}
    </Button>
  );
}

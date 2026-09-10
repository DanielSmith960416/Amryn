'use client';

import { useActionState, useState, type ChangeEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/field';
import {
  describeBytes,
  extensionOf,
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
        <p className="mt-1.5 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
          Anything up to {describeBytes(MAX_DOCUMENT_BYTES)} — a PDF, a Word document, a
          photograph of a delivery note, an Excel workbook. Programs and installers are the one
          exception, and they are refused rather than quietly ignored.
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
        <p className="mt-1.5 text-[0.75rem] text-[var(--text-tertiary)]">
          A line for whoever finds this in six months. Amryn does not read the file, so this note
          is the only description it will have.
        </p>
      </div>

      {state.status === 'error' ? (
        <p role="alert" className="text-[0.8125rem] leading-relaxed text-[var(--negative)]">
          {state.message}
        </p>
      ) : null}

      {state.status === 'stored' ? (
        <div role="status" className="space-y-1">
          <p className="text-[0.8125rem] text-[var(--positive)]">
            {state.filename} stored.
          </p>
          <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
            {state.handling === 'table'
              ? `We read ${state.rowCount.toLocaleString('en-ZA')} ${state.rowCount === 1 ? 'row' : 'rows'}` +
                (state.columns.length > 0 ? ` across ${state.columns.length} columns.` : '.')
              : state.readError
                ? `We tried to read its rows and could not: ${state.readError} It is kept as it is.`
                : 'It is kept as it is — Amryn has not read what is inside it.'}
          </p>
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

  return {
    text: isTable(file.name)
      ? `${label}, ${describeBytes(file.size)}. Its columns and rows will be read.`
      : `${label}, ${describeBytes(file.size)}. It will be stored and given back when you ask for it. Amryn will not read what is inside it.`,
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

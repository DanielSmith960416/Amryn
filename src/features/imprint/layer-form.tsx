'use client';

/**
 * One screen of the Imprint, rendered from the layer's declared fields.
 *
 * ── why one form and not eight ────────────────────────────────────────────
 * Eight bespoke forms would drift from the field list in layers.ts, and the
 * drift would be silent: a field on screen but not in the list would not count
 * towards the Quality Score, and a field in the list but not on screen would
 * be recorded as a gap nobody was ever given the chance to fill. Both read as
 * the score being wrong rather than the form being incomplete.
 *
 * Rendering from the list makes those the same thing. The bespoke parts — the
 * four repeatable lists that write to real tables — are passed in as children
 * by the layer that needs them.
 */
import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Textarea } from '@/components/ui/field';
import { layer as layerDefinition, type LayerId } from './layers';
import { saveDraft } from './actions';
import type { SaveState } from './actions';

/** How long to wait after the last keystroke before keeping what was typed. */
const AUTOSAVE_AFTER_MS = 1200;

type Action = (state: SaveState, formData: FormData) => Promise<SaveState>;

export function LayerForm({
  id,
  action,
  answers,
  lists,
}: {
  id: LayerId;
  action: Action;
  /** What is already recorded, so reopening a layer shows what was said. */
  answers: Record<string, unknown>;
  /** The repeatable lists, keyed by the field each stands in for. */
  lists?: Partial<Record<string, React.ReactNode>>;
}) {
  const definition = layerDefinition(id);
  const [state, submit, pending] = useActionState<SaveState, FormData>(action, { status: 'idle' });
  const formRef = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');

  /**
   * The autosave.
   *
   * Debounced, and deliberately quiet: it keeps what has been typed and says
   * so in three words, without validating, navigating or interrupting. The
   * whole point is that closing the laptop halfway through a layer costs
   * nothing, and a save that announces itself loudly every few seconds is one
   * people learn to ignore and then distrust.
   *
   * Only the plain fields are sent. The repeatable lists write to real tables
   * on submit, and a half-typed site name is not a site.
   */
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    let timer: ReturnType<typeof setTimeout>;
    const onInput = () => {
      clearTimeout(timer);
      setSaved('saving');
      timer = setTimeout(() => {
        const data = new FormData(form);
        const entries: Record<string, string> = {};
        for (const field of definition.fields) {
          if (field.input === 'repeatable') continue;
          entries[field.name] = String(data.get(field.name) ?? '');
        }
        void saveDraft(id, entries).then(() => setSaved('saved'));
      }, AUTOSAVE_AFTER_MS);
    };

    form.addEventListener('input', onInput);
    return () => {
      clearTimeout(timer);
      form.removeEventListener('input', onInput);
    };
  }, [id, definition]);

  const given = (name: string): string => {
    const value = answers[name];
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  };

  return (
    <form ref={formRef} action={submit} className="space-y-5">
      {state.status === 'error' ? (
        <p
          className="rounded-[var(--radius-tile)] border border-[var(--negative)] bg-[var(--negative-soft)] px-4 py-3 text-[0.8125rem] text-[var(--negative)]"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        {definition.fields.map((field) => {
          if (field.input === 'repeatable') {
            return (
              <div key={field.name} className="sm:col-span-2">
                <Label htmlFor={field.name}>{field.label}</Label>
                {lists?.[field.name] ?? null}
                <WhyItMatters text={field.whyItMatters} />
              </div>
            );
          }

          const wide = field.input === 'textarea';
          return (
            <div key={field.name} className={wide ? 'sm:col-span-2' : undefined}>
              <Label htmlFor={field.name}>
                {field.label}
                {field.unit ? (
                  <span className="ml-1.5 font-normal text-[var(--text-tertiary)]">
                    ({field.unit})
                  </span>
                ) : null}
              </Label>

              {field.input === 'textarea' ? (
                <Textarea
                  id={field.name}
                  name={field.name}
                  rows={3}
                  defaultValue={given(field.name)}
                  placeholder={field.placeholder}
                />
              ) : field.input === 'select' ? (
                <select
                  id={field.name}
                  name={field.name}
                  defaultValue={given(field.name)}
                  className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--card)] px-3 text-[0.875rem] text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
                >
                  {/* Blank first, and it stays a legitimate answer: leaving it
                      is a gap, which is recorded, not a validation failure. */}
                  <option value="">Not answered yet</option>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={field.name}
                  name={field.name}
                  type={field.input === 'number' ? 'number' : 'text'}
                  inputMode={field.input === 'number' ? 'decimal' : undefined}
                  step={field.input === 'number' ? 'any' : undefined}
                  defaultValue={given(field.name)}
                  placeholder={field.placeholder}
                />
              )}

              <WhyItMatters text={field.whyItMatters} />
            </div>
          );
        })}
      </div>

      <FieldError message={undefined} />

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Saving…' : 'Save and continue'}
        </Button>

        {/* Three words, and only after something has actually been kept. */}
        <span
          aria-live="polite"
          className="text-[0.75rem] text-[var(--text-tertiary)]"
        >
          {saved === 'saved' ? 'Answers kept' : saved === 'saving' ? '…' : ''}
        </span>
      </div>
    </form>
  );
}

/**
 * Why a field is being asked for, under the field.
 *
 * "Why do you want this?" is the question that stops somebody answering, and
 * the honest reply is usually one specific sentence. Putting it on the screen
 * rather than in a tooltip is the difference between an answer and a shrug.
 */
function WhyItMatters({ text }: { text: string }) {
  return <p className="mt-1.5 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">{text}</p>;
}

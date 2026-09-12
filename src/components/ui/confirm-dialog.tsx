'use client';

import { useEffect, useRef } from 'react';
import { Button } from './button';

/**
 * The one place this product asks "are you sure".
 *
 * Built on the native `<dialog>` rather than on a div with a fixed position,
 * because the browser already does the four things a hand-rolled modal gets
 * wrong: it traps focus inside the dialog, it returns focus to whatever opened
 * it, it closes on Escape, and it renders in the top layer so no z-index on the
 * page can cover it. `showModal()` also supplies the backdrop, which is styled
 * through `::backdrop` in globals.css rather than by a second element.
 *
 * ── on being the first of its kind ────────────────────────────────────────
 * Nothing in Amryn had a modal until now, and the absence was deliberate:
 * almost everything destructive here is reversible, so the interface simply
 * did it and said so. Clearing a conversation is the first action where the
 * reader's list changes and the honest sentence is "this cannot be undone from
 * the UI" — a claim worth making before the click rather than after it.
 *
 * So the component is deliberately narrow. One question, one confirming
 * action, one way out. It is not a general-purpose overlay and should not grow
 * into one: a dialog that can hold a form is a page that has lost its URL.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Keep it',
  tone = 'negative',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'negative' | 'brand';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      /*
       * Escape and the backdrop both mean "no". `cancel` covers Escape; the
       * click handler covers the backdrop, which is the dialog element itself
       * — anything inside the panel stops the event before it arrives here.
       */
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onCancel();
      }}
      className="glass-strong m-auto w-[min(28rem,calc(100vw-2rem))] rounded-[var(--radius-card)] p-0 text-[var(--text-primary)] backdrop:bg-[rgb(8_27_51/0.45)]"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
    >
      <div className="p-5" onClick={(event) => event.stopPropagation()}>
        <h2 id="confirm-title" className="font-display text-[1.0625rem] font-semibold">
          {title}
        </h2>
        <p
          id="confirm-body"
          className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]"
        >
          {body}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === 'negative' ? 'danger' : 'primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

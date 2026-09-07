'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/field';
import { saveScenario, type ScenarioState } from './actions';

/**
 * Writing a question about the business.
 *
 * The levers are multipliers rather than figures, and the copy says why: a
 * scenario that asserts "revenue of R2m" has replaced the model with a claim
 * and cannot be wrong, which is exactly what makes it not worth asking. That
 * argument is in migration 29 as well; it belongs in front of the person
 * choosing, not only in the schema.
 */
export interface ScenarioDraft {
  id: string;
  name: string;
  description: string | null;
  demandMultiplier: number;
  priceMultiplier: number;
  horizonDays: number;
}

export function ScenarioForm({
  existing,
  onDone,
}: {
  existing?: ScenarioDraft;
  onDone?: () => void;
}) {
  const [state, action] = useActionState(saveScenario, { status: 'idle' } as ScenarioState);
  const values = state.status === 'error' ? state.values : undefined;

  const initial = (field: keyof ScenarioDraft, fallback: string) =>
    values?.[field] ?? (existing ? String(existing[field] ?? '') : fallback);

  return (
    <form action={action} className="space-y-4">
      {existing ? <input type="hidden" name="id" value={existing.id} /> : null}

      <div>
        <Label htmlFor="scenario-name">What are you asking?</Label>
        <Input
          id="scenario-name"
          name="name"
          defaultValue={initial('name', '')}
          placeholder="A fifth more demand"
          maxLength={80}
          required
        />
      </div>

      <div>
        <Label htmlFor="scenario-description">Why (optional)</Label>
        <Textarea
          id="scenario-description"
          name="description"
          rows={2}
          maxLength={400}
          defaultValue={initial('description', '')}
          placeholder="If the Gauteng contract lands, what does the next quarter look like?"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="scenario-demand">Demand</Label>
          <Input
            id="scenario-demand"
            name="demandMultiplier"
            type="number"
            step="0.05"
            min="0.05"
            max="10"
            defaultValue={initial('demandMultiplier', '1')}
            required
          />
          <p className="mt-1 text-[0.75rem] text-[var(--text-tertiary)]">1 is unchanged, 1.2 is a fifth more.</p>
        </div>

        <div>
          <Label htmlFor="scenario-price">Price</Label>
          <Input
            id="scenario-price"
            name="priceMultiplier"
            type="number"
            step="0.05"
            min="0.05"
            max="10"
            defaultValue={initial('priceMultiplier', '1')}
            required
          />
          <p className="mt-1 text-[0.75rem] text-[var(--text-tertiary)]">1.1 is ten per cent more.</p>
        </div>

        <div>
          <Label htmlFor="scenario-horizon">Days ahead</Label>
          <Input
            id="scenario-horizon"
            name="horizonDays"
            type="number"
            step="1"
            min="1"
            max="1095"
            defaultValue={initial('horizonDays', '90')}
            required
          />
          <p className="mt-1 text-[0.75rem] text-[var(--text-tertiary)]">Up to three years.</p>
        </div>
      </div>

      <p className="text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
        Levers, not figures. &ldquo;A fifth more demand&rdquo; is still a question about your
        business and can turn out wrong; &ldquo;revenue of R2m&rdquo; would have replaced the model
        with an assertion, which cannot.
      </p>

      {state.status === 'error' ? (
        <p className="text-[0.8125rem] text-[var(--negative)]" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === 'saved' ? (
        <p className="text-[0.8125rem] text-[var(--positive)]" role="status">
          {state.message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Save editing={Boolean(existing)} />
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function Save({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? 'Saving…' : editing ? 'Save changes' : 'Add scenario'}
    </Button>
  );
}

/** The form, behind a button, so the list is the page rather than the form. */
export function AddScenario() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        Ask something else
      </Button>
    );
  }

  return <ScenarioForm onDone={() => setOpen(false)} />;
}

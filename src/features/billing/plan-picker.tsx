'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import { formatMoney } from '@/lib/utils/format';
import { requestSubscription, type RequestState } from './actions';
import type { Plan } from '@/lib/billing/access';

export interface PickerPlan {
  plan: Plan;
  name: string;
  tagline: string;
  priceCentsMonthly: number | null;
  priceCentsAnnual: number | null;
  currency: string;
  contactSales: boolean;
  /** Names of what the tier includes, ready to render. */
  includes: string[];
  savingCents: number | null;
}

export function PlanPicker({
  plans,
  currentPlan,
  disabled,
}: {
  plans: PickerPlan[];
  currentPlan: Plan | null;
  disabled: boolean;
}) {
  const [state, action] = useActionState(requestSubscription, { status: 'idle' } as RequestState);
  const [term, setTerm] = useState<1 | 12>(1);
  const [chosen, setChosen] = useState<Plan | null>(null);

  return (
    <form action={action} className="space-y-5">
      <div className="flex items-center gap-2">
        <TermToggle current={term} value={1} onChange={setTerm} label="Monthly" />
        <TermToggle current={term} value={12} onChange={setTerm} label="Yearly" />
        <input type="hidden" name="term" value={term} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const current = currentPlan === plan.plan;
          const price = term === 12 ? plan.priceCentsAnnual : plan.priceCentsMonthly;
          const selected = chosen === plan.plan;

          return (
            <Card
              key={plan.plan}
              tone={current ? 'brand' : 'default'}
              className={cn(
                'flex flex-col p-4',
                current && 'ring-1 ring-[var(--brand)]',
                selected && !current && 'ring-1 ring-[var(--brand)]/50',
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[0.9375rem] font-semibold text-[var(--text-primary)]">
                  {plan.name}
                </p>
                {current ? <Badge tone="brand">Current</Badge> : null}
              </div>

              <p className="numeric mt-2 text-[1.25rem] font-semibold text-[var(--text-primary)]">
                {price === null
                  ? 'By arrangement'
                  : formatMoney(price, plan.currency, { compact: false, decimals: 0 })}
                {price === null ? null : (
                  <span className="font-sans text-[0.75rem] font-normal text-[var(--text-tertiary)]">
                    {term === 12 ? ' / year' : ' / month'}
                  </span>
                )}
              </p>

              {term === 12 && plan.savingCents ? (
                <p className="mt-0.5 text-[0.75rem] text-[var(--positive)]">
                  Saves {formatMoney(plan.savingCents, plan.currency, { compact: false, decimals: 0 })} against paying monthly
                </p>
              ) : null}

              <p className="mt-1.5 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
                {plan.tagline}
              </p>

              <ul className="mt-3 flex-1 space-y-1">
                {plan.includes.map((item) => (
                  <li
                    key={item}
                    className="flex gap-1.5 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]"
                  >
                    <span aria-hidden className="text-[var(--positive)]">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-4">
                {plan.contactSales ? (
                  <p className="text-[0.75rem] text-[var(--text-tertiary)]">
                    Arranged with us directly.
                  </p>
                ) : current && !disabled ? (
                  <p className="text-[0.75rem] text-[var(--text-tertiary)]">
                    This is the plan you are on.
                  </p>
                ) : (
                  <button
                    type="submit"
                    name="plan"
                    value={plan.plan}
                    onClick={() => setChosen(plan.plan)}
                    className="w-full rounded-[var(--radius-field)] border border-[var(--border)] px-3 py-2 text-[0.8125rem] font-medium text-[var(--text-primary)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
                  >
                    {current ? 'Renew' : 'Choose'} {plan.name}
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Pending />

      {state.status === 'error' ? (
        <p className="text-[0.8125rem] text-[var(--negative)]" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === 'requested' ? (
        <p className="text-[0.8125rem] text-[var(--positive)]" role="status">
          Reference {state.reference} is ready. The payment details are below.
        </p>
      ) : null}
    </form>
  );
}

function TermToggle({
  current,
  value,
  onChange,
  label,
}: {
  current: 1 | 12;
  value: 1 | 12;
  onChange: (v: 1 | 12) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={current === value}
      onClick={() => onChange(value)}
      className={cn(
        'rounded-full px-3 py-1 text-[0.8125rem]',
        current === value
          ? 'bg-[var(--brand)] text-[var(--on-brand)]'
          : 'border border-[var(--border)] text-[var(--text-secondary)]',
      )}
    >
      {label}
    </button>
  );
}

function Pending() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <p className="text-[0.8125rem] text-[var(--text-tertiary)]" role="status">
      Setting that up…
    </p>
  );
}

'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { updateBusinessAddress, type AddressState } from './actions';

const idle: AddressState = { status: 'idle' };

/**
 * The nine provinces, in the order the country lists them.
 *
 * A fixed list rather than free text because these nine are the whole set and
 * a typed "Kwazulu Natal" will not match "KwaZulu-Natal" when anything later
 * groups by it. The column itself is text, so an organisation outside South
 * Africa can still hold a state or a county — this control is the South
 * African case made easy, not a constraint in the database.
 */
const PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
];

export interface BusinessAddress {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
}

/**
 * Where the business trades.
 *
 * Optional throughout, and said so once at the top rather than five times.
 * The city is the field that earns its place beyond paperwork: it is what the
 * Command Centre's weather panel reads before it asks the browser where it is.
 */
export function AddressForm({ address }: { address: BusinessAddress }) {
  const [state, action] = useActionState(updateBusinessAddress, idle);

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="addressLine1">Street address</Label>
        <Input
          id="addressLine1"
          name="addressLine1"
          defaultValue={address.addressLine1 ?? ''}
          autoComplete="address-line1"
          maxLength={160}
        />
      </div>

      <div>
        <Label htmlFor="addressLine2">Suburb</Label>
        <Input
          id="addressLine2"
          name="addressLine2"
          defaultValue={address.addressLine2 ?? ''}
          autoComplete="address-line2"
          maxLength={160}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="city">City or town</Label>
          <Input
            id="city"
            name="city"
            defaultValue={address.city ?? ''}
            autoComplete="address-level2"
            maxLength={120}
          />
        </div>

        <div>
          <Label htmlFor="province">Province</Label>
          {/*
            The same classes the Input primitive carries. A select is not in
            components/ui yet and one control is not a design system — when a
            second screen needs one, it moves there rather than being copied.
          */}
          <select
            id="province"
            name="province"
            defaultValue={address.province ?? ''}
            className="mt-1.5 h-9 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[0.875rem] text-[var(--text-primary)] outline-none focus-visible:border-[var(--brand)] focus-visible:ring-2 focus-visible:ring-[var(--brand-soft)]"
          >
            <option value="">—</option>
            {PROVINCES.map((province) => (
              <option key={province} value={province}>
                {province}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="postalCode">Postal code</Label>
          <Input
            id="postalCode"
            name="postalCode"
            defaultValue={address.postalCode ?? ''}
            autoComplete="postal-code"
            inputMode="numeric"
            maxLength={16}
          />
        </div>
      </div>

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

      <Save />
    </form>
  );
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? 'Saving…' : 'Save address'}
    </Button>
  );
}

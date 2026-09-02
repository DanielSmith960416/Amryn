'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { importStocktake, type ImportState } from './import';

export interface ProfileOption {
  id: string;
  label: string;
  responsibleRoleLabel: string;
  auditorRoleLabel: string;
  shifts: readonly string[];
}

export function ImportForm({
  profiles,
  today,
}: {
  profiles: readonly ProfileOption[];
  today: string;
}) {
  const [state, action] = useActionState(importStocktake, { status: 'idle' } as ImportState);
  const first = profiles[0];

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="siteName">Which site</Label>
          <Input id="siteName" name="siteName" required placeholder="Kimberley branch" />
        </div>
        <div>
          <Label htmlFor="auditDate">Date counted</Label>
          <Input id="auditDate" name="auditDate" type="date" defaultValue={today} required />
        </div>
        <div>
          <Label htmlFor="complianceProfileId">Sector</Label>
          <select
            id="complianceProfileId"
            name="complianceProfileId"
            defaultValue={first?.id}
            className="h-10 w-full rounded-[var(--radius-field)] border border-[var(--border)] bg-[var(--card)] px-3 text-[0.875rem] text-[var(--text-primary)]"
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[0.75rem] text-[var(--text-tertiary)]">
            Decides the retention and disposal wording on the report, and who signs it off.
          </p>
        </div>
        <div>
          <Label htmlFor="shift">Shift</Label>
          <Input id="shift" name="shift" placeholder="Full day" />
        </div>
        <div>
          <Label htmlFor="auditorName">Who counted</Label>
          <Input id="auditorName" name="auditorName" placeholder="Staff member" />
        </div>
        <div>
          <Label htmlFor="responsibleName">Who signs it off</Label>
          <Input id="responsibleName" name="responsibleName" placeholder="Pharmacist on duty" />
        </div>
      </div>

      <div>
        <Label htmlFor="file">The spreadsheet</Label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          className="block w-full text-[0.875rem] text-[var(--text-secondary)] file:mr-3 file:rounded-[var(--radius-field)] file:border-0 file:bg-[var(--brand)] file:px-3 file:py-2 file:text-[0.8125rem] file:font-medium file:text-[var(--on-brand)]"
        />
        <p className="mt-1.5 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
          Save your sheet as CSV. We need a product name and an expiry date; everything else —
          batch, department, quantity, cost, what was done and by whom — is used if it is there.
          Column names are matched loosely, so “Expiry”, “Expiry Date” and “Best Before” all work.
        </p>
      </div>

      {state.status === 'error' ? (
        <div role="alert" className="space-y-2">
          <p className="text-[0.8125rem] leading-relaxed text-[var(--negative)]">{state.message}</p>
          {state.rejected?.length ? (
            <ul className="space-y-0.5 rounded-lg bg-[var(--card-inset)] px-3 py-2">
              {state.rejected.map((line) => (
                <li key={line} className="text-[0.75rem] text-[var(--text-secondary)]">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {state.status === 'imported' ? (
        <p role="status" className="text-[0.8125rem] text-[var(--positive)]">
          {state.lines} stock {state.lines === 1 ? 'line' : 'lines'} imported. The compliance
          dashboard and the stock report are built from them now.
        </p>
      ) : null}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? 'Reading the file…' : 'Import the stocktake'}
    </Button>
  );
}

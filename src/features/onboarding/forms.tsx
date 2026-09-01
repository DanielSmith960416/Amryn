'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/field';
import { Repeatable } from './repeatable';
import {
  saveData,
  saveIdentity,
  saveMarket,
  saveObjectives,
  saveStructure,
  saveSystems,
  type SaveState,
} from './actions';

/**
 * The six question steps.
 *
 * One file because they share every primitive and differ only in what they
 * ask; six files would be six copies of the same wrapper. Each is its own
 * component and its own action, so a change to one cannot reach another.
 */

const idle = { status: 'idle' } as SaveState;

function Problem({ state }: { state: SaveState }) {
  if (state.status !== 'error') return null;
  return (
    <p className="text-[0.8125rem] leading-relaxed text-[var(--negative)]" role="alert">
      {state.message}
    </p>
  );
}

function Continue({ label = 'Save and continue' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

const rowClass = 'rounded-lg border border-[var(--border)] p-3';

/* ── 1. identity ───────────────────────────────────────────────────────── */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function IdentityForm({
  industry,
  fiscalYearStart,
  timezone,
}: {
  industry: string;
  fiscalYearStart: number;
  timezone: string;
}) {
  const [state, action] = useActionState(saveIdentity, idle);

  return (
    <form action={action} className="space-y-5">
      <div>
        <Label htmlFor="industry">What does the business do?</Label>
        <Input
          id="industry"
          name="industry"
          defaultValue={industry}
          required
          placeholder="Wholesale distribution of building materials"
        />
        <p className="mt-1.5 text-[0.75rem] text-[var(--text-tertiary)]">
          A sentence, not a category. This decides which market signals reach you.
        </p>
      </div>

      <div>
        <Label htmlFor="describes">Anything else worth knowing?</Label>
        <Textarea
          id="describes"
          name="describes"
          rows={3}
          placeholder="Family owned since 1998. Mostly trade customers, some retail. Seasonal — the second half is always stronger."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="headcountBand">How many people?</Label>
          <select
            id="headcountBand"
            name="headcountBand"
            defaultValue="11-50"
            className="h-10 w-full rounded-[var(--radius-field)] border border-[var(--border)] bg-[var(--card)] px-3 text-[0.875rem] text-[var(--text-primary)]"
          >
            <option value="1-10">1 to 10</option>
            <option value="11-50">11 to 50</option>
            <option value="51-200">51 to 200</option>
            <option value="201-1000">201 to 1,000</option>
            <option value="1000+">More than 1,000</option>
          </select>
        </div>

        <div>
          <Label htmlFor="fiscalYearStart">Financial year starts in</Label>
          <select
            id="fiscalYearStart"
            name="fiscalYearStart"
            defaultValue={String(fiscalYearStart)}
            className="h-10 w-full rounded-[var(--radius-field)] border border-[var(--border)] bg-[var(--card)] px-3 text-[0.875rem] text-[var(--text-primary)]"
          >
            {MONTHS.map((month, i) => (
              <option key={month} value={i + 1}>
                {month}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[0.75rem] text-[var(--text-tertiary)]">
            March for most South African companies.
          </p>
        </div>
      </div>

      <div>
        <Label htmlFor="timezone">Time zone</Label>
        <Input id="timezone" name="timezone" defaultValue={timezone} required />
      </div>

      <Problem state={state} />
      <Continue />
    </form>
  );
}

/* ── 2. structure ──────────────────────────────────────────────────────── */

export function StructureForm() {
  const [state, action] = useActionState(saveStructure, idle);

  return (
    <form action={action} className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-[0.875rem] font-medium text-[var(--text-primary)]">
          Sites
        </legend>
        <p className="mb-3 text-[0.75rem] text-[var(--text-tertiary)]">
          Branches, depots, shops — anywhere you would want to see the figures separately.
        </p>
        <Repeatable addLabel="Add another site" max={50}>
          {(i) => (
            <div className={rowClass}>
              <div className="grid gap-3 sm:grid-cols-[2fr_1.5fr_1fr]">
                <div>
                  <Label htmlFor={`branchName-${i}`}>Name</Label>
                  <Input id={`branchName-${i}`} name="branchName" placeholder="Johannesburg" />
                </div>
                <div>
                  <Label htmlFor={`branchCity-${i}`}>City</Label>
                  <Input id={`branchCity-${i}`} name="branchCity" placeholder="Johannesburg" />
                </div>
                <div>
                  <Label htmlFor={`branchHeadcount-${i}`}>People</Label>
                  <Input
                    id={`branchHeadcount-${i}`}
                    name="branchHeadcount"
                    type="number"
                    min={0}
                    inputMode="numeric"
                  />
                </div>
              </div>
            </div>
          )}
        </Repeatable>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[0.875rem] font-medium text-[var(--text-primary)]">
          Departments
        </legend>
        <p className="mb-3 text-[0.75rem] text-[var(--text-tertiary)]">
          Sales, operations, finance — however your business actually divides up.
        </p>
        <Repeatable addLabel="Add another department" max={50}>
          {(i) => (
            <div>
              <Label htmlFor={`department-${i}`} className="sr-only">
                Department
              </Label>
              <Input id={`department-${i}`} name="department" placeholder="Sales" />
            </div>
          )}
        </Repeatable>
      </fieldset>

      <Problem state={state} />
      <Continue />
    </form>
  );
}

/* ── 3. objectives ─────────────────────────────────────────────────────── */

export function ObjectivesForm({ defaultDue }: { defaultDue: string }) {
  const [state, action] = useActionState(saveObjectives, idle);

  return (
    <form action={action} className="space-y-5">
      <Repeatable addLabel="Add another objective" max={10}>
        {(i) => (
          <div className={rowClass}>
            <div>
              <Label htmlFor={`objectiveTitle-${i}`}>Objective</Label>
              <Input
                id={`objectiveTitle-${i}`}
                name="objectiveTitle"
                placeholder="Grow revenue to R12m"
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor={`objectiveTarget-${i}`}>Target</Label>
                <Input
                  id={`objectiveTarget-${i}`}
                  name="objectiveTarget"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  placeholder="12000000"
                />
              </div>
              <div>
                <Label htmlFor={`objectiveUnit-${i}`}>Measured in</Label>
                <select
                  id={`objectiveUnit-${i}`}
                  name="objectiveUnit"
                  defaultValue="ZAR"
                  className="h-10 w-full rounded-[var(--radius-field)] border border-[var(--border)] bg-[var(--card)] px-3 text-[0.875rem] text-[var(--text-primary)]"
                >
                  <option value="ZAR">Rand</option>
                  <option value="%">Percent</option>
                  <option value="count">Count</option>
                  <option value="days">Days</option>
                </select>
              </div>
              <div>
                <Label htmlFor={`objectiveDue-${i}`}>By</Label>
                <Input
                  id={`objectiveDue-${i}`}
                  name="objectiveDue"
                  type="date"
                  defaultValue={defaultDue}
                />
              </div>
            </div>
          </div>
        )}
      </Repeatable>

      <Problem state={state} />
      <Continue />
    </form>
  );
}

/* ── 4. systems ────────────────────────────────────────────────────────── */

const SYSTEM_KINDS = [
  { value: 'accounting', label: 'Accounting', example: 'Sage, Xero, Pastel' },
  { value: 'pos', label: 'Point of sale', example: 'Shopify, Vend' },
  { value: 'crm', label: 'Customer records', example: 'HubSpot, Zoho' },
  { value: 'erp', label: 'ERP', example: 'SAP, Odoo' },
  { value: 'spreadsheet', label: 'Spreadsheet', example: 'The one on the shared drive' },
  { value: 'database', label: 'A database of your own', example: '' },
  { value: 'api', label: 'Something with an API', example: '' },
  { value: 'manual', label: 'On paper', example: 'Stock counts, delivery notes' },
];

export function SystemsForm() {
  const [state, action] = useActionState(saveSystems, idle);

  return (
    <form action={action} className="space-y-5">
      <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        Name the ones you have. Leave the rest blank — naming a system you do not use means the
        platform waits for numbers that will never arrive.
      </p>

      <div className="space-y-3">
        {SYSTEM_KINDS.map((kind) => (
          <div key={kind.value} className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-center">
            <Label htmlFor={`system-${kind.value}`} className="!mb-0">
              {kind.label}
            </Label>
            <div>
              <input type="hidden" name="systemCategory" value={kind.value} />
              <Input
                id={`system-${kind.value}`}
                name="systemName"
                placeholder={kind.example || 'What is it called?'}
              />
            </div>
          </div>
        ))}
      </div>

      <Problem state={state} />
      <Continue />
    </form>
  );
}

/* ── 5. data ───────────────────────────────────────────────────────────── */

export function DataForm() {
  const [state, action] = useActionState(saveData, idle);

  return (
    <form action={action} className="space-y-5">
      <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        Rough is fine. These are a starting point, not a submission — the moment real figures
        arrive from your systems, the real figures win.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="annualRevenue">Revenue last year</Label>
          <Input
            id="annualRevenue"
            name="annualRevenue"
            type="number"
            step="any"
            inputMode="decimal"
            placeholder="8400000"
          />
        </div>
        <div>
          <Label htmlFor="revenueTargetAnnual">Revenue you are aiming at</Label>
          <Input
            id="revenueTargetAnnual"
            name="revenueTargetAnnual"
            type="number"
            step="any"
            inputMode="decimal"
            placeholder="9600000"
          />
        </div>
        <div>
          <Label htmlFor="grossMarginTarget">Gross margin you expect (%)</Label>
          <Input
            id="grossMarginTarget"
            name="grossMarginTarget"
            type="number"
            step="any"
            min={0}
            max={100}
            placeholder="34"
          />
        </div>
        <div>
          <Label htmlFor="netMarginTarget">Net margin you expect (%)</Label>
          <Input
            id="netMarginTarget"
            name="netMarginTarget"
            type="number"
            step="any"
            min={0}
            max={100}
            placeholder="12"
          />
        </div>
        <div>
          <Label htmlFor="customers">Roughly how many customers</Label>
          <Input
            id="customers"
            name="customers"
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="850"
          />
        </div>
      </div>

      <Problem state={state} />
      <Continue />
    </form>
  );
}

/* ── 6. market ─────────────────────────────────────────────────────────── */

const SECTORS = [
  { value: 'private', label: 'Private sector work' },
  { value: 'public', label: 'Government and public tenders' },
  { value: 'mixed', label: 'Both, on the same contract' },
];

export function MarketForm({ sectors }: { sectors: readonly string[] }) {
  const [state, action] = useActionState(saveMarket, idle);

  return (
    <form action={action} className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-[0.875rem] font-medium text-[var(--text-primary)]">
          Competitors worth watching
        </legend>
        <p className="mb-3 text-[0.75rem] text-[var(--text-tertiary)]">
          Named competitors are followed continuously. Naming none is a fair answer.
        </p>
        <Repeatable addLabel="Add another competitor" max={30}>
          {(i) => (
            <div className={rowClass}>
              <div className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr]">
                <div>
                  <Label htmlFor={`competitorName-${i}`}>Name</Label>
                  <Input id={`competitorName-${i}`} name="competitorName" />
                </div>
                <div>
                  <Label htmlFor={`competitorSite-${i}`}>Website</Label>
                  <Input
                    id={`competitorSite-${i}`}
                    name="competitorSite"
                    placeholder="example.co.za"
                  />
                </div>
                <div>
                  <Label htmlFor={`competitorThreat-${i}`}>Threat</Label>
                  <select
                    id={`competitorThreat-${i}`}
                    name="competitorThreat"
                    defaultValue="medium"
                    className="h-10 w-full rounded-[var(--radius-field)] border border-[var(--border)] bg-[var(--card)] px-3 text-[0.875rem] text-[var(--text-primary)]"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </Repeatable>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[0.875rem] font-medium text-[var(--text-primary)]">
          Work you would consider
        </legend>
        <p className="mb-3 text-[0.75rem] text-[var(--text-tertiary)]">
          Opportunities outside what you tick here are not shown to you at all.
        </p>
        <div className="space-y-2">
          {SECTORS.map((sector) => (
            <label key={sector.value} className="flex items-start gap-2.5">
              <input
                type="checkbox"
                name="sector"
                value={sector.value}
                defaultChecked={sectors.includes(sector.value)}
                className="mt-0.5 size-4 rounded border-[var(--border-strong)]"
              />
              <span className="text-[0.875rem] text-[var(--text-primary)]">{sector.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Problem state={state} />
      <Continue />
    </form>
  );
}

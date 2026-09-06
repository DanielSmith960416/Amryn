'use client';

/**
 * The four questions that are "list the ones you have".
 *
 * These are the fields that do not go into the layer's answers: a site is a
 * row in `branches`, an objective is a row in `goals`, and both appear in the
 * switcher and in the figures the moment they are saved. They need their own
 * markup because a repeated row is not a single input, and their own component
 * because that markup is the only part of a layer the generic form cannot
 * render from a field declaration.
 */
import { Input, Label } from '@/components/ui/field';
import { Repeatable } from './repeatable';

const rowClass =
  'rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--surface)] p-3';

export function SitesList() {
  return (
    <Repeatable addLabel="Add another site" max={50}>
      {(i) => (
        <div className={rowClass}>
          <div className="grid gap-3 sm:grid-cols-[2fr_1.5fr_1fr]">
            <div>
              <Label htmlFor={`siteName-${i}`}>Name</Label>
              <Input id={`siteName-${i}`} name="siteName" placeholder="Johannesburg" />
            </div>
            <div>
              <Label htmlFor={`siteCity-${i}`}>City</Label>
              <Input id={`siteCity-${i}`} name="siteCity" placeholder="Johannesburg" />
            </div>
            <div>
              <Label htmlFor={`siteHeadcount-${i}`}>People</Label>
              <Input
                id={`siteHeadcount-${i}`}
                name="siteHeadcount"
                type="number"
                min={0}
                inputMode="numeric"
              />
            </div>
          </div>
        </div>
      )}
    </Repeatable>
  );
}

export function DepartmentsList() {
  return (
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
  );
}

/**
 * The systems, one box per category.
 *
 * Fixed rows rather than a repeatable list: the categories are the prompt. A
 * blank list headed "your systems" gets one answer; eight labelled boxes get
 * five, because each one is a reminder that the thing exists.
 */
const CATEGORIES = [
  { value: 'accounting', label: 'Accounting', placeholder: 'Xero, Sage, QuickBooks' },
  { value: 'pos', label: 'Point of sale', placeholder: 'Yoco, Shopify POS' },
  { value: 'crm', label: 'Customer records', placeholder: 'HubSpot, a spreadsheet' },
  { value: 'erp', label: 'ERP', placeholder: 'SAP, Odoo' },
  { value: 'spreadsheet', label: 'Spreadsheets', placeholder: 'The one somebody maintains' },
  { value: 'database', label: 'A database', placeholder: 'Something built in-house' },
  { value: 'api', label: 'Something with an API', placeholder: 'A supplier portal' },
  { value: 'manual', label: 'On paper', placeholder: 'Delivery notes, a ledger' },
] as const;

export function SystemsList({ values }: { values?: Record<string, string> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {CATEGORIES.map((category) => (
        <div key={category.value}>
          <Label htmlFor={`system-${category.value}`}>{category.label}</Label>
          {/* The category travels beside the name so a blank box submits
              nothing rather than an unlabelled system. */}
          <input type="hidden" name="systemCategory" value={category.value} />
          <Input
            id={`system-${category.value}`}
            name="systemName"
            placeholder={category.placeholder}
            defaultValue={values?.[category.value] ?? ''}
          />
        </div>
      ))}
    </div>
  );
}

export function ObjectivesList({ defaultDue }: { defaultDue: string }) {
  return (
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
                className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--card)] px-3 text-[0.875rem] text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
              >
                <option value="ZAR">Rand</option>
                <option value="%">Percent</option>
                <option value="count">A count</option>
                <option value="days">Days</option>
              </select>
            </div>
            <div>
              <Label htmlFor={`objectiveDue-${i}`}>By when</Label>
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
  );
}

export function CompetitorsList() {
  return (
    <Repeatable addLabel="Add another competitor" max={30}>
      {(i) => (
        <div className={rowClass}>
          <div className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr]">
            <div>
              <Label htmlFor={`competitorName-${i}`}>Name</Label>
              <Input id={`competitorName-${i}`} name="competitorName" placeholder="A rival" />
            </div>
            <div>
              <Label htmlFor={`competitorSite-${i}`}>Website</Label>
              <Input id={`competitorSite-${i}`} name="competitorSite" placeholder="https://" />
            </div>
            <div>
              <Label htmlFor={`competitorThreat-${i}`}>How much of a threat</Label>
              <select
                id={`competitorThreat-${i}`}
                name="competitorThreat"
                defaultValue="medium"
                className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--card)] px-3 text-[0.875rem] text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
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
  );
}

/**
 * Who the business is willing to sell to.
 *
 * Tick boxes rather than a single choice, because the honest answer for most
 * businesses is more than one — and this is what decides whether public-sector
 * tenders belong on their radar or are noise.
 */
const SECTORS = [
  { value: 'private', label: 'Private companies' },
  { value: 'public', label: 'Government and public bodies' },
  { value: 'mixed', label: 'State-owned enterprises' },
] as const;

export function SectorsList({ selected }: { selected?: readonly string[] }) {
  return (
    <div className="space-y-2">
      {SECTORS.map((sector) => (
        <label
          key={sector.value}
          className="flex cursor-pointer items-center gap-2.5 text-[0.8125rem] text-[var(--text-secondary)]"
        >
          <input
            type="checkbox"
            name="sector"
            value={sector.value}
            defaultChecked={selected?.includes(sector.value) ?? sector.value === 'private'}
            className="size-4 accent-[var(--brand)]"
          />
          {sector.label}
        </label>
      ))}
    </div>
  );
}

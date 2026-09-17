import { describe, expect, it } from 'vitest';
import type { Draft } from '@/lib/import/plan';
import { partitionByPermission, permissionName, writePermission } from './import-permissions';

/*
 * These drafts stand in for a management pack: the three tables import_data
 * governs, plus the two it does not. Only `table` matters to the partition, so
 * the rows are the smallest thing that type-checks.
 */
const drafts = [
  { table: 'financial_records', row: {} },
  { table: 'financial_records', row: {} },
  { table: 'sales_records', row: {} },
  { table: 'operational_records', row: {} },
  { table: 'opportunities', row: {} },
  { table: 'opportunities', row: {} },
  { table: 'risks', row: {} },
] as unknown as Draft[];

const everything = () => true;
const nothing = () => false;

describe('what the database asks for', () => {
  it('knows the two tables import_data does not cover', () => {
    expect(writePermission('opportunities')).toBe('manage_opportunities');
    expect(writePermission('risks')).toBe('manage_risks');
  });

  it('treats the three record tables as covered by import_data', () => {
    expect(writePermission('financial_records')).toBeNull();
    expect(writePermission('sales_records')).toBeNull();
    expect(writePermission('operational_records')).toBeNull();
  });
});

describe('an administrator, who holds everything', () => {
  const { allowed, refused } = partitionByPermission(drafts, everything);

  it('imports the whole workbook', () => {
    expect(allowed).toHaveLength(drafts.length);
    expect(refused).toEqual([]);
  });
});

/*
 * The role this guard exists for. An analyst's description is "read
 * everything, import data and define metrics" — it holds import_data and
 * neither manage_opportunities nor manage_risks, deliberately.
 *
 * Before the partition, the import wrote financial, sales and operational rows
 * and was then refused by row-level security on opportunities. The data_imports
 * row is written after the loop, so no fingerprint was recorded, so a second
 * attempt was allowed — and would have written those first three tables again.
 * A business with double the revenue, on a dashboard where nothing looks wrong.
 */
describe('an analyst, who may import records but not judgements', () => {
  const { allowed, refused } = partitionByPermission(drafts, nothing);

  it('imports every table import_data covers', () => {
    expect(allowed.map((d) => d.table)).toEqual([
      'financial_records',
      'financial_records',
      'sales_records',
      'operational_records',
    ]);
  });

  it('holds back the two it does not, before anything is written', () => {
    expect(allowed.some((d) => d.table === 'opportunities')).toBe(false);
    expect(allowed.some((d) => d.table === 'risks')).toBe(false);
  });

  it('reports each held-back table once, not once per row', () => {
    expect(refused.map((r) => r.sheet)).toEqual(['Opportunities', 'Risks']);
  });

  it('names the permission, the count and what to do about it', () => {
    const opportunities = refused.find((r) => r.sheet === 'Opportunities')!;
    expect(opportunities.reason).toMatch(/2 rows were read/);
    expect(opportunities.reason).toMatch(/"manage opportunities"/);
    expect(opportunities.reason).toMatch(/Everything else in the workbook was imported/);
    expect(opportunities.reason).toMatch(/Ask an administrator/);
  });

  it('counts a single row in the singular', () => {
    const risks = refused.find((r) => r.sheet === 'Risks')!;
    expect(risks.reason).toMatch(/1 row was read/);
  });
});

describe('a role holding one of the two but not the other', () => {
  const { allowed, refused } = partitionByPermission(
    drafts,
    (permission) => permission === 'manage_risks',
  );

  it('splits per permission rather than all or nothing', () => {
    expect(allowed.filter((d) => d.table === 'risks')).toHaveLength(1);
    expect(allowed.some((d) => d.table === 'opportunities')).toBe(false);
    expect(refused.map((r) => r.sheet)).toEqual(['Opportunities']);
  });
});

describe('a workbook of nothing but judgements', () => {
  const only = [{ table: 'risks', row: {} }] as unknown as Draft[];

  it('leaves nothing to write, and says why rather than going quiet', () => {
    const { allowed, refused } = partitionByPermission(only, nothing);
    expect(allowed).toEqual([]);
    expect(refused).toHaveLength(1);
    expect(refused[0]!.reason).toMatch(/"manage risks"/);
  });
});

describe('the permission, written for a reader', () => {
  it('is words rather than a key', () => {
    expect(permissionName('manage_opportunities')).toBe('manage opportunities');
    expect(permissionName('manage_risks')).toBe('manage risks');
  });

  it('degrades readably for anything else', () => {
    expect(permissionName('some_future_permission')).toBe('some future permission');
  });
});

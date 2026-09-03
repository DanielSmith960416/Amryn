import { describe, expect, it } from 'vitest';
import { onlyNew, reconcileByName, sameName } from './reconcile';

describe('onlyNew', () => {
  it('skips what is already recorded, so answering again is not adding again', () => {
    expect(onlyNew(['Operations', 'Head Office'], ['Operations'])).toEqual(['Head Office']);
  });

  it('ignores case and surrounding space, as a person reading the list would', () => {
    expect(onlyNew(['  operations  '], ['Operations'])).toEqual([]);
  });

  it('does not insert the same new name twice from one submission', () => {
    expect(onlyNew(['Sales', 'sales'], [])).toEqual(['Sales']);
  });

  it('drops blanks, which are how a repeatable form is used', () => {
    expect(onlyNew(['', '   ', 'Finance'], [])).toEqual(['Finance']);
  });
});

describe('reconcileByName', () => {
  const existing = [{ id: 'goal-1', name: 'Grow revenue to R20M' }];

  it('routes a revised target to the row that already exists', () => {
    // The case from the live database: the target was changed from 2,000,000
    // to 1,200,000 and both rows stayed active, with the same title, leaving
    // nothing able to say which figure the business is judged against.
    const result = reconcileByName(
      [{ title: 'Grow revenue to R20M', target: 1_200_000 }],
      existing,
      (row) => row.title,
    );

    expect(result.insert).toEqual([]);
    expect(result.update).toEqual([
      { id: 'goal-1', row: { title: 'Grow revenue to R20M', target: 1_200_000 } },
    ]);
  });

  it('treats a genuinely new objective as new', () => {
    const result = reconcileByName(
      [{ title: 'Sign ten customers', target: 10 }],
      existing,
      (row) => row.title,
    );

    expect(result.update).toEqual([]);
    expect(result.insert).toHaveLength(1);
  });

  it('separates a revision from an addition in the same submission', () => {
    const result = reconcileByName(
      [
        { title: 'grow revenue to r20m', target: 900_000 },
        { title: 'Sign ten customers', target: 10 },
      ],
      existing,
      (row) => row.title,
    );

    expect(result.update.map((u) => u.id)).toEqual(['goal-1']);
    expect(result.insert.map((r) => r.title)).toEqual(['Sign ten customers']);
  });

  it('takes the first when one name is submitted twice', () => {
    // Otherwise the same row is updated twice in one save, and which value
    // survives depends on statement order rather than on anything a person
    // decided.
    const result = reconcileByName(
      [
        { title: 'Grow revenue to R20M', target: 1 },
        { title: 'Grow revenue to R20M', target: 2 },
      ],
      existing,
      (row) => row.title,
    );

    expect(result.update).toHaveLength(1);
    expect(result.update[0]!.row.target).toBe(1);
    expect(result.insert).toEqual([]);
  });
});

describe('sameName', () => {
  it('is the comparison the other two rely on', () => {
    expect(sameName('  Excel ', 'excel')).toBe(true);
    expect(sameName('Excel', 'Exel')).toBe(false);
  });
});

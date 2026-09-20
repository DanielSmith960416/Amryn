import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SortableTable,
  compareRows,
  initialDirection,
  sortRows,
  type Column,
} from './sortable-table';

afterEach(cleanup);

interface Deal {
  id: string;
  title: string;
  value: number;
}

const deals: Deal[] = [
  { id: 'OPP-1', title: 'Mall of the North refit', value: 240_000 },
  { id: 'OPP-2', title: 'Álvarez Foods supply', value: 1_100_000 },
  { id: 'OPP-3', title: 'Bloemfontein depot', value: 90_000 },
];

const columns: Column<Deal>[] = [
  { key: 'title', header: 'Deal', sortBy: (d) => d.title, render: (d) => d.title },
  {
    key: 'value',
    header: 'Value',
    numeric: true,
    sortBy: (d) => d.value,
    render: (d) => String(d.value),
  },
  { key: 'note', header: 'Note', render: () => '—' },
];

describe('which way a column sorts first', () => {
  /*
   * Not a preference. The question asked of a deal value or a risk score is
   * "which is the biggest", and a first click that answers "which is the
   * smallest" costs a second click every time.
   */
  it('sorts a number biggest-first and a name A-first', () => {
    expect(initialDirection(true)).toBe('desc');
    expect(initialDirection(false)).toBe('asc');
    expect(initialDirection(undefined)).toBe('asc');
  });
});

describe('comparing two rows', () => {
  it('orders numbers by size, not as text', () => {
    // Lexicographically "1100000" sorts before "240000", which is backwards.
    const sorted = sortRows(deals, columns[1], 'asc').map((d) => d.id);
    expect(sorted).toEqual(['OPP-3', 'OPP-1', 'OPP-2']);
  });

  it('reverses cleanly', () => {
    expect(sortRows(deals, columns[1], 'desc').map((d) => d.id)).toEqual([
      'OPP-2',
      'OPP-1',
      'OPP-3',
    ]);
  });

  /*
   * An accented name belongs where a reader looks for it. Plain code-point
   * order puts Álvarez after Zulu, which is not where anybody would go to
   * find it.
   */
  it('puts an accented name where a reader expects it', () => {
    expect(sortRows(deals, columns[0], 'asc').map((d) => d.id)).toEqual([
      'OPP-2',
      'OPP-3',
      'OPP-1',
    ]);
  });

  it('gives no order for a column that cannot be sorted', () => {
    expect(sortRows(deals, columns[2], 'asc').map((d) => d.id)).toEqual([
      'OPP-1',
      'OPP-2',
      'OPP-3',
    ]);
  });

  it('compares directly, for the cases a table cannot reach', () => {
    const by = (d: Deal) => d.value;
    expect(compareRows(deals[0]!, deals[1]!, by, 'asc')).toBeLessThan(0);
    expect(compareRows(deals[0]!, deals[1]!, by, 'desc')).toBeGreaterThan(0);
    expect(compareRows(deals[0]!, deals[0]!, by, 'asc')).toBe(0);
  });

  /*
   * The engine's own ranking is a result, not an accident of array order, so
   * sorting must not destroy it in place — the caller still holds that array.
   */
  it('does not reorder the caller’s array', () => {
    const original = [...deals];
    sortRows(deals, columns[1], 'desc');
    expect(deals).toEqual(original);
  });
});

describe('the table as something to use', () => {
  function draw(initialSort?: string) {
    return render(
      <SortableTable
        rows={deals}
        columns={columns}
        rowKey={(d) => d.id}
        initialSort={initialSort}
        caption="Deals."
        empty="Nothing tracked yet."
      />,
    );
  }

  function titles(container: HTMLElement): string[] {
    return [...container.querySelectorAll('tbody tr')].map(
      (row) => row.querySelector('td')!.textContent ?? '',
    );
  }

  it('opens on the column it was told to, biggest first', () => {
    const { container } = draw('value');
    expect(titles(container)[0]).toContain('Álvarez');
  });

  it('leaves the order alone when it was told nothing', () => {
    const { container } = draw();
    expect(titles(container)[0]).toContain('Mall of the North');
  });

  it('sorts when a header is clicked', () => {
    const { container } = draw();
    fireEvent.click(screen.getByRole('button', { name: /Value/ }));
    expect(titles(container)[0]).toContain('Álvarez');
  });

  it('turns round when the same header is clicked again', () => {
    const { container } = draw();
    const header = screen.getByRole('button', { name: /Value/ });
    fireEvent.click(header);
    fireEvent.click(header);
    expect(titles(container)[0]).toContain('Bloemfontein');
  });

  /*
   * Clicking a new column must start that column's own way round rather than
   * inheriting the last one's, or sorting by name after sorting by value
   * silently gives Z-first.
   */
  it('starts a new column its own way round', () => {
    const { container } = draw();
    fireEvent.click(screen.getByRole('button', { name: /Value/ })); // desc
    fireEvent.click(screen.getByRole('button', { name: /Deal/ })); // should be asc
    expect(titles(container)[0]).toContain('Álvarez Foods');
  });

  it('tells a screen reader which column is sorted, and which way', () => {
    draw('value');
    const header = screen.getByRole('columnheader', { name: /Value/ });
    expect(header.getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(within(header).getByRole('button'));
    expect(header.getAttribute('aria-sort')).toBe('ascending');
  });

  /*
   * Saying "none" on the columns that are not sorted is the half that is easy
   * to forget, and without it a reader is told three columns are sorted.
   */
  it('says the other sortable columns are not sorted', () => {
    draw('value');
    expect(
      screen.getByRole('columnheader', { name: /Deal/ }).getAttribute('aria-sort'),
    ).toBe('none');
  });

  it('gives no sort control, and no claim about sorting, to a column without one', () => {
    draw('value');
    const header = screen.getByRole('columnheader', { name: 'Note' });
    expect(within(header).queryByRole('button')).toBeNull();
    expect(header.getAttribute('aria-sort')).toBeNull();
  });

  it('says what is missing rather than showing an empty frame', () => {
    render(
      <SortableTable
        rows={[]}
        columns={columns}
        rowKey={(d: Deal) => d.id}
        caption="Deals."
        empty="Nothing tracked yet."
      />,
    );
    expect(screen.getByText('Nothing tracked yet.')).toBeTruthy();
  });
});

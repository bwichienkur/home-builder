import { describe, expect, it } from 'vitest';
import { compareForSort, sortByKey, sortDrillRows, toggleSort } from './sortGrid';
import type { DrillColumn } from './resolveDrilldown';

describe('sortGrid', () => {
  it('toggles sort direction on repeated column clicks', () => {
    expect(toggleSort(null, 'name')).toEqual({ key: 'name', dir: 'asc' });
    expect(toggleSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' });
    expect(toggleSort({ key: 'name', dir: 'desc' }, 'pm')).toEqual({ key: 'pm', dir: 'asc' });
  });

  it('sorts strings and numbers', () => {
    const rows = [{ name: 'Zeta' }, { name: 'Alpha' }];
    expect(sortByKey(rows, (row, key) => row[key as 'name'], { key: 'name', dir: 'asc' }).map((r) => r.name)).toEqual([
      'Alpha',
      'Zeta',
    ]);
    expect(
      sortByKey([{ n: 3 }, { n: 1 }], (row, key) => row[key as 'n'], { key: 'n', dir: 'desc' }).map((r) => r.n),
    ).toEqual([3, 1]);
  });

  it('sorts ISO dates lexicographically', () => {
    expect(compareForSort('2026-03-01', '2026-06-01')).toBeLessThan(0);
  });

  it('sorts drill rows numerically when column has sum', () => {
    const columns: DrillColumn[] = [{ key: 'slip', label: 'Slip', align: 'right', sum: 'number' }];
    const rows = [
      { slip: 50, name: 'B' },
      { slip: 10, name: 'A' },
    ];
    expect(sortDrillRows(columns, rows, { key: 'slip', dir: 'asc' }).map((r) => r.slip)).toEqual([10, 50]);
  });
});

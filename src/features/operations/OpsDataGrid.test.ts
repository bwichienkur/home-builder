import { describe, expect, it } from 'vitest';
import { compareForSort, sortByKey, toggleSort } from '../../lib/dashboard/sortGrid';

describe('ops grid sort helpers', () => {
  it('toggles sort direction', () => {
    expect(toggleSort(null, 'name')).toEqual({ key: 'name', dir: 'asc' });
    expect(toggleSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' });
    expect(toggleSort({ key: 'name', dir: 'desc' }, 'pm')).toEqual({ key: 'pm', dir: 'asc' });
  });

  it('sorts rows by key', () => {
    const rows = [
      { id: '2', name: 'Beta', n: 2 },
      { id: '1', name: 'Alpha', n: 10 },
    ];
    const byName = sortByKey(rows, (r, key) => (r as Record<string, unknown>)[key], { key: 'name', dir: 'asc' });
    expect(byName.map((r) => r.name)).toEqual(['Alpha', 'Beta']);
    const byN = sortByKey(rows, (r, key) => (r as Record<string, unknown>)[key], { key: 'n', dir: 'desc' });
    expect(byN.map((r) => r.n)).toEqual([10, 2]);
  });

  it('compares empty values last', () => {
    expect(compareForSort('', 'a')).toBe(1);
    expect(compareForSort('a', '')).toBe(-1);
  });
});

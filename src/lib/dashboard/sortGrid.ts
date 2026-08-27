import type { DrillColumn, DrillRow } from './resolveDrilldown';

export type SortDirection = 'asc' | 'desc';
export type SortState<K extends string = string> = { key: K; dir: SortDirection };

export function toggleSort<K extends string>(prev: SortState<K> | null, key: K): SortState<K> {
  if (!prev || prev.key !== key) return { key, dir: 'asc' };
  return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
}

export function sortIndicator(sort: SortState | null, key: string): string {
  if (!sort || sort.key !== key) return '';
  return sort.dir === 'asc' ? ' ↑' : ' ↓';
}

export function compareForSort(a: unknown, b: unknown): number {
  const empty = (value: unknown) => value == null || value === '' || value === '—';
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1;
  if (empty(b)) return -1;
  if (typeof a === 'number' && typeof b === 'number') {
    if (!Number.isFinite(a) && !Number.isFinite(b)) return 0;
    if (!Number.isFinite(a)) return 1;
    if (!Number.isFinite(b)) return -1;
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function sortByKey<T, K extends string = string>(
  rows: T[],
  getValue: (row: T, key: K) => unknown,
  sort: SortState<K> | null,
): T[] {
  if (!sort) return rows;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => compareForSort(getValue(a, sort.key), getValue(b, sort.key)) * dir);
}

export function sortDrillRows(columns: DrillColumn[], rows: DrillRow[], sort: SortState | null): DrillRow[] {
  if (!sort) return rows;
  const col = columns.find((column) => column.key === sort.key);
  const numeric = col?.sum === 'number' || col?.sum === 'usd' || col?.sum === 'compactUsd';
  return sortByKey(rows, (row, key) => {
    const value = row[key];
    if (numeric && typeof value !== 'number') return 0;
    return value;
  }, sort);
}

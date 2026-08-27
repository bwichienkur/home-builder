import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { sortByKey, sortIndicator, toggleSort, type SortState } from '../../lib/dashboard/sortGrid';

export type OpsColumn<T> = {
  key: string;
  label: string;
  /** Default true. */
  sortable?: boolean;
  align?: 'left' | 'right';
  /** Used for sorting and text search when provided. */
  getValue?: (row: T) => unknown;
  render: (row: T) => ReactNode;
};

export type OpsFilterDef = {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

const PAGE_SIZES = [25, 50, 100] as const;

type Props<T> = {
  rows: T[];
  columns: OpsColumn<T>[];
  getRowId: (row: T) => string;
  searchPlaceholder?: string;
  empty: string;
  /** Extra dropdown filters (status, stage, …). */
  filters?: OpsFilterDef[];
  /** Default page size. */
  pageSize?: number;
  actions?: (row: T) => ReactNode;
  /** Optional initial sort. */
  initialSort?: SortState | null;
};

function cellSearchText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function OpsRowActions({
  onEdit,
  onArchive,
  onDelete,
}: {
  onEdit?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="ops-row-actions">
      {onEdit ? (
        <button type="button" className="ops-btn" onClick={onEdit}>
          Edit
        </button>
      ) : null}
      {onArchive ? (
        <button type="button" className="ops-btn ops-btn-muted" onClick={onArchive}>
          Archive
        </button>
      ) : null}
      {onDelete ? (
        <button type="button" className="ops-btn ops-btn-danger" onClick={onDelete}>
          Delete
        </button>
      ) : null}
    </div>
  );
}

export function OpsDataGrid<T>({
  rows,
  columns,
  getRowId,
  searchPlaceholder = 'Search…',
  empty,
  filters = [],
  pageSize: initialPageSize = 25,
  actions,
  initialSort = null,
}: Props<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState | null>(initialSort);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const fromCols = columns
        .map((col) => cellSearchText(col.getValue ? col.getValue(row) : (row as Record<string, unknown>)[col.key]))
        .join(' ')
        .toLowerCase();
      if (fromCols.includes(q)) return true;
      return JSON.stringify(row).toLowerCase().includes(q);
    });
  }, [rows, query, columns]);

  const sorted = useMemo(
    () =>
      sortByKey(filtered, (row, key) => {
        const col = columns.find((c) => c.key === key);
        if (col?.getValue) return col.getValue(row);
        return (row as Record<string, unknown>)[key];
      }, sort),
    [filtered, columns, sort],
  );

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);

  const filterKey = filters.map((f) => `${f.id}:${f.value}`).join('|');

  useEffect(() => {
    setPage(1);
  }, [query, pageSize, rows, filterKey]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, sorted.length);

  return (
    <div className="ops-grid">
      <div className="ops-grid-toolbar">
        <label className="ops-grid-search">
          <span className="visually-hidden">Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            type="search"
          />
        </label>
        {filters.map((filter) => (
          <label key={filter.id} className="ops-grid-filter">
            <span>{filter.label}</span>
            <select value={filter.value} onChange={(e) => filter.onChange(e.target.value)}>
              {filter.options.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <p className="ops-grid-meta">
          {sorted.length === 0 ? '0 results' : `${from}–${to} of ${sorted.length}`}
          {query.trim() || filters.some((f) => f.value) ? ` · filtered from ${rows.length}` : ''}
        </p>
      </div>

      <div className="data-table-wrap">
        {pageRows.length === 0 ? (
          <div className="data-empty">{empty}</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((col) => {
                  const sortable = col.sortable !== false;
                  return (
                    <th key={col.key} style={col.align === 'right' ? { textAlign: 'right' } : undefined}>
                      {sortable ? (
                        <button
                          type="button"
                          className="ops-sort"
                          onClick={() => setSort((prev) => toggleSort(prev, col.key))}
                        >
                          {col.label}
                          {sortIndicator(sort, col.key)}
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  );
                })}
                {actions ? (
                  <th className="ops-actions-col" style={{ textAlign: 'right' }}>
                    Actions
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={getRowId(row)}>
                  {columns.map((col) => (
                    <td key={col.key} style={col.align === 'right' ? { textAlign: 'right' } : undefined}>
                      {col.render(row)}
                    </td>
                  ))}
                  {actions ? <td className="ops-actions-col">{actions(row)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="ops-grid-pager">
        <label className="ops-grid-filter">
          <span>Rows</span>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="ops-grid-pager-btns">
          <button type="button" className="ops-btn" disabled={safePage <= 1} onClick={() => setPage(1)}>
            First
          </button>
          <button
            type="button"
            className="ops-btn"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span className="ops-grid-meta">
            Page {safePage} / {pageCount}
          </span>
          <button
            type="button"
            className="ops-btn"
            disabled={safePage >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Next
          </button>
          <button
            type="button"
            className="ops-btn"
            disabled={safePage >= pageCount}
            onClick={() => setPage(pageCount)}
          >
            Last
          </button>
        </div>
      </div>
    </div>
  );
}

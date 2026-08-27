import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  filterDrillRows,
  formatDrillCell,
  drillCellClassName,
  sumDrillColumns,
  type DrillColumn,
  type DrillRow,
  type ResolvedDrilldown,
} from '../../lib/dashboard/resolveDrilldown';
import './dashboard.css';

function isLeadColumn(col: DrillColumn, index: number) {
  return index === 0 || col.key === 'name' || col.key === 'title' || col.key === 'jobName';
}

export function DrilldownTable({ data }: { data: ResolvedDrilldown }) {
  const [query, setQuery] = useState('');
  const filteredRows = useMemo(
    () => filterDrillRows(data.columns, data.rows, query),
    [data.columns, data.rows, query],
  );
  const totals = sumDrillColumns(data.columns, filteredRows);
  const hasTotals = Object.keys(totals).length > 0;
  const leadKey = data.columns[0]?.key;
  const searching = query.trim().length > 0;

  if (data.rows.length === 0) {
    return <p className="dash-drill-empty">No detail rows for this number.</p>;
  }

  return (
    <div className="dash-drill-table-wrap">
      <div className="dash-drill-search-bar">
        <label className="dash-drill-search">
          <span className="visually-hidden">Search this list</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this list…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <p className="dash-drill-search-meta">
          {searching
            ? `${filteredRows.length} of ${data.rows.length} rows`
            : `${data.rows.length} rows`}
        </p>
      </div>
      {filteredRows.length === 0 ? (
        <p className="dash-drill-empty">No rows match “{query.trim()}”.</p>
      ) : (
        <div className="dash-table-scroll dash-drill-scroll">
          <table className="dash-table dash-table-dense dash-drill-table">
            <thead>
              <tr>
                <th className="is-num dash-drill-index dash-drill-sticky">#</th>
                {data.columns.map((col: DrillColumn, index) => (
                  <th
                    key={col.key}
                    className={[
                      col.align === 'right' ? 'is-num' : undefined,
                      isLeadColumn(col, index) ? 'dash-drill-sticky-lead' : undefined,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row: DrillRow, index) => (
                <tr key={index}>
                  <td className="is-num dash-drill-index dash-drill-sticky">{index + 1}</td>
                  {data.columns.map((col, colIndex) => (
                    <td
                      key={col.key}
                      className={[
                        col.align === 'right' ? 'is-num' : undefined,
                        isLeadColumn(col, colIndex) ? 'dash-drill-sticky-lead' : undefined,
                        drillCellClassName(col, row[col.key]),
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {formatDrillCell(col, row[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="dash-drill-total-row">
                <td className="is-num dash-drill-index dash-drill-sticky" />
                {hasTotals
                  ? data.columns.map((col, colIndex) => {
                      if (col.sum) {
                        return (
                          <td key={col.key} className="is-num">
                            {formatDrillCell(col, totals[col.key] ?? 0)}
                          </td>
                        );
                      }
                      if (colIndex === 0 || col.key === leadKey) {
                        return (
                          <td
                            key={col.key}
                            className={isLeadColumn(col, colIndex) ? 'dash-drill-sticky-lead' : undefined}
                          >
                            <strong>Total</strong>
                            <span className="dash-drill-total-count"> ({filteredRows.length})</span>
                          </td>
                        );
                      }
                      return (
                        <td
                          key={col.key}
                          className={isLeadColumn(col, colIndex) ? 'dash-drill-sticky-lead' : undefined}
                        />
                      );
                    })
                  : [
                      <td key="total" className="dash-drill-sticky-lead" colSpan={data.columns.length}>
                        <strong>Total</strong>
                        <span className="dash-drill-total-count"> {filteredRows.length} rows</span>
                      </td>,
                    ]}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export function DrillLink({
  to,
  children,
  className,
  title,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <Link to={to} className={`dash-drill-link${className ? ` ${className}` : ''}`} title={title}>
      {children}
    </Link>
  );
}

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  formatDrillCell,
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
  const totals = sumDrillColumns(data.columns, data.rows);
  const hasTotals = Object.keys(totals).length > 0;
  const leadKey = data.columns[0]?.key;

  if (data.rows.length === 0) {
    return <p className="dash-drill-empty">No detail rows for this number.</p>;
  }

  return (
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
          {data.rows.map((row: DrillRow, index) => (
            <tr key={index}>
              <td className="is-num dash-drill-index dash-drill-sticky">{index + 1}</td>
              {data.columns.map((col, colIndex) => (
                <td
                  key={col.key}
                  className={[
                    col.align === 'right' ? 'is-num' : undefined,
                    isLeadColumn(col, colIndex) ? 'dash-drill-sticky-lead' : undefined,
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
                      <td key={col.key} className={isLeadColumn(col, colIndex) ? 'dash-drill-sticky-lead' : undefined}>
                        <strong>Total</strong>
                        <span className="dash-drill-total-count"> ({data.rows.length})</span>
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
                    <span className="dash-drill-total-count"> {data.rows.length} rows</span>
                  </td>,
                ]}
          </tr>
        </tfoot>
      </table>
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

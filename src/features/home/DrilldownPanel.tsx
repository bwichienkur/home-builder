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

export function DrilldownTable({ data }: { data: ResolvedDrilldown }) {
  const totals = sumDrillColumns(data.columns, data.rows);
  const hasTotals = Object.keys(totals).length > 0;

  if (data.rows.length === 0) {
    return <p className="dash-drill-empty">No detail rows for this number.</p>;
  }

  return (
    <div className="dash-table-scroll">
      <table className="dash-table dash-table-dense">
        <thead>
          <tr>
            <th className="is-num dash-drill-index">#</th>
            {data.columns.map((col: DrillColumn) => (
              <th key={col.key} className={col.align === 'right' ? 'is-num' : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row: DrillRow, index) => (
            <tr key={index}>
              <td className="is-num dash-drill-index">{index + 1}</td>
              {data.columns.map((col) => (
                <td key={col.key} className={col.align === 'right' ? 'is-num' : undefined}>
                  {formatDrillCell(col, row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hasTotals ? (
          <tfoot>
            <tr className="dash-drill-total-row">
              <td className="is-num dash-drill-index" />
              {data.columns.map((col, colIndex) => {
                if (col.sum) {
                  return (
                    <td key={col.key} className="is-num">
                      {formatDrillCell(col, totals[col.key] ?? 0)}
                    </td>
                  );
                }
                if (colIndex === 0) {
                  return (
                    <td key={col.key}>
                      <strong>Total</strong>
                      <span className="dash-drill-total-count"> ({data.rows.length})</span>
                    </td>
                  );
                }
                return <td key={col.key} />;
              })}
            </tr>
          </tfoot>
        ) : (
          <tfoot>
            <tr className="dash-drill-total-row">
              <td className="is-num dash-drill-index" />
              <td colSpan={data.columns.length}>
                <strong>Total</strong>
                <span className="dash-drill-total-count"> {data.rows.length} rows</span>
              </td>
            </tr>
          </tfoot>
        )}
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

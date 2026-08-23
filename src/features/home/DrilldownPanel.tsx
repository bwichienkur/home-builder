import type { ReactNode } from 'react';
import type { DrillColumn, DrillRow, ResolvedDrilldown } from '../../lib/dashboard/resolveDrilldown';
import './dashboard.css';

type Props = {
  open: boolean;
  data: ResolvedDrilldown | null;
  onClose: () => void;
};

export function DrilldownPanel({ open, data, onClose }: Props) {
  if (!open || !data) return null;

  return (
    <div className="dash-drill-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dash-drill-panel"
        role="dialog"
        aria-modal="true"
        aria-label={data.title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dash-drill-head">
          <div>
            <h2>{data.title}</h2>
            <p>{data.subtitle}</p>
          </div>
          <button type="button" className="dash-drill-close" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>
        <div className="dash-table-scroll dash-drill-body">
          {data.rows.length === 0 ? (
            <p className="dash-drill-empty">No detail rows for this number.</p>
          ) : (
            <table className="dash-table dash-table-dense">
              <thead>
                <tr>
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
                    {data.columns.map((col) => (
                      <td key={col.key} className={col.align === 'right' ? 'is-num' : undefined}>
                        {row[col.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export function DrillLink({
  children,
  onClick,
  className,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button type="button" className={`dash-drill-link${className ? ` ${className}` : ''}`} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

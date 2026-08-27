import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatMonthsDays } from '../../lib/buildertrend';
import { parseDrilldownFilters, parseDrilldownKind } from '../../lib/dashboard/drilldownPath';
import { resolveDrilldown } from '../../lib/dashboard/resolveDrilldown';
import { DrilldownTable } from './DrilldownPanel';
import { useOwnerDashboardData } from './useOwnerDashboardData';
import './dashboard.css';

export function DrilldownPage() {
  const [params] = useSearchParams();
  const kind = useMemo(() => parseDrilldownKind(params), [params]);
  const filters = useMemo(() => parseDrilldownFilters(params), [params]);
  const { dash, detail, error } = useOwnerDashboardData(filters.status, filters.dateRange);

  const data = useMemo(
    () => (kind && dash ? resolveDrilldown(kind, dash.projects, detail) : null),
    [kind, dash, detail],
  );

  if (!kind) {
    return (
      <div className="data-page home-page dash-drill-page">
        <section className="owner-dash" aria-label="Dashboard detail">
          <Link className="dash-drill-back" to="/">
            ← Back to overview
          </Link>
          <p className="dash-status">Unknown detail link.</p>
        </section>
      </div>
    );
  }

  if (!dash || !data) {
    return (
      <div className="data-page home-page dash-drill-page">
        <p className="dash-status">Loading detail…</p>
      </div>
    );
  }

  return (
    <div className="data-page home-page dash-drill-page">
      <section className="owner-dash" aria-label={data.title}>
        <header className="dash-drill-page-head">
          <Link className="dash-drill-back" to="/">
            ← Back to overview
          </Link>
          <div className="dash-drill-page-titles">
            <p className="eyebrow">Olsen Custom Homes</p>
            <h1>{data.title}</h1>
            <p className="dash-drill-page-sub">{data.subtitle}</p>
            {error ? <p className="dash-source">{error}</p> : null}
          </div>
        </header>
        {data.metrics?.length ? (
          <article className="dash-card dash-drill-metrics-card">
            <h2>Estimated time metrics</h2>
            <ul className="dash-metrics dash-drill-metrics">
              {data.metrics.map((metric) => (
                <li key={metric.id}>
                  <span>{metric.label}</span>
                  <strong>{formatMonthsDays(metric.days)}</strong>
                </li>
              ))}
            </ul>
          </article>
        ) : null}
        <article className="dash-card dash-drill-page-card">
          <DrilldownTable data={data} />
        </article>
      </section>
    </div>
  );
}

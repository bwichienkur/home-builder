import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
      <section className="owner-dash dash-drill-page" aria-label="Dashboard detail">
        <p className="dash-status">Unknown detail link.</p>
        <Link className="dash-drill-back" to="/">
          ← Back to overview
        </Link>
      </section>
    );
  }

  if (!dash || !data) {
    return <p className="dash-status">Loading detail…</p>;
  }

  return (
    <section className="owner-dash dash-drill-page" aria-label={data.title}>
      <header className="dash-drill-page-head">
        <Link className="dash-drill-back" to="/">
          ← Back to overview
        </Link>
        <div>
          <p className="eyebrow">Olsen Custom Homes</p>
          <h1>{data.title}</h1>
          <p className="dash-drill-page-sub">{data.subtitle}</p>
          {error ? <p className="dash-source">{error}</p> : null}
        </div>
      </header>
      <article className="dash-card dash-drill-page-card">
        <DrilldownTable data={data} />
      </article>
    </section>
  );
}

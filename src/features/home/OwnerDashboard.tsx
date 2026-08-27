import { Fragment, useMemo, useState } from 'react';
import {
  formatCloseDate,
  formatCompactUsd,
  formatDays,
  formatDelta,
  formatMonthsDays,
  formatPct,
  formatRefreshedAt,
  formatUsd,
} from '../../lib/buildertrend';
import type { DateRangeId, JobStatus, ProjectSnapshot } from '../../lib/buildertrend/types';
import { PM_REVENUE_LAST_30D_GOAL } from '../../lib/buildertrend/types';
import type { DrilldownKind } from '../../lib/dashboard/drilldownTypes';
import { drilldownHref } from '../../lib/dashboard/drilldownPath';
import { DrillLink } from './DrilldownPanel';
import { PerformanceBars, PipelineFunnel, Sparkline, StatusDonut } from './dashboardCharts';
import { useOwnerDashboardData } from './useOwnerDashboardData';
import './dashboard.css';

function sourceLine(source: string, refreshedAt: string, live: boolean, error: string) {
  const date = new Date(refreshedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const base =
    source === 'mock'
      ? 'Demo data · Buildertrend API not connected'
      : `Buildertrend read-only${live ? ' · live pull' : ' · snapshot (refresh for latest)'} · ${date}`;
  return error ? `${base} · ${error}` : base;
}

const STATUS: { id: JobStatus; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'closed', label: 'Closed' },
  { id: 'warranty', label: 'Warranty' },
];

const RANGES: { id: DateRangeId; label: string }[] = [
  { id: 'all', label: 'All dates' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'ytd', label: 'Year to date' },
  { id: '12mo', label: 'Last 12 months' },
];

type SortKey = keyof Pick<
  ProjectSnapshot,
  'name' | 'pm' | 'pendingSelections' | 'pastDueTasks' | 'contractPrice' | 'revenueToDate' | 'pctComplete' | 'estCloseDate' | 'totalSlip'
>;

function formatRecentLogs(done: number | null, expected: number) {
  if (done == null) return `—/${expected}`;
  return `${done}/${expected}`;
}

function ThLabel({ text }: { text: string }) {
  const lines = text.split('\n');
  if (lines.length === 1) return <>{text}</>;
  return (
    <span className="dash-th-lines">
      {lines.map((line, index) => (
        <Fragment key={line}>
          {index > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))}
    </span>
  );
}

function deltaClass(delta: number, invert = false) {
  const good = invert ? delta <= 0 : delta >= 0;
  if (delta === 0) return 'is-flat';
  return good ? 'is-up' : 'is-down';
}

export function OwnerDashboard() {
  const [status, setStatus] = useState<JobStatus>('open');
  const [dateRange, setDateRange] = useState<DateRangeId>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const { dash, error, refreshing, livePull, onRefresh } = useOwnerDashboardData(status, dateRange);

  const filters = useMemo(() => ({ status, dateRange }), [status, dateRange]);
  const href = (kind: DrilldownKind) => drilldownHref(kind, filters);

  const rows = useMemo(() => {
    const list = dash?.projects ?? [];
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [dash, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  if (!dash) {
    return <p className="dash-status">Loading overview…</p>;
  }

  const now = new Date();

  return (
    <section className="owner-dash" aria-label="Owner dashboard">
      <header className="dash-head">
        <div>
          <p className="eyebrow">Olsen Custom Homes</p>
          <h1>Overview</h1>
        </div>
        <div className="dash-toolbar">
          <div className="dash-chips" role="tablist" aria-label="Job status">
            {STATUS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={status === item.id}
                className={`dash-chip${status === item.id ? ' is-active' : ''}`}
                onClick={() => setStatus(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="dash-range">
            <span className="visually-hidden">Date range</span>
            <select value={dateRange} onChange={(event) => setDateRange(event.target.value as DateRangeId)}>
              {RANGES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <p className="dash-refreshed">{formatRefreshedAt(dash.refreshedAt, now)}</p>
          <button
            type="button"
            className="dash-refresh"
            onClick={() => void onRefresh()}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            {refreshing ? 'Pulling…' : 'Refresh from Buildertrend'}
          </button>
          <p className="dash-refresh-help">
            Chrome: log in to Buildertrend tab → F12 → Application → Cookies → https://buildertrend.net, then paste
            <code> name=value; ...</code> when prompted.
          </p>
        </div>
      </header>

      <p className="dash-source">{sourceLine(dash.source, dash.refreshedAt, Boolean(livePull), error)}</p>

      <div className="dash-kpis">
        {dash.kpis.map((card) => (
          <article key={card.id} className="dash-kpi">
            <p className="dash-kpi-title">{card.title}</p>
            <p className="dash-kpi-value">
              {card.id === 'active' ? (
                <DrillLink
                  to={href({
                    type: 'all-projects',
                    label: 'Active projects',
                  })}
                >
                  {card.display}
                </DrillLink>
              ) : card.id === 'change-order' ? (
                <DrillLink to={href({ type: 'change-order-breakdown' })}>{card.display}</DrillLink>
              ) : card.id === 'wip' ? (
                <DrillLink to={href({ type: 'wip-breakdown' })}>{card.display}</DrillLink>
              ) : card.id === 'revenue' ? (
                <DrillLink to={href({ type: 'revenue-breakdown' })}>{card.display}</DrillLink>
              ) : card.id === 'pipeline' ? (
                <DrillLink to={href({ type: 'open-deals', label: 'Weighted pipeline · open deals' })}>
                  {card.display}
                </DrillLink>
              ) : (
                card.display
              )}
            </p>
            {card.detail ? <p className="dash-kpi-detail">{card.detail}</p> : null}
            <div className="dash-kpi-foot">
              <span className={`dash-delta ${deltaClass(card.delta)}`}>
                {formatDelta(card.delta, card.deltaUnit)}
              </span>
              <span className="dash-kpi-vs">{card.deltaLabel}</span>
              <Sparkline values={card.sparkline} label={`${card.title} trend`} />
            </div>
          </article>
        ))}
      </div>

      <div className="dash-widgets">
        <article className="dash-card">
          <h2>Project status overview</h2>
          <StatusDonut
            slices={dash.phases}
            hrefForSlice={(slice) => href({ type: 'phase-projects', phase: slice.phase, label: slice.label })}
            totalHref={href({ type: 'all-projects', label: 'All projects in overview' })}
          />
        </article>
        <article className="dash-card">
          <h2>Average time metrics</h2>
          <ul className="dash-metrics">
            {dash.timeMetrics.map((metric) => (
              <li key={metric.id}>
                <span>{metric.label}</span>
                <strong>{formatMonthsDays(metric.days)}</strong>
                <em className={`dash-delta ${deltaClass(metric.deltaDays, true)}`}>
                  {metric.deltaDays <= 0 ? '↓' : '↑'} {formatMonthsDays(Math.abs(metric.deltaDays))}
                </em>
              </li>
            ))}
          </ul>
        </article>
        <article className="dash-card dash-card-pm">
          <h2>Project manager scorecard</h2>
          <div className="dash-table-scroll">
            <table className="dash-table dash-table-pm dash-table-wrap-headers">
              <thead>
                <tr>
                  <th>PM</th>
                  <th>Projects</th>
                  <th>Total WIP</th>
                  <th>
                    <ThLabel text={'Revenue\n(30d)'} />
                  </th>
                  <th>
                    <ThLabel text={'Daily logs\n(4 wk)'} />
                  </th>
                  <th>
                    <ThLabel text={'Daily log %\n(life)'} />
                  </th>
                  <th>Past due</th>
                </tr>
              </thead>
              <tbody>
                {dash.pmScorecard.map((row) => (
                  <tr key={row.pm}>
                    <td>{row.pm}</td>
                    <td>
                      <DrillLink to={href({ type: 'pm-projects', pm: row.pm })}>{row.projects}</DrillLink>
                    </td>
                    <td>{formatCompactUsd(row.wip)}</td>
                    <td className={row.revenueLast30d >= PM_REVENUE_LAST_30D_GOAL ? 'is-ok' : 'is-alert'}>
                      <DrillLink to={href({ type: 'pm-revenue', pm: row.pm })}>
                        {formatCompactUsd(row.revenueLast30d)}
                      </DrillLink>
                    </td>
                    <td>
                      <DrillLink to={href({ type: 'pm-logs', pm: row.pm })}>
                        {row.dailyLogsRecentDone}/{row.dailyLogsRecentExpected}
                      </DrillLink>
                    </td>
                    <td>{formatPct(row.dailyLogLifetimePct, 0)}</td>
                    <td className={row.pastDueTasks ? 'is-alert' : undefined}>
                      <DrillLink to={href({ type: 'pm-past-due', pm: row.pm })}>{row.pastDueTasks}</DrillLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        <article className="dash-card">
          <h2>Sales pipeline</h2>
          <PipelineFunnel
            stages={dash.pipeline}
            hrefForStage={(stage) => href({ type: 'pipeline-stage', stageId: stage.id, label: stage.label })}
          />
        </article>
        <article className="dash-card">
          <h2>Sales performance</h2>
          <PerformanceBars bars={dash.salesPerformance} hrefForBar={() => href({ type: 'expected-signing' })} />
        </article>
      </div>

      <article className="dash-card dash-snapshot">
        <h2>Active projects snapshot</h2>
        <div className="dash-table-scroll">
          <table className="dash-table dash-table-dense dash-table-wrap-headers">
            <thead>
              <tr>
                {(
                  [
                    ['name', 'Project'],
                    ['pm', 'PM'],
                    ['pendingSelections', 'Pending\nsel.'],
                    ['pastDueTasks', 'Past due'],
                    ['contractPrice', 'Contract'],
                    ['revenueToDate', 'Revenue'],
                    ['pctComplete', '%\ncomplete'],
                    ['estCloseDate', 'Est.\nclose'],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th key={key}>
                    <button type="button" className="dash-sort" onClick={() => toggleSort(key)}>
                      <ThLabel text={label} />
                      {sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
                <th>
                  <ThLabel text={'Current\nschedule'} />
                </th>
                <th>
                  <button type="button" className="dash-sort" onClick={() => toggleSort('totalSlip')}>
                    <ThLabel text={'Total\nslip'} />
                    {sort.key === 'totalSlip' ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
                <th>
                  <ThLabel text={'Logs\n(4 wk)'} />
                </th>
                <th>
                  <ThLabel text={'Log %\n(life)'} />
                </th>
                <th>Permit</th>
                <th>Sel.</th>
                <th>Const.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="is-name">{row.name}</td>
                  <td>
                    <DrillLink to={href({ type: 'pm-projects', pm: row.pm })}>{row.pm}</DrillLink>
                  </td>
                  <td>
                    <DrillLink to={href({ type: 'job-selections', jobId: row.id, jobName: row.name })}>
                      {row.pendingSelections}
                    </DrillLink>
                  </td>
                  <td className={row.pastDueTasks ? 'is-alert' : undefined}>
                    <DrillLink to={href({ type: 'job-past-due', jobId: row.id, jobName: row.name })}>
                      {row.pastDueTasks}
                    </DrillLink>
                  </td>
                  <td>{formatUsd(row.contractPrice)}</td>
                  <td>{formatUsd(row.revenueToDate)}</td>
                  <td>{formatPct(row.pctComplete, 0)}</td>
                  <td>{formatCloseDate(row.estCloseDate)}</td>
                  <td className="is-notes">{row.notes || '—'}</td>
                  <td className={row.totalSlip > 0 ? 'is-alert' : 'is-ok'}>
                    <DrillLink to={href({ type: 'job-slip', jobId: row.id, jobName: row.name })}>
                      {formatDays(row.totalSlip)}
                    </DrillLink>
                  </td>
                  <td>
                    <DrillLink to={href({ type: 'job-logs', jobId: row.id, jobName: row.name })}>
                      {formatRecentLogs(row.dailyLogsRecentDone, row.dailyLogsRecentExpected)}
                    </DrillLink>
                  </td>
                  <td>{formatPct(row.dailyLogLifetimePct, 0)}</td>
                  <td>{row.slip.permit}</td>
                  <td>{row.slip.selections}</td>
                  <td>{row.slip.construction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="dash-totals">
          <strong>Project breakout totals &amp; averages</strong>
          <span>
            <DrillLink to={href({ type: 'all-projects', label: 'All projects' })}>
              {dash.totals.jobCount} jobs
            </DrillLink>
          </span>
          <span>Avg. total slip {formatDays(dash.totals.avgTotalSlipDays)}</span>
          <span>Revenue to date {formatCompactUsd(dash.totals.totalRevenueToDate)}</span>
          <span>
            <DrillLink to={href({ type: 'change-order-breakdown' })}>
              Change orders {formatCompactUsd(dash.totals.totalChangeOrderRevenue)}
            </DrillLink>
            {' '}
            ({formatPct(dash.totals.changeOrderProfitPct)} profit)
          </span>
          <span>WIP {formatCompactUsd(dash.totals.totalWip)}</span>
          <span>
            <DrillLink to={href({ type: 'all-pending-selections' })}>
              Pending selections {dash.totals.pendingSelections}
            </DrillLink>
          </span>
          <span>
            <DrillLink to={href({ type: 'all-past-due' })}>Past due {dash.totals.pastDueTasks}</DrillLink>
          </span>
          <span>
            <DrillLink to={href({ type: 'all-logs' })}>
              Daily logs (4 wk){' '}
              {formatRecentLogs(
                dash.projects.reduce((s, p) => s + (p.dailyLogsRecentDone ?? 0), 0),
                dash.projects.reduce((s, p) => s + p.dailyLogsRecentExpected, 0),
              )}
            </DrillLink>
          </span>
          <span>Avg. daily log % (life) {formatPct(dash.totals.avgDailyLogLifetimePct, 0)}</span>
        </footer>
      </article>
    </section>
  );
}

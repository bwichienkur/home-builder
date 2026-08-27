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
import type { DateRangeId, JobStatus, PmScorecardRow, ProjectSnapshot } from '../../lib/buildertrend/types';
import { PM_REVENUE_LAST_30D_GOAL } from '../../lib/buildertrend/types';
import type { DrilldownKind } from '../../lib/dashboard/drilldownTypes';
import { drilldownHref } from '../../lib/dashboard/drilldownPath';
import { sortByKey, sortIndicator, toggleSort, type SortState } from '../../lib/dashboard/sortGrid';
import { DrillLink } from './DrilldownPanel';
import { BtCookieDialog } from './BtCookieDialog';
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

function pipedriveSourceLine(live: boolean, refreshedAt: string, error: string) {
  const date = new Date(refreshedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const base = `Pipedrive read-only${live ? ' · live pull' : ' · snapshot'} · ${date}`;
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

type SortKey =
  | 'name'
  | 'pm'
  | 'pendingSelections'
  | 'pastDueTasks'
  | 'contractPrice'
  | 'revenueToDate'
  | 'pctComplete'
  | 'estCloseDate'
  | 'notes'
  | 'totalSlip'
  | 'dailyLogsRecentDone'
  | 'dailyLogLifetimePct'
  | 'slipPermit'
  | 'slipSelections'
  | 'slipConstruction';

type PmSortKey = keyof Pick<
  PmScorecardRow,
  'pm' | 'projects' | 'wip' | 'revenueLast30d' | 'dailyLogsRecentDone' | 'dailyLogLifetimePct' | 'pastDueTasks'
>;

const PM_SCORECARD_COLUMNS: { key: PmSortKey; label: string }[] = [
  { key: 'pm', label: 'PM' },
  { key: 'projects', label: 'Projects' },
  { key: 'wip', label: 'Total WIP' },
  { key: 'revenueLast30d', label: 'Revenue\n(30d)' },
  { key: 'dailyLogsRecentDone', label: 'Daily logs\n(4 wk)' },
  { key: 'dailyLogLifetimePct', label: 'Daily log %\n(life)' },
  { key: 'pastDueTasks', label: 'Past Due\nTasks' },
];

const SNAPSHOT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Project' },
  { key: 'pm', label: 'PM' },
  { key: 'pendingSelections', label: 'Pending\nsel.' },
  { key: 'pastDueTasks', label: 'Past Due\nTasks' },
  { key: 'contractPrice', label: 'Contract' },
  { key: 'revenueToDate', label: 'Revenue' },
  { key: 'pctComplete', label: '%\ncomplete' },
  { key: 'estCloseDate', label: 'Est.\nclose' },
  { key: 'notes', label: 'Current\nschedule' },
  { key: 'totalSlip', label: 'Total\nslip' },
  { key: 'dailyLogsRecentDone', label: 'Logs\n(4 wk)' },
  { key: 'dailyLogLifetimePct', label: 'Log %\n(life)' },
  { key: 'slipPermit', label: 'Permit' },
  { key: 'slipSelections', label: 'Sel.' },
  { key: 'slipConstruction', label: 'Const.' },
];

function projectSortValue(row: ProjectSnapshot, key: SortKey): unknown {
  switch (key) {
    case 'notes':
      return row.notes || '';
    case 'dailyLogsRecentDone':
      return row.dailyLogsRecentDone ?? -1;
    case 'slipPermit':
      return row.slip.permit;
    case 'slipSelections':
      return row.slip.selections;
    case 'slipConstruction':
      return row.slip.construction;
    default:
      return row[key as keyof ProjectSnapshot];
  }
}

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
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'name', dir: 'asc' });
  const [pmSort, setPmSort] = useState<SortState<PmSortKey>>({ key: 'pm', dir: 'asc' });
  const {
    dash,
    error,
    pipedriveError,
    refreshing,
    refreshingPipedrive,
    livePull,
    livePdPull,
    pipedriveRefreshedAt,
    cookiePrompt,
    resolveCookiePrompt,
    onRefresh,
    onRefreshPipedrive,
  } = useOwnerDashboardData(status, dateRange);

  const filters = useMemo(() => ({ status, dateRange }), [status, dateRange]);
  const href = (kind: DrilldownKind) => drilldownHref(kind, filters);

  const rows = useMemo(
    () => sortByKey(dash?.projects ?? [], projectSortValue, sort),
    [dash, sort],
  );

  const pmRows = useMemo(
    () => sortByKey(dash?.pmScorecard ?? [], (row, key) => row[key as PmSortKey], pmSort),
    [dash, pmSort],
  );

  const toggleProjectSort = (key: SortKey) => {
    setSort((prev) => toggleSort(prev, key));
  };

  const togglePmSort = (key: PmSortKey) => {
    setPmSort((prev) => toggleSort(prev, key));
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
          <div className="dash-refresh-group">
            <p className="dash-refreshed">
              <span className="dash-refresh-label">Buildertrend</span>
              {formatRefreshedAt(dash.refreshedAt, now)}
            </p>
            <button
              type="button"
              className="dash-refresh"
              onClick={() => void onRefresh()}
              disabled={refreshing || Boolean(cookiePrompt)}
              aria-busy={refreshing}
            >
              {refreshing ? 'Pulling…' : 'Refresh from Buildertrend'}
            </button>
          </div>
          <div className="dash-refresh-group">
            <p className="dash-refreshed">
              <span className="dash-refresh-label">Pipedrive</span>
              {pipedriveRefreshedAt ? formatRefreshedAt(pipedriveRefreshedAt, now) : 'No pull yet'}
            </p>
            <button
              type="button"
              className="dash-refresh"
              onClick={() => void onRefreshPipedrive()}
              disabled={refreshingPipedrive}
              aria-busy={refreshingPipedrive}
            >
              {refreshingPipedrive ? 'Pulling…' : 'Refresh from Pipedrive'}
            </button>
          </div>
        </div>
      </header>

      {cookiePrompt ? (
        <BtCookieDialog
          reason={cookiePrompt.reason}
          onSubmit={(cookie) => resolveCookiePrompt(cookie)}
          onCancel={() => resolveCookiePrompt(null)}
        />
      ) : null}

      <p className="dash-source">{sourceLine(dash.source, dash.refreshedAt, Boolean(livePull), error)}</p>
      <p className="dash-source">
        {pipedriveSourceLine(Boolean(livePdPull), pipedriveRefreshedAt, pipedriveError)}
      </p>

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
                  {PM_SCORECARD_COLUMNS.map(({ key, label }) => (
                    <th key={key}>
                      <button type="button" className="dash-sort" onClick={() => togglePmSort(key)}>
                        <ThLabel text={label} />
                        {sortIndicator(pmSort, key)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pmRows.map((row) => (
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
                {SNAPSHOT_COLUMNS.map(({ key, label }) => (
                  <th key={key}>
                    <button type="button" className="dash-sort" onClick={() => toggleProjectSort(key)}>
                      <ThLabel text={label} />
                      {sortIndicator(sort, key)}
                    </button>
                  </th>
                ))}
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

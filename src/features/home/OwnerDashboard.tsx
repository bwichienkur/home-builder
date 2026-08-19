import { useEffect, useMemo, useState } from 'react';
import {
  fetchCachedBuildertrendPull,
  formatCloseDate,
  formatCompactUsd,
  formatDays,
  formatDelta,
  formatPct,
  formatRefreshedAt,
  formatUsd,
  getOwnerDashboardProvider,
  loadStoredLivePull,
  mapBuildertrendReports,
  mockOwnerDashboardProvider,
  phaseLabel,
  refreshBuildertrendPull,
  storeLivePull,
  clearStoredLivePull,
  summarizeOwnerDashboard,
} from '../../lib/buildertrend';
import type { BuildertrendLivePull } from '../../lib/buildertrend';
import type { DateRangeId, JobStatus, OwnerDashboard, OwnerDashboardFilters, ProjectSnapshot } from '../../lib/buildertrend/types';
import { PerformanceBars, PipelineFunnel, Sparkline, StatusDonut } from './dashboardCharts';
import './dashboard.css';

function dashboardFromPull(pull: BuildertrendLivePull, filters: OwnerDashboardFilters): OwnerDashboard {
  const mapped = mapBuildertrendReports(pull.reports, { now: new Date(pull.pulledAt) });
  return summarizeOwnerDashboard({
    source: 'buildertrend',
    refreshedAt: pull.pulledAt,
    filters,
    ...mapped,
  });
}

function sourceLine(dash: OwnerDashboard, live: boolean, error: string) {
  const date = new Date(dash.refreshedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const base =
    dash.source === 'mock'
      ? 'Demo data · Buildertrend API not connected'
      : `Buildertrend read-only${live ? ' · live pull' : ' snapshot'} · ${date}`;
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
  'name' | 'pm' | 'pendingSelections' | 'pastDueTasks' | 'contractPrice' | 'revenueToDate' | 'pctComplete' | 'estCloseDate' | 'phase' | 'totalSlip'
>;

function formatRecentLogs(done: number | null, expected: number) {
  if (done == null) return `—/${expected}`;
  return `${done}/${expected}`;
}

function deltaClass(delta: number, invert = false) {
  const good = invert ? delta <= 0 : delta >= 0;
  if (delta === 0) return 'is-flat';
  return good ? 'is-up' : 'is-down';
}

export function OwnerDashboard() {
  const [status, setStatus] = useState<JobStatus>('open');
  const [dateRange, setDateRange] = useState<DateRangeId>('all');
  const [dash, setDash] = useState<OwnerDashboard | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [livePull, setLivePull] = useState<BuildertrendLivePull | null>(() => loadStoredLivePull());
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });

  useEffect(() => {
    let cancelled = false;
    const filters = { status, dateRange };
    if (livePull) {
      try {
        setDash(dashboardFromPull(livePull, filters));
      } catch {
        clearStoredLivePull();
        setLivePull(null);
      }
      return () => {
        cancelled = true;
      };
    }
    const provider = getOwnerDashboardProvider();
    void provider.getDashboard(filters).then(
      (next) => {
        if (!cancelled) {
          setDash(next);
          setError('');
        }
      },
      async (reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : 'Dashboard could not load.');
        const fallback = await mockOwnerDashboardProvider.getDashboard(filters);
        if (!cancelled) setDash(fallback);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [status, dateRange, livePull]);

  useEffect(() => {
    let cancelled = false;
    void fetchCachedBuildertrendPull().then((cached) => {
      if (cancelled || !cached) return;
      setLivePull((prev) => {
        if (prev && prev.pulledAt >= cached.pulledAt) return prev;
        storeLivePull(cached);
        return cached;
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const pull = await refreshBuildertrendPull();
      setLivePull(pull);
      setError('');
    } catch (reason: unknown) {
      const err = reason instanceof Error ? reason : null;
      const code = (reason as any)?.code;
      if (code === 'credentials_missing') {
        const pasted = window
          .prompt(
            'Paste Buildertrend cookie header (BUILDERTREND_COOKIE) from your logged-in Buildertrend tab:\n\nFormat: name1=value1; name2=value2; ...',
          )
          ?.trim();
        if (pasted) {
          try {
            const pull = await refreshBuildertrendPull(pasted);
            setLivePull(pull);
            setError('');
            return;
          } catch (retryReason: unknown) {
            setError(retryReason instanceof Error ? retryReason.message : 'Buildertrend refresh failed.');
            return;
          }
        }
      }
      setError(err ? err.message : 'Buildertrend refresh failed.');
    } finally {
      setRefreshing(false);
    }
  };

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

      <p className="dash-source">
        {sourceLine(dash, Boolean(livePull), error)}
      </p>

      <div className="dash-kpis">
        {dash.kpis.map((card) => (
          <article key={card.id} className="dash-kpi">
            <p className="dash-kpi-title">{card.title}</p>
            <p className="dash-kpi-value">{card.display}</p>
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
          <StatusDonut slices={dash.phases} />
        </article>
        <article className="dash-card">
          <h2>Average time metrics</h2>
          <ul className="dash-metrics">
            {dash.timeMetrics.map((metric) => (
              <li key={metric.id}>
                <span>{metric.label}</span>
                <strong>{metric.days} days</strong>
                <em className={`dash-delta ${deltaClass(metric.deltaDays, true)}`}>
                  {metric.deltaDays <= 0 ? '↓' : '↑'} {Math.abs(metric.deltaDays)} days
                </em>
              </li>
            ))}
          </ul>
        </article>
        <article className="dash-card dash-card-wide">
          <h2>Project manager scorecard</h2>
          <div className="dash-table-scroll">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>PM</th>
                  <th>Projects</th>
                  <th>Total WIP</th>
                  <th>Daily logs (4 wk)</th>
                  <th>Daily log % (life)</th>
                  <th>Past due</th>
                </tr>
              </thead>
              <tbody>
                {dash.pmScorecard.map((row) => (
                  <tr key={row.pm}>
                    <td>{row.pm}</td>
                    <td>{row.projects}</td>
                    <td>{formatCompactUsd(row.wip)}</td>
                    <td>
                      {row.dailyLogsRecentDone}/{row.dailyLogsRecentExpected}
                    </td>
                    <td>{formatPct(row.dailyLogLifetimePct, 0)}</td>
                    <td className={row.pastDueTasks ? 'is-alert' : undefined}>{row.pastDueTasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        <article className="dash-card">
          <h2>Sales pipeline</h2>
          <PipelineFunnel stages={dash.pipeline} />
        </article>
        <article className="dash-card">
          <h2>Sales performance</h2>
          <PerformanceBars bars={dash.salesPerformance} />
        </article>
      </div>

      <article className="dash-card dash-snapshot">
        <h2>Active projects snapshot</h2>
        <div className="dash-table-scroll">
          <table className="dash-table dash-table-dense">
            <thead>
              <tr>
                {(
                  [
                    ['name', 'Project'],
                    ['pm', 'PM'],
                    ['pendingSelections', 'Pending sel.'],
                    ['pastDueTasks', 'Past due'],
                    ['contractPrice', 'Contract'],
                    ['revenueToDate', 'Revenue'],
                    ['pctComplete', '% complete'],
                    ['estCloseDate', 'Est. close'],
                    ['phase', 'Phase'],
                    ['totalSlip', 'Total slip'],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th key={key}>
                    <button type="button" className="dash-sort" onClick={() => toggleSort(key)}>
                      {label}
                      {sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
                <th>Logs (4 wk)</th>
                <th>Log % (life)</th>
                <th>Permit</th>
                <th>Sel.</th>
                <th>Purch.</th>
                <th>Const.</th>
                <th>Notes / risks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="is-name">{row.name}</td>
                  <td>{row.pm}</td>
                  <td>{row.pendingSelections}</td>
                  <td className={row.pastDueTasks ? 'is-alert' : undefined}>{row.pastDueTasks}</td>
                  <td>{formatUsd(row.contractPrice)}</td>
                  <td>{formatUsd(row.revenueToDate)}</td>
                  <td>{formatPct(row.pctComplete, 0)}</td>
                  <td>{formatCloseDate(row.estCloseDate)}</td>
                  <td>{phaseLabel(row.phase)}</td>
                  <td className={row.totalSlip > 0 ? 'is-alert' : 'is-ok'}>{formatDays(row.totalSlip)}</td>
                  <td>
                    {formatRecentLogs(row.dailyLogsRecentDone, row.dailyLogsRecentExpected)}
                  </td>
                  <td>{formatPct(row.dailyLogLifetimePct, 0)}</td>
                  <td>{row.slip.permit}</td>
                  <td>{row.slip.selections}</td>
                  <td>{row.slip.purchasing}</td>
                  <td>{row.slip.construction}</td>
                  <td className="is-notes">{row.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="dash-totals">
          <strong>Project breakout totals &amp; averages</strong>
          <span>{dash.totals.jobCount} jobs</span>
          <span>Avg. total slip {formatDays(dash.totals.avgTotalSlipDays)}</span>
          <span>Revenue to date {formatCompactUsd(dash.totals.totalRevenueToDate)}</span>
          <span>Contract {formatCompactUsd(dash.totals.totalContract)}</span>
          <span>WIP {formatCompactUsd(dash.totals.totalWip)}</span>
          <span>Pending selections {dash.totals.pendingSelections}</span>
          <span>Past due {dash.totals.pastDueTasks}</span>
          <span>
            Daily logs (4 wk) {formatRecentLogs(
              dash.projects.reduce((s, p) => s + (p.dailyLogsRecentDone ?? 0), 0),
              dash.projects.reduce((s, p) => s + p.dailyLogsRecentExpected, 0),
            )}
          </span>
          <span>Avg. daily log % (life) {formatPct(dash.totals.avgDailyLogLifetimePct, 0)}</span>
        </footer>
      </article>
    </section>
  );
}

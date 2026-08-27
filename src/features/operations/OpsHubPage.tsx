import { Link } from 'react-router-dom';
import { isNativeOwnerDashboard } from '../../lib/buildertrend';
import { OpsDataGrid } from './OpsDataGrid';
import { useOpsStore } from './useOpsStore';

type HubRow = {
  id: string;
  section: string;
  records: number;
  to: string;
};

export function OpsHubPage() {
  const ops = useOpsStore();
  const native = isNativeOwnerDashboard();

  const rows: HubRow[] = [
    { id: 'jobs', section: 'Jobs', records: ops.jobs.length, to: '/ops/jobs' },
    { id: 'logs', section: 'Daily logs', records: ops.logs.length, to: '/ops/logs' },
    { id: 'tasks', section: 'Tasks', records: ops.tasks.length, to: '/ops/tasks' },
    { id: 'selections', section: 'Selections', records: ops.selections.length, to: '/ops/selections' },
    { id: 'deals', section: 'Deals', records: ops.deals.length, to: '/ops/deals' },
    { id: 'people', section: 'People', records: ops.people.length, to: '/ops/people' },
    {
      id: 'reports',
      section: 'Reports',
      records: ops.scheduleItems.length + ops.cashflow.length,
      to: '/ops/reports',
    },
  ];

  return (
    <div className="data-page">
      <header className="data-page-header">
        <div>
          <p className="eyebrow">operations</p>
          <h1>Operations data</h1>
          <p className="muted">
            In-app jobs, logs, tasks, selections, deals, people, schedule, cashflow, and BT-style reports
            (including time metrics). No Buildertrend or Pipedrive write-back. Owner Dashboard uses this store
            only when <code>VITE_BUILDERTREND_PROVIDER=native</code>.
          </p>
        </div>
        <div className="data-page-actions">
          <button type="button" className="ops-btn" onClick={() => ops.resetFromSnapshot()}>
            Reset from snapshot
          </button>
          <button
            type="button"
            className="ops-btn ops-btn-danger"
            onClick={() => {
              if (window.confirm('Clear all Operations data?')) ops.clearAll();
            }}
          >
            Clear store
          </button>
        </div>
      </header>

      <p className="muted" style={{ marginBottom: 8 }}>
        Dashboard provider: <strong>{native ? 'native' : 'snapshot (default)'}</strong>
        {!native
          ? ' — edit Operations freely; Home still shows the baked BT snapshot until you set the env flag.'
          : ' — Home reads this Operations store.'}
      </p>
      <p className="muted" style={{ marginBottom: 16 }}>
        Storage: <strong>{ops.http ? 'shared HTTP API (Postgres or file)' : 'this browser (localStorage)'}</strong>
        {ops.hydrating ? ' · syncing…' : ''}
        {ops.remoteError ? ` · ${ops.remoteError}` : ''}
      </p>

      <OpsDataGrid
        rows={rows}
        getRowId={(r) => r.id}
        searchPlaceholder="Filter sections…"
        empty="No sections."
        pageSize={25}
        initialSort={{ key: 'section', dir: 'asc' }}
        columns={[
          { key: 'section', label: 'Section', getValue: (r) => r.section, render: (r) => r.section },
          {
            key: 'records',
            label: 'Records',
            align: 'right',
            getValue: (r) => r.records,
            render: (r) => r.records,
          },
        ]}
        actions={(row) => (
          <Link to={row.to} className="ops-btn">
            Open
          </Link>
        )}
      />
    </div>
  );
}

import { Link } from 'react-router-dom';
import { isNativeOwnerDashboard } from '../../lib/buildertrend';
import { useOpsStore } from './useOpsStore';

export function OpsHubPage() {
  const ops = useOpsStore();
  const native = isNativeOwnerDashboard();

  return (
    <div className="data-page">
      <header className="data-page-header">
        <div>
          <p className="eyebrow">operations</p>
          <h1>Operations data</h1>
          <p className="muted">
            In-app jobs, logs, tasks, selections, deals, and people. No Buildertrend or Pipedrive write-back.
            Owner Dashboard uses this store only when <code>VITE_BUILDERTREND_PROVIDER=native</code>.
          </p>
        </div>
        <div className="data-page-actions">
          <button type="button" onClick={() => ops.resetFromSnapshot()}>
            Reset from snapshot
          </button>
          <button
            type="button"
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

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Section</th>
              <th>Records</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Jobs</td>
              <td>{ops.jobs.length}</td>
              <td>
                <Link to="/ops/jobs" className="auth-link">
                  Open
                </Link>
              </td>
            </tr>
            <tr>
              <td>Daily logs</td>
              <td>{ops.logs.length}</td>
              <td>
                <Link to="/ops/logs" className="auth-link">
                  Open
                </Link>
              </td>
            </tr>
            <tr>
              <td>Tasks</td>
              <td>{ops.tasks.length}</td>
              <td>
                <Link to="/ops/tasks" className="auth-link">
                  Open
                </Link>
              </td>
            </tr>
            <tr>
              <td>Selections</td>
              <td>{ops.selections.length}</td>
              <td>
                <Link to="/ops/selections" className="auth-link">
                  Open
                </Link>
              </td>
            </tr>
            <tr>
              <td>Deals</td>
              <td>{ops.deals.length}</td>
              <td>
                <Link to="/ops/deals" className="auth-link">
                  Open
                </Link>
              </td>
            </tr>
            <tr>
              <td>People</td>
              <td>{ops.people.length}</td>
              <td>
                <Link to="/ops/people" className="auth-link">
                  Open
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

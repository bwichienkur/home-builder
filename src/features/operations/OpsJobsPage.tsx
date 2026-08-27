import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EntityDrawer } from '../crm/EntityCrmPage';
import { newOpsId, type OpsJob } from '../../lib/operations';
import type { JobStatus, OwnerPhase } from '../../lib/buildertrend/types';
import { useOpsStore } from './useOpsStore';

const emptyJob = (): OpsJob => ({
  id: newOpsId('job'),
  name: '',
  pm: '',
  status: 'open',
  phase: 'construction',
  openedAt: new Date().toISOString().slice(0, 10),
  estCloseDate: '',
  notes: '',
  foundationStarted: true,
  contractPrice: 0,
  revenueToDate: 0,
  revenueLast30d: 0,
  wip: 0,
  changeOrderRevenue: 0,
  changeOrderProfit: 0,
  slip: { permit: 0, selections: 0, construction: 0 },
  totalSlip: 0,
  updatedAt: new Date().toISOString(),
});

export function OpsJobsPage() {
  const ops = useOpsStore();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<OpsJob | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ops.jobs;
    return ops.jobs.filter((j) => JSON.stringify(j).toLowerCase().includes(q));
  }, [ops.jobs, query]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft?.name.trim()) return;
    ops.saveJob({ ...draft, updatedAt: new Date().toISOString() });
    setDraft(null);
  };

  return (
    <>
      <div className="data-page">
        <header className="data-page-header">
          <div>
            <p className="eyebrow">operations</p>
            <h1>Jobs</h1>
            <p className="muted">Open jobs that feed the Owner Dashboard when the native provider is on.</p>
          </div>
          <div className="data-page-actions">
            <Link to="/ops" className="auth-link">
              Hub
            </Link>
            <button type="button" className="primary" onClick={() => setDraft(emptyJob())}>
              Add job
            </button>
          </div>
        </header>
        <div style={{ marginBottom: 12 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jobs…"
            style={{
              width: 'min(360px, 100%)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: '10px 12px',
            }}
          />
        </div>
        <div className="data-table-wrap">
          {rows.length === 0 ? (
            <div className="data-empty">No jobs yet. Add one or reset from the snapshot on the Ops hub.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>PM</th>
                  <th>Status</th>
                  <th>Phase</th>
                  <th>Contract</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <Link to={`/ops/jobs/${encodeURIComponent(job.id)}`} className="auth-link">
                        {job.name}
                      </Link>
                    </td>
                    <td>{job.pm || '—'}</td>
                    <td>{job.status}</td>
                    <td>{job.phase}</td>
                    <td>${Math.round(job.contractPrice).toLocaleString()}</td>
                    <td>
                      <button type="button" className="auth-link" onClick={() => setDraft({ ...job })}>
                        Edit
                      </button>
                      {' · '}
                      <button type="button" className="auth-link" onClick={() => ops.archiveJob(job.id)}>
                        Archive
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <EntityDrawer title={draft && ops.jobs.some((j) => j.id === draft.id) ? 'Edit job' : 'Add job'} open={!!draft} onClose={() => setDraft(null)}>
        {draft ? (
          <form className="data-form" onSubmit={onSubmit}>
            <fieldset className="data-form-section">
              <legend>Basics</legend>
              <div className="data-form-row">
                <label>
                  Name
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
                </label>
                <label>
                  PM
                  <input value={draft.pm} onChange={(e) => setDraft({ ...draft, pm: e.target.value })} />
                </label>
              </div>
              <div className="data-form-row">
                <label>
                  Status
                  <select
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value as JobStatus })}
                  >
                    <option value="open">open</option>
                    <option value="closed">closed</option>
                    <option value="warranty">warranty</option>
                  </select>
                </label>
                <label>
                  Phase
                  <select
                    value={draft.phase}
                    onChange={(e) => setDraft({ ...draft, phase: e.target.value as OwnerPhase })}
                  >
                    <option value="design">design</option>
                    <option value="permitting">permitting</option>
                    <option value="construction">construction</option>
                    <option value="closeout">closeout</option>
                  </select>
                </label>
              </div>
              <div className="data-form-row">
                <label>
                  Opened
                  <input
                    type="date"
                    value={draft.openedAt.slice(0, 10)}
                    onChange={(e) => setDraft({ ...draft, openedAt: e.target.value })}
                  />
                </label>
                <label>
                  Est. close
                  <input
                    type="date"
                    value={draft.estCloseDate.slice(0, 10)}
                    onChange={(e) => setDraft({ ...draft, estCloseDate: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Current schedule item / notes
                <input
                  value={draft.currentScheduleItem || draft.notes}
                  onChange={(e) => setDraft({ ...draft, currentScheduleItem: e.target.value, notes: e.target.value })}
                />
              </label>
            </fieldset>
            <fieldset className="data-form-section">
              <legend>Financials (USD)</legend>
              <div className="data-form-row">
                <label>
                  Contract
                  <input
                    type="number"
                    value={draft.contractPrice}
                    onChange={(e) => setDraft({ ...draft, contractPrice: Number(e.target.value) || 0 })}
                  />
                </label>
                <label>
                  Revenue to date
                  <input
                    type="number"
                    value={draft.revenueToDate}
                    onChange={(e) => setDraft({ ...draft, revenueToDate: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
              <div className="data-form-row">
                <label>
                  Revenue last 30d
                  <input
                    type="number"
                    value={draft.revenueLast30d}
                    onChange={(e) => setDraft({ ...draft, revenueLast30d: Number(e.target.value) || 0 })}
                  />
                </label>
                <label>
                  WIP
                  <input
                    type="number"
                    value={draft.wip}
                    onChange={(e) => setDraft({ ...draft, wip: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
              <div className="data-form-row">
                <label>
                  CO revenue
                  <input
                    type="number"
                    value={draft.changeOrderRevenue}
                    onChange={(e) => setDraft({ ...draft, changeOrderRevenue: Number(e.target.value) || 0 })}
                  />
                </label>
                <label>
                  CO profit
                  <input
                    type="number"
                    value={draft.changeOrderProfit}
                    onChange={(e) => setDraft({ ...draft, changeOrderProfit: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
            </fieldset>
            <fieldset className="data-form-section">
              <legend>Slip (days)</legend>
              <div className="data-form-row">
                <label>
                  Permit
                  <input
                    type="number"
                    value={draft.slip.permit}
                    onChange={(e) =>
                      setDraft({ ...draft, slip: { ...draft.slip, permit: Number(e.target.value) || 0 } })
                    }
                  />
                </label>
                <label>
                  Selections
                  <input
                    type="number"
                    value={draft.slip.selections}
                    onChange={(e) =>
                      setDraft({ ...draft, slip: { ...draft.slip, selections: Number(e.target.value) || 0 } })
                    }
                  />
                </label>
                <label>
                  Construction
                  <input
                    type="number"
                    value={draft.slip.construction}
                    onChange={(e) =>
                      setDraft({ ...draft, slip: { ...draft.slip, construction: Number(e.target.value) || 0 } })
                    }
                  />
                </label>
                <label>
                  Total slip
                  <input
                    type="number"
                    value={draft.totalSlip}
                    onChange={(e) => setDraft({ ...draft, totalSlip: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
              <label className="data-form-check">
                <input
                  type="checkbox"
                  checked={draft.foundationStarted !== false}
                  onChange={(e) => setDraft({ ...draft, foundationStarted: e.target.checked })}
                />
                Foundation started (daily logs required)
              </label>
            </fieldset>
            <div className="data-form-actions">
              <button type="button" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Save
              </button>
            </div>
          </form>
        ) : null}
      </EntityDrawer>
    </>
  );
}

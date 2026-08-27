import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EntityDrawer } from '../crm/EntityCrmPage';
import { newOpsId, type OpsJob } from '../../lib/operations';
import type { JobStatus, OwnerPhase } from '../../lib/buildertrend/types';
import { OpsDataGrid, OpsRowActions } from './OpsDataGrid';
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
  const [draft, setDraft] = useState<OpsJob | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');

  const rows = useMemo(() => {
    return ops.jobs.filter((j) => {
      if (statusFilter && j.status !== statusFilter) return false;
      if (phaseFilter && j.phase !== phaseFilter) return false;
      return true;
    });
  }, [ops.jobs, statusFilter, phaseFilter]);

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
            <Link to="/ops" className="ops-btn">
              Hub
            </Link>
            <button type="button" className="ops-btn primary" onClick={() => setDraft(emptyJob())}>
              Add job
            </button>
          </div>
        </header>

        <OpsDataGrid
          rows={rows}
          getRowId={(j) => j.id}
          searchPlaceholder="Search jobs…"
          empty="No jobs match. Add one or reset from the snapshot on the Ops hub."
          initialSort={{ key: 'name', dir: 'asc' }}
          filters={[
            {
              id: 'status',
              label: 'Status',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: '', label: 'All' },
                { value: 'open', label: 'open' },
                { value: 'closed', label: 'closed' },
                { value: 'warranty', label: 'warranty' },
              ],
            },
            {
              id: 'phase',
              label: 'Phase',
              value: phaseFilter,
              onChange: setPhaseFilter,
              options: [
                { value: '', label: 'All' },
                { value: 'design', label: 'design' },
                { value: 'permitting', label: 'permitting' },
                { value: 'construction', label: 'construction' },
                { value: 'closeout', label: 'closeout' },
              ],
            },
          ]}
          columns={[
            {
              key: 'name',
              label: 'Job',
              getValue: (j) => j.name,
              render: (job) => (
                <Link to={`/ops/jobs/${encodeURIComponent(job.id)}`} className="ops-link">
                  {job.name}
                </Link>
              ),
            },
            { key: 'pm', label: 'PM', getValue: (j) => j.pm, render: (j) => j.pm || '—' },
            { key: 'status', label: 'Status', getValue: (j) => j.status, render: (j) => j.status },
            { key: 'phase', label: 'Phase', getValue: (j) => j.phase, render: (j) => j.phase },
            {
              key: 'contractPrice',
              label: 'Contract',
              align: 'right',
              getValue: (j) => j.contractPrice,
              render: (j) => `$${Math.round(j.contractPrice).toLocaleString()}`,
            },
          ]}
          actions={(job) => (
            <OpsRowActions onEdit={() => setDraft({ ...job })} onArchive={() => ops.archiveJob(job.id)} />
          )}
        />
      </div>

      <EntityDrawer
        title={draft && ops.jobs.some((j) => j.id === draft.id) ? 'Edit job' : 'Add job'}
        open={!!draft}
        onClose={() => setDraft(null)}
      >
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
              <legend>Schedule milestones (time metrics)</legend>
              <div className="data-form-row">
                <label>
                  First schedule start
                  <input
                    type="date"
                    value={(draft.estFirstScheduleStart || '').slice(0, 10)}
                    onChange={(e) => setDraft({ ...draft, estFirstScheduleStart: e.target.value })}
                  />
                </label>
                <label>
                  Permitting end
                  <input
                    type="date"
                    value={(draft.estPermittingEnd || '').slice(0, 10)}
                    onChange={(e) => setDraft({ ...draft, estPermittingEnd: e.target.value })}
                  />
                </label>
              </div>
              <div className="data-form-row">
                <label>
                  Foundation start
                  <input
                    type="date"
                    value={(draft.estFoundationStart || '').slice(0, 10)}
                    onChange={(e) => setDraft({ ...draft, estFoundationStart: e.target.value })}
                  />
                </label>
                <label>
                  Closing end
                  <input
                    type="date"
                    value={(draft.estClosingEnd || '').slice(0, 10)}
                    onChange={(e) => setDraft({ ...draft, estClosingEnd: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Lifetime daily logs (BT total)
                <input
                  type="number"
                  min={0}
                  value={draft.lifetimeDailyLogCount ?? 0}
                  onChange={(e) => setDraft({ ...draft, lifetimeDailyLogCount: Number(e.target.value) || 0 })}
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
              <button type="button" className="ops-btn" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="ops-btn primary">
                Save
              </button>
            </div>
          </form>
        ) : null}
      </EntityDrawer>
    </>
  );
}

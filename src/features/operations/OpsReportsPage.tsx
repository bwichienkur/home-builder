import { FormEvent, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { EntityDrawer } from '../crm/EntityCrmPage';
import {
  newOpsId,
  OPS_REPORTS,
  opsReportById,
  type OpsCashflowEntry,
  type OpsReportId,
  type OpsScheduleItem,
} from '../../lib/operations';
import { OpsDataGrid, OpsRowActions } from './OpsDataGrid';
import { useOpsStore } from './useOpsStore';

export function OpsReportsHubPage() {
  const ops = useOpsStore();
  const counts: Record<OpsReportId, number> = {
    wip: ops.jobs.length,
    'change-orders': ops.jobs.filter((j) => j.changeOrderRevenue || j.changeOrderProfit).length,
    cashflow: ops.cashflow.length,
    'past-due': ops.tasks.filter((t) => t.status === 'incomplete').length,
    selections: ops.selections.filter((s) => s.status === 'pending').length,
    'daily-logs': ops.logs.length,
    'schedule-slip': ops.scheduleItems.length,
    pipeline: ops.deals.length,
  };

  return (
    <div className="data-page">
      <header className="data-page-header">
        <div>
          <p className="eyebrow">operations</p>
          <h1>Reports</h1>
          <p className="muted">
            In-app views that mirror the Buildertrend / Pipedrive reports feeding the Owner Dashboard. Edit the
            underlying Operations data — no BT write-back.
          </p>
        </div>
        <div className="data-page-actions">
          <Link to="/ops" className="ops-btn">
            Hub
          </Link>
        </div>
      </header>

      <OpsDataGrid
        rows={OPS_REPORTS.map((r) => ({ ...r, records: counts[r.id] }))}
        getRowId={(r) => r.id}
        searchPlaceholder="Search reports…"
        empty="No reports."
        initialSort={{ key: 'title', dir: 'asc' }}
        columns={[
          { key: 'title', label: 'Report', getValue: (r) => r.title, render: (r) => r.title },
          {
            key: 'sourceReport',
            label: 'Replaces',
            getValue: (r) => r.sourceReport,
            render: (r) => r.sourceReport,
          },
          {
            key: 'records',
            label: 'Rows',
            align: 'right',
            getValue: (r) => r.records,
            render: (r) => r.records,
          },
        ]}
        actions={(row) => (
          <Link to={`/ops/reports/${row.id}`} className="ops-btn">
            Open
          </Link>
        )}
      />
    </div>
  );
}

export function OpsReportDetailPage() {
  const { reportId = '' } = useParams();
  const def = opsReportById(reportId);
  if (!def) return <Navigate to="/ops/reports" replace />;

  return (
    <div className="data-page">
      <header className="data-page-header">
        <div>
          <p className="eyebrow">operations · reports</p>
          <h1>{def.title}</h1>
          <p className="muted">{def.lede}</p>
          <p className="muted" style={{ marginTop: 6 }}>
            Source: {def.sourceReport}
          </p>
        </div>
        <div className="data-page-actions">
          <Link to="/ops/reports" className="ops-btn">
            All reports
          </Link>
          {def.manageTo ? (
            <Link to={def.manageTo} className="ops-btn">
              Manage data
            </Link>
          ) : null}
        </div>
      </header>
      <ReportBody reportId={def.id} />
    </div>
  );
}

function ReportBody({ reportId }: { reportId: OpsReportId }) {
  const ops = useOpsStore();
  const today = new Date().toISOString().slice(0, 10);

  if (reportId === 'wip') {
    return (
      <OpsDataGrid
        rows={ops.jobs}
        getRowId={(j) => j.id}
        searchPlaceholder="Search jobs…"
        empty="No jobs."
        initialSort={{ key: 'wip', dir: 'desc' }}
        columns={[
          {
            key: 'name',
            label: 'Job',
            getValue: (j) => j.name,
            render: (j) => (
              <Link to={`/ops/jobs/${encodeURIComponent(j.id)}`} className="ops-link">
                {j.name}
              </Link>
            ),
          },
          { key: 'pm', label: 'PM', getValue: (j) => j.pm, render: (j) => j.pm || '—' },
          { key: 'status', label: 'Status', getValue: (j) => j.status, render: (j) => j.status },
          {
            key: 'contractPrice',
            label: 'Contract',
            align: 'right',
            getValue: (j) => j.contractPrice,
            render: (j) => `$${Math.round(j.contractPrice).toLocaleString()}`,
          },
          {
            key: 'revenueToDate',
            label: 'Revenue',
            align: 'right',
            getValue: (j) => j.revenueToDate,
            render: (j) => `$${Math.round(j.revenueToDate).toLocaleString()}`,
          },
          {
            key: 'wip',
            label: 'WIP',
            align: 'right',
            getValue: (j) => j.wip,
            render: (j) => `$${Math.round(j.wip).toLocaleString()}`,
          },
        ]}
      />
    );
  }

  if (reportId === 'change-orders') {
    return (
      <OpsDataGrid
        rows={ops.jobs}
        getRowId={(j) => j.id}
        searchPlaceholder="Search jobs…"
        empty="No jobs."
        initialSort={{ key: 'changeOrderRevenue', dir: 'desc' }}
        columns={[
          {
            key: 'name',
            label: 'Job',
            getValue: (j) => j.name,
            render: (j) => (
              <Link to={`/ops/jobs/${encodeURIComponent(j.id)}`} className="ops-link">
                {j.name}
              </Link>
            ),
          },
          {
            key: 'changeOrderRevenue',
            label: 'CO revenue',
            align: 'right',
            getValue: (j) => j.changeOrderRevenue,
            render: (j) => `$${Math.round(j.changeOrderRevenue).toLocaleString()}`,
          },
          {
            key: 'changeOrderProfit',
            label: 'CO profit',
            align: 'right',
            getValue: (j) => j.changeOrderProfit,
            render: (j) => `$${Math.round(j.changeOrderProfit).toLocaleString()}`,
          },
          {
            key: 'pct',
            label: 'Profit %',
            align: 'right',
            getValue: (j) => (j.changeOrderRevenue ? j.changeOrderProfit / j.changeOrderRevenue : 0),
            render: (j) =>
              j.changeOrderRevenue
                ? `${Math.round((j.changeOrderProfit / j.changeOrderRevenue) * 1000) / 10}%`
                : '—',
          },
        ]}
      />
    );
  }

  if (reportId === 'past-due') {
    const rows = ops.tasks.filter((t) => t.status === 'incomplete' && t.dueDate && t.dueDate < today);
    return (
      <OpsDataGrid
        rows={rows}
        getRowId={(r) => r.id}
        searchPlaceholder="Search tasks…"
        empty="No past-due tasks."
        initialSort={{ key: 'dueDate', dir: 'asc' }}
        columns={[
          {
            key: 'job',
            label: 'Job',
            getValue: (r) => ops.jobName(r.jobId),
            render: (r) => (
              <Link to={`/ops/jobs/${encodeURIComponent(r.jobId)}`} className="ops-link">
                {ops.jobName(r.jobId)}
              </Link>
            ),
          },
          { key: 'title', label: 'Task', getValue: (r) => r.title, render: (r) => r.title },
          { key: 'assignee', label: 'Assignee', getValue: (r) => r.assignee, render: (r) => r.assignee || '—' },
          { key: 'dueDate', label: 'Due', getValue: (r) => r.dueDate, render: (r) => r.dueDate },
        ]}
      />
    );
  }

  if (reportId === 'selections') {
    const rows = ops.selections.filter((s) => s.status === 'pending');
    return (
      <OpsDataGrid
        rows={rows}
        getRowId={(r) => r.id}
        searchPlaceholder="Search selections…"
        empty="No pending selections."
        initialSort={{ key: 'title', dir: 'asc' }}
        columns={[
          {
            key: 'job',
            label: 'Job',
            getValue: (r) => ops.jobName(r.jobId),
            render: (r) => (
              <Link to={`/ops/jobs/${encodeURIComponent(r.jobId)}`} className="ops-link">
                {ops.jobName(r.jobId)}
              </Link>
            ),
          },
          { key: 'title', label: 'Title', getValue: (r) => r.title, render: (r) => r.title },
          { key: 'category', label: 'Category', getValue: (r) => r.category, render: (r) => r.category || '—' },
          { key: 'deadline', label: 'Deadline', getValue: (r) => r.deadline, render: (r) => r.deadline || '—' },
        ]}
      />
    );
  }

  if (reportId === 'daily-logs') {
    return (
      <OpsDataGrid
        rows={ops.logs}
        getRowId={(r) => r.id}
        searchPlaceholder="Search logs…"
        empty="No logs."
        initialSort={{ key: 'date', dir: 'desc' }}
        columns={[
          { key: 'date', label: 'Date', getValue: (r) => r.date, render: (r) => r.date.slice(0, 10) },
          {
            key: 'job',
            label: 'Job',
            getValue: (r) => ops.jobName(r.jobId),
            render: (r) => (
              <Link to={`/ops/jobs/${encodeURIComponent(r.jobId)}`} className="ops-link">
                {ops.jobName(r.jobId)}
              </Link>
            ),
          },
          { key: 'author', label: 'Author', getValue: (r) => r.author, render: (r) => r.author },
          {
            key: 'isPm',
            label: 'PM?',
            getValue: (r) => (r.isPm ? 1 : 0),
            render: (r) => (r.isPm ? 'Yes' : 'No'),
          },
        ]}
      />
    );
  }

  if (reportId === 'pipeline') {
    return (
      <OpsDataGrid
        rows={ops.deals}
        getRowId={(r) => r.id}
        searchPlaceholder="Search deals…"
        empty="No deals."
        initialSort={{ key: 'value', dir: 'desc' }}
        columns={[
          { key: 'title', label: 'Deal', getValue: (r) => r.title, render: (r) => r.title },
          { key: 'stage', label: 'Stage', getValue: (r) => r.stage, render: (r) => r.stage },
          {
            key: 'value',
            label: 'Value',
            align: 'right',
            getValue: (r) => r.value,
            render: (r) => `$${Math.round(r.value).toLocaleString()}`,
          },
          {
            key: 'confidence',
            label: 'Conf %',
            align: 'right',
            getValue: (r) => r.confidence,
            render: (r) => `${r.confidence}%`,
          },
          {
            key: 'expectedCloseDate',
            label: 'Expected close',
            getValue: (r) => r.expectedCloseDate || '',
            render: (r) => r.expectedCloseDate || '—',
          },
        ]}
      />
    );
  }

  if (reportId === 'cashflow') {
    return <CashflowReport />;
  }

  if (reportId === 'schedule-slip') {
    return <ScheduleSlipReport />;
  }

  return null;
}

function CashflowReport() {
  const ops = useOpsStore();
  const [draft, setDraft] = useState<OpsCashflowEntry | null>(null);

  return (
    <>
      <div className="data-page-actions" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="ops-btn primary"
          onClick={() =>
            setDraft({
              id: newOpsId('cf'),
              jobId: ops.jobs[0]?.id || '',
              date: new Date().toISOString().slice(0, 10),
              amount: 0,
              type: 'money_in',
              note: '',
              updatedAt: new Date().toISOString(),
            })
          }
        >
          Add entry
        </button>
      </div>
      <OpsDataGrid
        rows={ops.cashflow}
        getRowId={(r) => r.id}
        searchPlaceholder="Search cashflow…"
        empty="No cashflow entries. Add one or reset from snapshot."
        initialSort={{ key: 'date', dir: 'desc' }}
        columns={[
          { key: 'date', label: 'Date', getValue: (r) => r.date, render: (r) => r.date },
          {
            key: 'job',
            label: 'Job',
            getValue: (r) => ops.jobName(r.jobId),
            render: (r) => ops.jobName(r.jobId),
          },
          { key: 'type', label: 'Type', getValue: (r) => r.type, render: (r) => r.type },
          {
            key: 'amount',
            label: 'Amount',
            align: 'right',
            getValue: (r) => r.amount,
            render: (r) => `$${Math.round(r.amount).toLocaleString()}`,
          },
          { key: 'note', label: 'Note', getValue: (r) => r.note || '', render: (r) => r.note || '—' },
        ]}
        actions={(row) => (
          <OpsRowActions onEdit={() => setDraft({ ...row })} onDelete={() => ops.removeCashflow(row.id)} />
        )}
      />
      <EntityDrawer title="Cashflow entry" open={!!draft} onClose={() => setDraft(null)} fullscreen={false}>
        {draft ? (
          <form
            className="data-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!draft.jobId) return;
              ops.saveCashflow(draft);
              setDraft(null);
            }}
          >
            <label>
              Job
              <select value={draft.jobId} onChange={(e) => setDraft({ ...draft, jobId: e.target.value })} required>
                <option value="">—</option>
                {ops.jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                value={draft.date.slice(0, 10)}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <label>
              Type
              <select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as OpsCashflowEntry['type'] })}
              >
                <option value="money_in">money_in</option>
                <option value="money_out">money_out</option>
              </select>
            </label>
            <label>
              Amount
              <input
                type="number"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) || 0 })}
              />
            </label>
            <label>
              Note
              <input value={draft.note || ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </label>
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

function ScheduleSlipReport() {
  const ops = useOpsStore();
  const [draft, setDraft] = useState<OpsScheduleItem | null>(null);
  const [jobFilter, setJobFilter] = useState('');

  const rows = useMemo(() => {
    if (!jobFilter) return ops.scheduleItems;
    return ops.scheduleItems.filter((r) => r.jobId === jobFilter);
  }, [ops.scheduleItems, jobFilter]);

  return (
    <>
      <div className="data-page-actions" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="ops-btn primary"
          onClick={() =>
            setDraft({
              id: newOpsId('sched'),
              jobId: ops.jobs[0]?.id || '',
              title: '',
              endDateSlip: 0,
              durationSlip: 0,
              expectedStartDate: '',
              actualStartDate: '',
              expectedEndDate: '',
              actualEndDate: '',
              completed: false,
              updatedAt: new Date().toISOString(),
            })
          }
        >
          Add schedule item
        </button>
      </div>
      <OpsDataGrid
        rows={rows}
        getRowId={(r) => r.id}
        searchPlaceholder="Search schedule items…"
        empty="No schedule slip rows. Reset from snapshot to import BT baseline items."
        initialSort={{ key: 'endDateSlip', dir: 'desc' }}
        filters={[
          {
            id: 'job',
            label: 'Job',
            value: jobFilter,
            onChange: setJobFilter,
            options: [
              { value: '', label: 'All jobs' },
              ...ops.jobs.map((j) => ({ value: j.id, label: j.name })),
            ],
          },
        ]}
        columns={[
          {
            key: 'job',
            label: 'Job',
            getValue: (r) => ops.jobName(r.jobId),
            render: (r) => ops.jobName(r.jobId),
          },
          { key: 'title', label: 'Item', getValue: (r) => r.title, render: (r) => r.title },
          {
            key: 'endDateSlip',
            label: 'End slip',
            align: 'right',
            getValue: (r) => r.endDateSlip,
            render: (r) => r.endDateSlip,
          },
          {
            key: 'durationSlip',
            label: 'Duration slip',
            align: 'right',
            getValue: (r) => r.durationSlip,
            render: (r) => r.durationSlip,
          },
          {
            key: 'completed',
            label: 'Done',
            getValue: (r) => (r.completed ? 1 : 0),
            render: (r) => (r.completed ? 'Yes' : 'No'),
          },
        ]}
        actions={(row) => (
          <OpsRowActions onEdit={() => setDraft({ ...row })} onDelete={() => ops.removeScheduleItem(row.id)} />
        )}
      />
      <EntityDrawer title="Schedule item" open={!!draft} onClose={() => setDraft(null)} fullscreen={false}>
        {draft ? (
          <form
            className="data-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!draft.jobId || !draft.title.trim()) return;
              ops.saveScheduleItem(draft);
              setDraft(null);
            }}
          >
            <label>
              Job
              <select value={draft.jobId} onChange={(e) => setDraft({ ...draft, jobId: e.target.value })} required>
                <option value="">—</option>
                {ops.jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required />
            </label>
            <div className="data-form-row">
              <label>
                End date slip
                <input
                  type="number"
                  value={draft.endDateSlip}
                  onChange={(e) => setDraft({ ...draft, endDateSlip: Number(e.target.value) || 0 })}
                />
              </label>
              <label>
                Duration slip
                <input
                  type="number"
                  value={draft.durationSlip}
                  onChange={(e) => setDraft({ ...draft, durationSlip: Number(e.target.value) || 0 })}
                />
              </label>
            </div>
            <label className="data-form-check">
              <input
                type="checkbox"
                checked={draft.completed}
                onChange={(e) => setDraft({ ...draft, completed: e.target.checked })}
              />
              Completed
            </label>
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

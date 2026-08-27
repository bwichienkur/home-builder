import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EntityDrawer } from '../crm/EntityCrmPage';
import {
  newOpsId,
  type OpsDailyLog,
  type OpsSelection,
  type OpsTask,
} from '../../lib/operations';
import { OpsDataGrid, OpsRowActions } from './OpsDataGrid';
import { useOpsStore } from './useOpsStore';

export function OpsTasksPage() {
  const ops = useOpsStore();
  const [draft, setDraft] = useState<OpsTask | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [dueFilter, setDueFilter] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  const rows = useMemo(() => {
    return ops.tasks.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (dueFilter === 'past-due') {
        return t.status === 'incomplete' && t.dueDate && t.dueDate < today;
      }
      if (dueFilter === 'upcoming') {
        return t.status === 'incomplete' && t.dueDate && t.dueDate >= today;
      }
      return true;
    });
  }, [ops.tasks, statusFilter, dueFilter, today]);

  return (
    <>
      <div className="data-page">
        <header className="data-page-header">
          <div>
            <p className="eyebrow">operations</p>
            <h1>All tasks</h1>
            <p className="muted">
              Tasks across every job. Seed imports <strong>all incomplete</strong> Buildertrend tasks when
              LIVE_OPS_IMPORT is present (past-due + future + no due date); Home snapshot stays past-due-only.
            </p>
          </div>
          <div className="data-page-actions">
            <Link to="/ops" className="ops-btn">
              Hub
            </Link>
            <button
              type="button"
              className="ops-btn primary"
              onClick={() =>
                setDraft({
                  id: newOpsId('task'),
                  jobId: ops.jobs[0]?.id || '',
                  title: '',
                  assignee: '',
                  dueDate: new Date().toISOString().slice(0, 10),
                  status: 'incomplete',
                  updatedAt: new Date().toISOString(),
                })
              }
            >
              Add task
            </button>
          </div>
        </header>

        <OpsDataGrid
          rows={rows}
          getRowId={(r) => r.id}
          searchPlaceholder="Search tasks…"
          empty="No tasks match."
          initialSort={{ key: 'dueDate', dir: 'asc' }}
          filters={[
            {
              id: 'status',
              label: 'Status',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: '', label: 'All' },
                { value: 'incomplete', label: 'incomplete' },
                { value: 'complete', label: 'complete' },
              ],
            },
            {
              id: 'due',
              label: 'Due',
              value: dueFilter,
              onChange: setDueFilter,
              options: [
                { value: '', label: 'All' },
                { value: 'past-due', label: 'Past due' },
                { value: 'upcoming', label: 'Due today / future' },
              ],
            },
          ]}
          columns={[
            {
              key: 'job',
              label: 'Job',
              getValue: (r) => ops.jobName(r.jobId),
              render: (row) => (
                <Link to={`/ops/jobs/${encodeURIComponent(row.jobId)}`} className="ops-link">
                  {ops.jobName(row.jobId)}
                </Link>
              ),
            },
            { key: 'title', label: 'Title', getValue: (r) => r.title, render: (r) => r.title },
            { key: 'assignee', label: 'Assignee', getValue: (r) => r.assignee, render: (r) => r.assignee || '—' },
            { key: 'dueDate', label: 'Due', getValue: (r) => r.dueDate, render: (r) => r.dueDate || '—' },
            { key: 'status', label: 'Status', getValue: (r) => r.status, render: (r) => r.status },
          ]}
          actions={(row) => (
            <OpsRowActions onEdit={() => setDraft({ ...row })} onDelete={() => ops.removeTask(row.id)} />
          )}
        />
      </div>

      <EntityDrawer title="Task" open={!!draft} onClose={() => setDraft(null)} fullscreen={false}>
        {draft ? (
          <form
            className="data-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!draft.title.trim() || !draft.jobId) return;
              ops.saveTask(draft);
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
            <label>
              Assignee
              <input value={draft.assignee} onChange={(e) => setDraft({ ...draft, assignee: e.target.value })} />
            </label>
            <label>
              Due
              <input
                type="date"
                value={draft.dueDate.slice(0, 10)}
                onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
              />
            </label>
            <label>
              Status
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as OpsTask['status'] })}
              >
                <option value="incomplete">incomplete</option>
                <option value="complete">complete</option>
              </select>
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

export function OpsLogsPage() {
  const ops = useOpsStore();
  const [draft, setDraft] = useState<OpsDailyLog | null>(null);
  const [pmFilter, setPmFilter] = useState('');

  const rows = useMemo(() => {
    if (pmFilter === 'pm') return ops.logs.filter((l) => l.isPm);
    if (pmFilter === 'other') return ops.logs.filter((l) => !l.isPm);
    return ops.logs;
  }, [ops.logs, pmFilter]);

  return (
    <>
      <div className="data-page">
        <header className="data-page-header">
          <div>
            <p className="eyebrow">operations</p>
            <h1>All daily logs</h1>
            <p className="muted">
              Logs across jobs. BT seed expands user×job aggregates from the rolling window into editable rows.
            </p>
          </div>
          <div className="data-page-actions">
            <Link to="/ops" className="ops-btn">
              Hub
            </Link>
            <button
              type="button"
              className="ops-btn primary"
              onClick={() =>
                setDraft({
                  id: newOpsId('log'),
                  jobId: ops.jobs[0]?.id || '',
                  date: new Date().toISOString().slice(0, 10),
                  author: ops.jobs[0]?.pm || '',
                  isPm: true,
                  note: '',
                  updatedAt: new Date().toISOString(),
                })
              }
            >
              Add log
            </button>
          </div>
        </header>

        <OpsDataGrid
          rows={rows}
          getRowId={(r) => r.id}
          searchPlaceholder="Search logs…"
          empty="No logs match."
          initialSort={{ key: 'date', dir: 'desc' }}
          filters={[
            {
              id: 'pm',
              label: 'Author',
              value: pmFilter,
              onChange: setPmFilter,
              options: [
                { value: '', label: 'All' },
                { value: 'pm', label: 'PM only' },
                { value: 'other', label: 'Non-PM' },
              ],
            },
          ]}
          columns={[
            {
              key: 'date',
              label: 'Date',
              getValue: (r) => r.date.slice(0, 10),
              render: (r) => r.date.slice(0, 10),
            },
            {
              key: 'job',
              label: 'Job',
              getValue: (r) => ops.jobName(r.jobId),
              render: (row) => (
                <Link to={`/ops/jobs/${encodeURIComponent(row.jobId)}`} className="ops-link">
                  {ops.jobName(row.jobId)}
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
            { key: 'note', label: 'Note', getValue: (r) => r.note || '', render: (r) => r.note || '—' },
          ]}
          actions={(row) => (
            <OpsRowActions onEdit={() => setDraft({ ...row })} onDelete={() => ops.removeLog(row.id)} />
          )}
        />
      </div>

      <EntityDrawer title="Daily log" open={!!draft} onClose={() => setDraft(null)} fullscreen={false}>
        {draft ? (
          <form
            className="data-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!draft.jobId || !draft.author.trim()) return;
              ops.saveLog(draft);
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
                required
              />
            </label>
            <label>
              Author
              <input value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} required />
            </label>
            <label className="data-form-check">
              <input
                type="checkbox"
                checked={draft.isPm}
                onChange={(e) => setDraft({ ...draft, isPm: e.target.checked })}
              />
              Counts as PM log
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

export function OpsSelectionsPage() {
  const ops = useOpsStore();
  const [draft, setDraft] = useState<OpsSelection | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const rows = useMemo(() => {
    if (!statusFilter) return ops.selections;
    return ops.selections.filter((s) => s.status === statusFilter);
  }, [ops.selections, statusFilter]);

  return (
    <>
      <div className="data-page">
        <header className="data-page-header">
          <div>
            <p className="eyebrow">operations</p>
            <h1>All selections</h1>
            <p className="muted">Pending (and other) selections across jobs from the BT drilldown bake.</p>
          </div>
          <div className="data-page-actions">
            <Link to="/ops" className="ops-btn">
              Hub
            </Link>
            <button
              type="button"
              className="ops-btn primary"
              onClick={() =>
                setDraft({
                  id: newOpsId('sel'),
                  jobId: ops.jobs[0]?.id || '',
                  title: '',
                  category: '',
                  location: '',
                  status: 'pending',
                  deadline: '',
                  updatedAt: new Date().toISOString(),
                })
              }
            >
              Add selection
            </button>
          </div>
        </header>

        <OpsDataGrid
          rows={rows}
          getRowId={(r) => r.id}
          searchPlaceholder="Search selections…"
          empty="No selections match."
          initialSort={{ key: 'title', dir: 'asc' }}
          filters={[
            {
              id: 'status',
              label: 'Status',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: '', label: 'All' },
                { value: 'pending', label: 'pending' },
                { value: 'selected', label: 'selected' },
                { value: 'completed', label: 'completed' },
              ],
            },
          ]}
          columns={[
            {
              key: 'job',
              label: 'Job',
              getValue: (r) => ops.jobName(r.jobId),
              render: (row) => (
                <Link to={`/ops/jobs/${encodeURIComponent(row.jobId)}`} className="ops-link">
                  {ops.jobName(row.jobId)}
                </Link>
              ),
            },
            { key: 'title', label: 'Title', getValue: (r) => r.title, render: (r) => r.title },
            { key: 'category', label: 'Category', getValue: (r) => r.category, render: (r) => r.category || '—' },
            { key: 'status', label: 'Status', getValue: (r) => r.status, render: (r) => r.status },
            { key: 'deadline', label: 'Deadline', getValue: (r) => r.deadline, render: (r) => r.deadline || '—' },
          ]}
          actions={(row) => (
            <OpsRowActions onEdit={() => setDraft({ ...row })} onDelete={() => ops.removeSelection(row.id)} />
          )}
        />
      </div>

      <EntityDrawer title="Selection" open={!!draft} onClose={() => setDraft(null)} fullscreen={false}>
        {draft ? (
          <form
            className="data-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!draft.title.trim() || !draft.jobId) return;
              ops.saveSelection(draft);
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
            <label>
              Category
              <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
            </label>
            <label>
              Location
              <input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
            </label>
            <label>
              Status
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as OpsSelection['status'] })}
              >
                <option value="pending">pending</option>
                <option value="selected">selected</option>
                <option value="completed">completed</option>
              </select>
            </label>
            <label>
              Deadline
              <input
                type="date"
                value={draft.deadline.slice(0, 10)}
                onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
              />
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

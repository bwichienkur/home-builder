import { FormEvent, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EntityDrawer } from '../crm/EntityCrmPage';
import { newOpsId, type OpsDailyLog, type OpsSelection, type OpsTask } from '../../lib/operations';
import { OpsDataGrid, OpsRowActions } from './OpsDataGrid';
import { useOpsStore } from './useOpsStore';

type Tab = 'logs' | 'tasks' | 'selections';

export function OpsJobDetailPage() {
  const { jobId = '' } = useParams();
  const id = decodeURIComponent(jobId);
  const ops = useOpsStore();
  const job = ops.allJobs.find((j) => j.id === id);
  const [tab, setTab] = useState<Tab>('logs');
  const [logDraft, setLogDraft] = useState<OpsDailyLog | null>(null);
  const [taskDraft, setTaskDraft] = useState<OpsTask | null>(null);
  const [selDraft, setSelDraft] = useState<OpsSelection | null>(null);
  const [taskStatus, setTaskStatus] = useState('');
  const [selStatus, setSelStatus] = useState('');

  const logs = useMemo(() => ops.logs.filter((l) => l.jobId === id), [ops.logs, id]);
  const tasks = useMemo(() => {
    const list = ops.tasks.filter((t) => t.jobId === id);
    return taskStatus ? list.filter((t) => t.status === taskStatus) : list;
  }, [ops.tasks, id, taskStatus]);
  const selections = useMemo(() => {
    const list = ops.selections.filter((s) => s.jobId === id);
    return selStatus ? list.filter((s) => s.status === selStatus) : list;
  }, [ops.selections, id, selStatus]);

  if (!job) {
    return (
      <div className="data-page">
        <p className="muted">Job not found.</p>
        <Link to="/ops/jobs" className="ops-btn">
          Back to jobs
        </Link>
      </div>
    );
  }

  return (
    <div className="data-page">
      <header className="data-page-header">
        <div>
          <p className="eyebrow">operations · job</p>
          <h1>{job.name}</h1>
          <p className="muted">
            {job.pm || 'Unassigned'} · {job.status} · {job.phase}
          </p>
        </div>
        <div className="data-page-actions">
          <Link to="/ops/jobs" className="ops-btn">
            All jobs
          </Link>
        </div>
      </header>

      <div className="data-page-actions" style={{ marginBottom: 16 }} role="tablist" aria-label="Job records">
        {(
          [
            ['logs', `Logs (${logs.length})`],
            ['tasks', `Tasks (${ops.tasks.filter((t) => t.jobId === id).length})`],
            ['selections', `Selections (${ops.selections.filter((s) => s.jobId === id).length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            className={`ops-btn${tab === key ? ' primary' : ''}`}
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'logs' ? (
        <>
          <div className="data-page-actions" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="ops-btn primary"
              onClick={() =>
                setLogDraft({
                  id: newOpsId('log'),
                  jobId: id,
                  date: new Date().toISOString().slice(0, 10),
                  author: job.pm || '',
                  isPm: true,
                  note: '',
                  updatedAt: new Date().toISOString(),
                })
              }
            >
              Add log
            </button>
          </div>
          <OpsDataGrid
            rows={logs}
            getRowId={(r) => r.id}
            searchPlaceholder="Search logs…"
            empty="No daily logs."
            initialSort={{ key: 'date', dir: 'desc' }}
            columns={[
              {
                key: 'date',
                label: 'Date',
                getValue: (r) => r.date.slice(0, 10),
                render: (r) => r.date.slice(0, 10),
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
              <OpsRowActions onEdit={() => setLogDraft({ ...row })} onDelete={() => ops.removeLog(row.id)} />
            )}
          />
        </>
      ) : null}

      {tab === 'tasks' ? (
        <>
          <div className="data-page-actions" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="ops-btn primary"
              onClick={() =>
                setTaskDraft({
                  id: newOpsId('task'),
                  jobId: id,
                  title: '',
                  assignee: job.pm || '',
                  dueDate: new Date().toISOString().slice(0, 10),
                  status: 'incomplete',
                  updatedAt: new Date().toISOString(),
                })
              }
            >
              Add task
            </button>
          </div>
          <OpsDataGrid
            rows={tasks}
            getRowId={(r) => r.id}
            searchPlaceholder="Search tasks…"
            empty="No tasks match."
            initialSort={{ key: 'dueDate', dir: 'asc' }}
            filters={[
              {
                id: 'status',
                label: 'Status',
                value: taskStatus,
                onChange: setTaskStatus,
                options: [
                  { value: '', label: 'All' },
                  { value: 'incomplete', label: 'incomplete' },
                  { value: 'complete', label: 'complete' },
                ],
              },
            ]}
            columns={[
              { key: 'title', label: 'Title', getValue: (r) => r.title, render: (r) => r.title },
              { key: 'assignee', label: 'Assignee', getValue: (r) => r.assignee, render: (r) => r.assignee || '—' },
              { key: 'dueDate', label: 'Due', getValue: (r) => r.dueDate, render: (r) => r.dueDate.slice(0, 10) },
              { key: 'status', label: 'Status', getValue: (r) => r.status, render: (r) => r.status },
            ]}
            actions={(row) => (
              <OpsRowActions onEdit={() => setTaskDraft({ ...row })} onDelete={() => ops.removeTask(row.id)} />
            )}
          />
        </>
      ) : null}

      {tab === 'selections' ? (
        <>
          <div className="data-page-actions" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="ops-btn primary"
              onClick={() =>
                setSelDraft({
                  id: newOpsId('sel'),
                  jobId: id,
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
          <OpsDataGrid
            rows={selections}
            getRowId={(r) => r.id}
            searchPlaceholder="Search selections…"
            empty="No selections match."
            initialSort={{ key: 'title', dir: 'asc' }}
            filters={[
              {
                id: 'status',
                label: 'Status',
                value: selStatus,
                onChange: setSelStatus,
                options: [
                  { value: '', label: 'All' },
                  { value: 'pending', label: 'pending' },
                  { value: 'selected', label: 'selected' },
                  { value: 'completed', label: 'completed' },
                ],
              },
            ]}
            columns={[
              { key: 'title', label: 'Title', getValue: (r) => r.title, render: (r) => r.title },
              { key: 'category', label: 'Category', getValue: (r) => r.category, render: (r) => r.category || '—' },
              { key: 'status', label: 'Status', getValue: (r) => r.status, render: (r) => r.status },
              { key: 'deadline', label: 'Deadline', getValue: (r) => r.deadline, render: (r) => r.deadline || '—' },
            ]}
            actions={(row) => (
              <OpsRowActions onEdit={() => setSelDraft({ ...row })} onDelete={() => ops.removeSelection(row.id)} />
            )}
          />
        </>
      ) : null}

      <EntityDrawer title="Daily log" open={!!logDraft} onClose={() => setLogDraft(null)} fullscreen={false}>
        {logDraft ? (
          <form
            className="data-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              ops.saveLog(logDraft);
              setLogDraft(null);
            }}
          >
            <label>
              Date
              <input
                type="date"
                value={logDraft.date.slice(0, 10)}
                onChange={(e) => setLogDraft({ ...logDraft, date: e.target.value })}
                required
              />
            </label>
            <label>
              Author
              <input
                value={logDraft.author}
                onChange={(e) => setLogDraft({ ...logDraft, author: e.target.value })}
                required
              />
            </label>
            <label className="data-form-check">
              <input
                type="checkbox"
                checked={logDraft.isPm}
                onChange={(e) => setLogDraft({ ...logDraft, isPm: e.target.checked })}
              />
              Counts as PM log
            </label>
            <label>
              Note
              <input value={logDraft.note || ''} onChange={(e) => setLogDraft({ ...logDraft, note: e.target.value })} />
            </label>
            <div className="data-form-actions">
              <button type="button" className="ops-btn" onClick={() => setLogDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="ops-btn primary">
                Save
              </button>
            </div>
          </form>
        ) : null}
      </EntityDrawer>

      <EntityDrawer title="Task" open={!!taskDraft} onClose={() => setTaskDraft(null)} fullscreen={false}>
        {taskDraft ? (
          <form
            className="data-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!taskDraft.title.trim()) return;
              ops.saveTask(taskDraft);
              setTaskDraft(null);
            }}
          >
            <label>
              Title
              <input
                value={taskDraft.title}
                onChange={(e) => setTaskDraft({ ...taskDraft, title: e.target.value })}
                required
              />
            </label>
            <label>
              Assignee
              <input
                value={taskDraft.assignee}
                onChange={(e) => setTaskDraft({ ...taskDraft, assignee: e.target.value })}
              />
            </label>
            <label>
              Due
              <input
                type="date"
                value={taskDraft.dueDate.slice(0, 10)}
                onChange={(e) => setTaskDraft({ ...taskDraft, dueDate: e.target.value })}
              />
            </label>
            <label>
              Status
              <select
                value={taskDraft.status}
                onChange={(e) => setTaskDraft({ ...taskDraft, status: e.target.value as OpsTask['status'] })}
              >
                <option value="incomplete">incomplete</option>
                <option value="complete">complete</option>
              </select>
            </label>
            <div className="data-form-actions">
              <button type="button" className="ops-btn" onClick={() => setTaskDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="ops-btn primary">
                Save
              </button>
            </div>
          </form>
        ) : null}
      </EntityDrawer>

      <EntityDrawer title="Selection" open={!!selDraft} onClose={() => setSelDraft(null)} fullscreen={false}>
        {selDraft ? (
          <form
            className="data-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!selDraft.title.trim()) return;
              ops.saveSelection(selDraft);
              setSelDraft(null);
            }}
          >
            <label>
              Title
              <input
                value={selDraft.title}
                onChange={(e) => setSelDraft({ ...selDraft, title: e.target.value })}
                required
              />
            </label>
            <label>
              Category
              <input
                value={selDraft.category}
                onChange={(e) => setSelDraft({ ...selDraft, category: e.target.value })}
              />
            </label>
            <label>
              Location
              <input
                value={selDraft.location}
                onChange={(e) => setSelDraft({ ...selDraft, location: e.target.value })}
              />
            </label>
            <label>
              Status
              <select
                value={selDraft.status}
                onChange={(e) => setSelDraft({ ...selDraft, status: e.target.value as OpsSelection['status'] })}
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
                value={selDraft.deadline.slice(0, 10)}
                onChange={(e) => setSelDraft({ ...selDraft, deadline: e.target.value })}
              />
            </label>
            <div className="data-form-actions">
              <button type="button" className="ops-btn" onClick={() => setSelDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="ops-btn primary">
                Save
              </button>
            </div>
          </form>
        ) : null}
      </EntityDrawer>
    </div>
  );
}

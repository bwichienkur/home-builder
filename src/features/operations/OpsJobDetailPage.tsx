import { FormEvent, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EntityDrawer } from '../crm/EntityCrmPage';
import { newOpsId, type OpsDailyLog, type OpsSelection, type OpsTask } from '../../lib/operations';
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

  const logs = useMemo(() => ops.logs.filter((l) => l.jobId === id), [ops.logs, id]);
  const tasks = useMemo(() => ops.tasks.filter((t) => t.jobId === id), [ops.tasks, id]);
  const selections = useMemo(() => ops.selections.filter((s) => s.jobId === id), [ops.selections, id]);

  if (!job) {
    return (
      <div className="data-page">
        <p className="muted">Job not found.</p>
        <Link to="/ops/jobs" className="auth-link">
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
          <Link to="/ops/jobs" className="auth-link">
            All jobs
          </Link>
        </div>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }} role="tablist" aria-label="Job records">
        {(
          [
            ['logs', `Logs (${logs.length})`],
            ['tasks', `Tasks (${tasks.length})`],
            ['selections', `Selections (${selections.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            className={tab === key ? 'primary' : undefined}
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
              className="primary"
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
          <div className="data-table-wrap">
            {logs.length === 0 ? (
              <div className="data-empty">No daily logs.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Author</th>
                    <th>PM?</th>
                    <th>Note</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr key={row.id}>
                      <td>{row.date.slice(0, 10)}</td>
                      <td>{row.author}</td>
                      <td>{row.isPm ? 'Yes' : 'No'}</td>
                      <td>{row.note || '—'}</td>
                      <td>
                        <button type="button" className="auth-link" onClick={() => setLogDraft({ ...row })}>
                          Edit
                        </button>
                        {' · '}
                        <button type="button" className="auth-link" onClick={() => ops.removeLog(row.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}

      {tab === 'tasks' ? (
        <>
          <div className="data-page-actions" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="primary"
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
          <div className="data-table-wrap">
            {tasks.length === 0 ? (
              <div className="data-empty">No tasks.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Assignee</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((row) => (
                    <tr key={row.id}>
                      <td>{row.title}</td>
                      <td>{row.assignee || '—'}</td>
                      <td>{row.dueDate.slice(0, 10)}</td>
                      <td>{row.status}</td>
                      <td>
                        <button type="button" className="auth-link" onClick={() => setTaskDraft({ ...row })}>
                          Edit
                        </button>
                        {' · '}
                        <button type="button" className="auth-link" onClick={() => ops.removeTask(row.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}

      {tab === 'selections' ? (
        <>
          <div className="data-page-actions" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="primary"
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
          <div className="data-table-wrap">
            {selections.length === 0 ? (
              <div className="data-empty">No selections.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Deadline</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {selections.map((row) => (
                    <tr key={row.id}>
                      <td>{row.title}</td>
                      <td>{row.category || '—'}</td>
                      <td>{row.status}</td>
                      <td>{row.deadline || '—'}</td>
                      <td>
                        <button type="button" className="auth-link" onClick={() => setSelDraft({ ...row })}>
                          Edit
                        </button>
                        {' · '}
                        <button type="button" className="auth-link" onClick={() => ops.removeSelection(row.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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
              <button type="button" onClick={() => setLogDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="primary">
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
                onChange={(e) =>
                  setTaskDraft({ ...taskDraft, status: e.target.value as OpsTask['status'] })
                }
              >
                <option value="incomplete">incomplete</option>
                <option value="complete">complete</option>
              </select>
            </label>
            <div className="data-form-actions">
              <button type="button" onClick={() => setTaskDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="primary">
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
                onChange={(e) =>
                  setSelDraft({ ...selDraft, status: e.target.value as OpsSelection['status'] })
                }
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
              <button type="button" onClick={() => setSelDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Save
              </button>
            </div>
          </form>
        ) : null}
      </EntityDrawer>
    </div>
  );
}

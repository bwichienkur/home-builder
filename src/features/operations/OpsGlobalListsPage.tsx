import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EntityDrawer } from '../crm/EntityCrmPage';
import {
  newOpsId,
  type OpsDailyLog,
  type OpsSelection,
  type OpsTask,
} from '../../lib/operations';
import { useOpsStore } from './useOpsStore';

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: 'min(360px, 100%)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          padding: '10px 12px',
        }}
      />
    </div>
  );
}

export function OpsTasksPage() {
  const ops = useOpsStore();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<OpsTask | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...ops.tasks].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    if (!q) return list;
    return list.filter((t) => JSON.stringify({ ...t, job: ops.jobName(t.jobId) }).toLowerCase().includes(q));
  }, [ops.tasks, ops.jobName, query]);

  return (
    <>
      <div className="data-page">
        <header className="data-page-header">
          <div>
            <p className="eyebrow">operations</p>
            <h1>All tasks</h1>
            <p className="muted">Past-due and open tasks across every job (seeded from BT drilldown rows).</p>
          </div>
          <div className="data-page-actions">
            <Link to="/ops" className="auth-link">
              Hub
            </Link>
            <button
              type="button"
              className="primary"
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
        <SearchBox value={query} onChange={setQuery} placeholder="Search tasks…" />
        <div className="data-table-wrap">
          {rows.length === 0 ? (
            <div className="data-empty">No tasks.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Title</th>
                  <th>Assignee</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link to={`/ops/jobs/${encodeURIComponent(row.jobId)}`} className="auth-link">
                        {ops.jobName(row.jobId)}
                      </Link>
                    </td>
                    <td>{row.title}</td>
                    <td>{row.assignee || '—'}</td>
                    <td>{row.dueDate || '—'}</td>
                    <td>{row.status}</td>
                    <td>
                      <button type="button" className="auth-link" onClick={() => setDraft({ ...row })}>
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

export function OpsLogsPage() {
  const ops = useOpsStore();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<OpsDailyLog | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...ops.logs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!q) return list;
    return list.filter((t) => JSON.stringify({ ...t, job: ops.jobName(t.jobId) }).toLowerCase().includes(q));
  }, [ops.logs, ops.jobName, query]);

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
            <Link to="/ops" className="auth-link">
              Hub
            </Link>
            <button
              type="button"
              className="primary"
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
        <SearchBox value={query} onChange={setQuery} placeholder="Search logs…" />
        <div className="data-table-wrap">
          {rows.length === 0 ? (
            <div className="data-empty">No logs.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Job</th>
                  <th>Author</th>
                  <th>PM?</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date.slice(0, 10)}</td>
                    <td>
                      <Link to={`/ops/jobs/${encodeURIComponent(row.jobId)}`} className="auth-link">
                        {ops.jobName(row.jobId)}
                      </Link>
                    </td>
                    <td>{row.author}</td>
                    <td>{row.isPm ? 'Yes' : 'No'}</td>
                    <td>{row.note || '—'}</td>
                    <td>
                      <button type="button" className="auth-link" onClick={() => setDraft({ ...row })}>
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

export function OpsSelectionsPage() {
  const ops = useOpsStore();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<OpsSelection | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...ops.selections].sort((a, b) => a.title.localeCompare(b.title));
    if (!q) return list;
    return list.filter((t) => JSON.stringify({ ...t, job: ops.jobName(t.jobId) }).toLowerCase().includes(q));
  }, [ops.selections, ops.jobName, query]);

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
            <Link to="/ops" className="auth-link">
              Hub
            </Link>
            <button
              type="button"
              className="primary"
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
        <SearchBox value={query} onChange={setQuery} placeholder="Search selections…" />
        <div className="data-table-wrap">
          {rows.length === 0 ? (
            <div className="data-empty">No selections.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Deadline</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link to={`/ops/jobs/${encodeURIComponent(row.jobId)}`} className="auth-link">
                        {ops.jobName(row.jobId)}
                      </Link>
                    </td>
                    <td>{row.title}</td>
                    <td>{row.category || '—'}</td>
                    <td>{row.status}</td>
                    <td>{row.deadline || '—'}</td>
                    <td>
                      <button type="button" className="auth-link" onClick={() => setDraft({ ...row })}>
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

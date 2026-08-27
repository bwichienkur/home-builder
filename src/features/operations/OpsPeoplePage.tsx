import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EntityDrawer } from '../crm/EntityCrmPage';
import { newOpsId, type OpsPerson } from '../../lib/operations';
import { useOpsStore } from './useOpsStore';

const emptyPerson = (): OpsPerson => ({
  id: newOpsId('person'),
  name: '',
  role: 'pm',
  updatedAt: new Date().toISOString(),
});

export function OpsPeoplePage() {
  const ops = useOpsStore();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<OpsPerson | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ops.people;
    return ops.people.filter((p) => JSON.stringify(p).toLowerCase().includes(q));
  }, [ops.people, query]);

  return (
    <>
      <div className="data-page">
        <header className="data-page-header">
          <div>
            <p className="eyebrow">operations</p>
            <h1>People</h1>
            <p className="muted">PMs and sales owners referenced on jobs and deals.</p>
          </div>
          <div className="data-page-actions">
            <Link to="/ops" className="auth-link">
              Hub
            </Link>
            <button type="button" className="primary" onClick={() => setDraft(emptyPerson())}>
              Add person
            </button>
          </div>
        </header>
        <div style={{ marginBottom: 12 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
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
            <div className="data-empty">No people yet.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((person) => (
                  <tr key={person.id}>
                    <td>{person.name}</td>
                    <td>{person.role}</td>
                    <td>
                      <button type="button" className="auth-link" onClick={() => setDraft({ ...person })}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <EntityDrawer title="Person" open={!!draft} onClose={() => setDraft(null)} fullscreen={false}>
        {draft ? (
          <form
            className="data-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!draft.name.trim()) return;
              ops.savePerson(draft);
              setDraft(null);
            }}
          >
            <label>
              Name
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
            </label>
            <label>
              Role
              <select
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as OpsPerson['role'] })}
              >
                <option value="pm">pm</option>
                <option value="sales">sales</option>
                <option value="other">other</option>
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

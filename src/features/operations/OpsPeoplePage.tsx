import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EntityDrawer } from '../crm/EntityCrmPage';
import { newOpsId, type OpsPerson } from '../../lib/operations';
import { OpsDataGrid, OpsRowActions } from './OpsDataGrid';
import { useOpsStore } from './useOpsStore';

const emptyPerson = (): OpsPerson => ({
  id: newOpsId('person'),
  name: '',
  role: 'pm',
  updatedAt: new Date().toISOString(),
});

export function OpsPeoplePage() {
  const ops = useOpsStore();
  const [draft, setDraft] = useState<OpsPerson | null>(null);
  const [roleFilter, setRoleFilter] = useState('');

  const rows = useMemo(() => {
    if (!roleFilter) return ops.people;
    return ops.people.filter((p) => p.role === roleFilter);
  }, [ops.people, roleFilter]);

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
            <Link to="/ops" className="ops-btn">
              Hub
            </Link>
            <button type="button" className="ops-btn primary" onClick={() => setDraft(emptyPerson())}>
              Add person
            </button>
          </div>
        </header>

        <OpsDataGrid
          rows={rows}
          getRowId={(p) => p.id}
          searchPlaceholder="Search people…"
          empty="No people match."
          initialSort={{ key: 'name', dir: 'asc' }}
          filters={[
            {
              id: 'role',
              label: 'Role',
              value: roleFilter,
              onChange: setRoleFilter,
              options: [
                { value: '', label: 'All' },
                { value: 'pm', label: 'pm' },
                { value: 'sales', label: 'sales' },
                { value: 'other', label: 'other' },
              ],
            },
          ]}
          columns={[
            { key: 'name', label: 'Name', getValue: (p) => p.name, render: (p) => p.name },
            { key: 'role', label: 'Role', getValue: (p) => p.role, render: (p) => p.role },
          ]}
          actions={(person) => <OpsRowActions onEdit={() => setDraft({ ...person })} />}
        />
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

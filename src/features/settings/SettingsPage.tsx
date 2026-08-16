import { FormEvent, useMemo, useState } from 'react';
import type { CustomFieldDefinition, CustomFieldType, EntityKind } from '../../lib/crm/types';
import { platformConfig } from '../../lib/platform/config';
import { useCrmStore } from '../../store/crmStore';

const TYPES: CustomFieldType[] = ['text', 'number', 'bool', 'date', 'select'];

const OBJECTS: { id: EntityKind; label: string; blurb: string }[] = [
  { id: 'client', label: 'Clients', blurb: 'Only appear on client forms and client CSV.' },
  { id: 'vendor', label: 'Vendors', blurb: 'Only appear on vendor forms and vendor CSV.' },
  { id: 'inventory', label: 'Inventory', blurb: 'Only appear on inventory forms and inventory CSV.' },
];

export function SettingsPage() {
  const fields = useCrmStore((s) => s.customFields);
  const upsert = useCrmStore((s) => s.upsertCustomField);
  const archive = useCrmStore((s) => s.archiveCustomField);
  const [object, setObject] = useState<EntityKind>('client');
  const [draft, setDraft] = useState<CustomFieldDefinition | null>(null);
  const [error, setError] = useState('');

  const activeMeta = OBJECTS.find((o) => o.id === object)!;
  const objectFields = useMemo(
    () =>
      fields
        .filter((f) => f.entity === object && !f.archived)
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)),
    [fields, object],
  );

  const startNew = () => {
    setError('');
    setDraft({
      id: crypto.randomUUID(),
      entity: object,
      key: '',
      label: '',
      type: 'text',
      required: false,
      options: [],
      order: objectFields.length,
      archived: false,
    });
  };

  const saveDraft = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!/^[a-z][a-z0-9_]*$/.test(draft.key)) {
      setError('Key must start with a letter and use only lowercase letters, numbers, and underscores.');
      return;
    }
    const clash = fields.some(
      (f) =>
        !f.archived &&
        f.entity === draft.entity &&
        f.key === draft.key &&
        f.id !== draft.id,
    );
    if (clash) {
      setError(`A ${draft.entity} field already uses the key “${draft.key}”.`);
      return;
    }
    upsert({ ...draft, entity: object });
    setDraft(null);
    setError('');
  };

  return (
    <div className="data-page">
      <header className="data-page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Custom fields</h1>
          <p className="muted">
            Fields are scoped per object. Client fields never show on vendors or inventory (and vice versa).
          </p>
          <p className="muted" style={{ marginTop: 8 }}>
            Platform: <strong>{platformConfig.label()}</strong>
          </p>
        </div>
        <div className="data-page-actions">
          <button type="button" className="primary" onClick={startNew}>
            Add {activeMeta.label.toLowerCase().replace(/s$/, '')} field
          </button>
        </div>
      </header>

      <div className="settings-object-tabs" role="tablist" aria-label="Object type">
        {OBJECTS.map((o) => {
          const count = fields.filter((f) => f.entity === o.id && !f.archived).length;
          return (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={object === o.id}
              className={object === o.id ? 'is-active' : undefined}
              onClick={() => {
                setObject(o.id);
                setDraft(null);
                setError('');
              }}
            >
              {o.label}
              <span className="settings-object-count">{count}</span>
            </button>
          );
        })}
      </div>
      <p className="muted settings-object-blurb">{activeMeta.blurb}</p>

      <div className="data-table-wrap">
        {objectFields.length === 0 ? (
          <div className="data-empty">
            No custom fields for {activeMeta.label.toLowerCase()} yet. Add one to extend forms and CSV for this object
            only.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Key</th>
                <th>Type</th>
                <th>Required</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {objectFields.map((f) => (
                <tr key={f.id}>
                  <td>{f.label}</td>
                  <td>
                    <code>{f.key}</code>
                  </td>
                  <td>{f.type}</td>
                  <td>{f.required ? 'Yes' : 'No'}</td>
                  <td>
                    <button
                      type="button"
                      className="auth-link"
                      onClick={() => {
                        setError('');
                        setDraft({ ...f });
                      }}
                    >
                      Edit
                    </button>
                    {' · '}
                    <button type="button" className="auth-link" onClick={() => archive(f.id)}>
                      Archive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {draft && (
        <div
          className="data-drawer"
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && setDraft(null)}
        >
          <div className="data-drawer-panel" role="dialog" aria-modal="true">
            <h2>
              {fields.some((f) => f.id === draft.id) ? 'Edit' : 'Add'} {activeMeta.label.toLowerCase().replace(/s$/, '')}{' '}
              field
            </h2>
            <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
              Applies only to <strong>{activeMeta.label}</strong> — not other objects.
            </p>
            <form className="data-form" onSubmit={saveDraft}>
              <label>
                Label
                <input
                  required
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                />
              </label>
              <label>
                Key
                <input
                  required
                  pattern="^[a-z][a-z0-9_]*$"
                  value={draft.key}
                  onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                  placeholder="lead_source"
                />
              </label>
              <label>
                Type
                <select
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value as CustomFieldType })}
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              {draft.type === 'select' && (
                <label>
                  Options (comma-separated)
                  <input
                    value={draft.options.join(', ')}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        options: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
              )}
              <label>
                <span>Required</span>
                <input
                  type="checkbox"
                  checked={draft.required}
                  onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
                />
              </label>
              {error && <p className="auth-error">{error}</p>}
              <div className="data-form-actions">
                <button type="submit" className="primary">
                  Save
                </button>
                <button type="button" onClick={() => setDraft(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

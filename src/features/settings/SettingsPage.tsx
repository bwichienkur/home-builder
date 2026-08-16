import { FormEvent, useState } from 'react';
import type { CustomFieldDefinition, CustomFieldType, EntityKind } from '../../lib/crm/types';
import { platformConfig } from '../../lib/platform/config';
import { useCrmStore } from '../../store/crmStore';

const TYPES: CustomFieldType[] = ['text', 'number', 'bool', 'date', 'select'];
const ENTITIES: EntityKind[] = ['client', 'vendor', 'inventory'];

export function SettingsPage() {
  const fields = useCrmStore((s) => s.customFields);
  const upsert = useCrmStore((s) => s.upsertCustomField);
  const archive = useCrmStore((s) => s.archiveCustomField);
  const [draft, setDraft] = useState<CustomFieldDefinition | null>(null);

  const startNew = () =>
    setDraft({
      id: crypto.randomUUID(),
      entity: 'client',
      key: '',
      label: '',
      type: 'text',
      required: false,
      options: [],
      order: fields.length,
      archived: false,
    });

  return (
    <div className="data-page">
      <header className="data-page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Custom fields</h1>
          <p className="muted">
            Configure extra fields for clients, vendors, and inventory. They appear on forms and CSV templates.
          </p>
          <p className="muted" style={{ marginTop: 8 }}>
            Platform: <strong>{platformConfig.label()}</strong> — see docs/ZERO_COST_TO_PAID.md to switch later.
          </p>
        </div>
        <div className="data-page-actions">
          <button type="button" className="primary" onClick={startNew}>
            Add field
          </button>
        </div>
      </header>

      <div className="data-table-wrap">
        {fields.filter((f) => !f.archived).length === 0 ? (
          <div className="data-empty">No custom fields yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Label</th>
                <th>Key</th>
                <th>Type</th>
                <th>Required</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fields
                .filter((f) => !f.archived)
                .sort((a, b) => a.entity.localeCompare(b.entity) || a.order - b.order)
                .map((f) => (
                  <tr key={f.id}>
                    <td>{f.entity}</td>
                    <td>{f.label}</td>
                    <td>
                      <code>{f.key}</code>
                    </td>
                    <td>{f.type}</td>
                    <td>{f.required ? 'Yes' : 'No'}</td>
                    <td>
                      <button type="button" className="auth-link" onClick={() => setDraft({ ...f })}>
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
        <div className="data-drawer" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setDraft(null)}>
          <div className="data-drawer-panel" role="dialog" aria-modal="true">
            <h2>{fields.some((f) => f.id === draft.id) ? 'Edit field' : 'Add field'}</h2>
            <form
              className="data-form"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!/^[a-z][a-z0-9_]*$/.test(draft.key)) return;
                upsert(draft);
                setDraft(null);
              }}
            >
              <label>
                Entity
                <select
                  value={draft.entity}
                  onChange={(e) => setDraft({ ...draft, entity: e.target.value as EntityKind })}
                >
                  {ENTITIES.map((en) => (
                    <option key={en} value={en}>
                      {en}
                    </option>
                  ))}
                </select>
              </label>
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

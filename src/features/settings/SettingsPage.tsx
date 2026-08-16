import { FormEvent, useMemo, useState } from 'react';
import {
  CORE_CSV,
  coreFieldLabel,
  type CustomFieldDefinition,
  type CustomFieldType,
  type EntityKind,
} from '../../lib/crm/types';
import { platformConfig } from '../../lib/platform/config';
import { useCrmStore } from '../../store/crmStore';

const TYPES: CustomFieldType[] = ['text', 'number', 'bool', 'date', 'select'];

const OBJECTS: { id: EntityKind; label: string; blurb: string }[] = [
  { id: 'client', label: 'Clients', blurb: 'Built-in and custom fields on client forms and CSV.' },
  { id: 'vendor', label: 'Vendors', blurb: 'Built-in and custom fields on vendor forms and CSV.' },
  { id: 'inventory', label: 'Inventory', blurb: 'Built-in and custom fields on inventory forms, CSV, and the Build shop.' },
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
  const builtinKeys = CORE_CSV[object];

  const fieldsByObject = useMemo(() => {
    const map: Record<EntityKind, CustomFieldDefinition[]> = {
      client: [],
      vendor: [],
      inventory: [],
    };
    for (const f of fields) {
      if (f.archived) continue;
      map[f.entity].push(f);
    }
    for (const kind of Object.keys(map) as EntityKind[]) {
      map[kind].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    }
    return map;
  }, [fields]);

  const startNew = (entity: EntityKind = object) => {
    setObject(entity);
    setError('');
    setDraft({
      id: crypto.randomUUID(),
      entity,
      key: '',
      label: '',
      type: 'text',
      required: false,
      options: [],
      order: fieldsByObject[entity].length,
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
    if (CORE_CSV[draft.entity].includes(draft.key)) {
      setError(`“${draft.key}” is already a built-in ${draft.entity} field.`);
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
    upsert({ ...draft, entity: draft.entity });
    setObject(draft.entity);
    setDraft(null);
    setError('');
  };

  const draftMeta = OBJECTS.find((o) => o.id === (draft?.entity ?? object))!;

  return (
    <div className="data-page">
      <header className="data-page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Fields</h1>
          <p className="muted">
            Built-in fields ship with each object. Custom fields are scoped per object and never cross clients,
            vendors, or inventory.
          </p>
          <p className="muted" style={{ marginTop: 8 }}>
            Platform: <strong>{platformConfig.label()}</strong>
          </p>
        </div>
        <div className="data-page-actions">
          <button type="button" className="primary" onClick={() => startNew(object)}>
            Add {activeMeta.label.toLowerCase().replace(/s$/, '')} custom field
          </button>
        </div>
      </header>

      <section className="settings-all-objects" aria-label="Current fields by object">
        <h2 className="settings-section-title">Current fields by object</h2>
        <div className="settings-object-overview">
          {OBJECTS.map((o) => {
            const custom = fieldsByObject[o.id];
            return (
              <article key={o.id} className="settings-object-card">
                <header>
                  <h3>{o.label}</h3>
                  <button type="button" className="auth-link" onClick={() => setObject(o.id)}>
                    Manage
                  </button>
                </header>
                <p className="muted">{o.blurb}</p>
                <div className="settings-field-group">
                  <span className="settings-field-group-label">Built-in ({CORE_CSV[o.id].length})</span>
                  <div className="settings-field-chips">
                    {CORE_CSV[o.id].map((key) => (
                      <span key={key} className="settings-field-chip is-builtin" title={key}>
                        {coreFieldLabel(key)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="settings-field-group">
                  <span className="settings-field-group-label">Custom ({custom.length})</span>
                  {custom.length === 0 ? (
                    <p className="muted settings-field-empty">No custom fields yet.</p>
                  ) : (
                    <div className="settings-field-chips">
                      {custom.map((f) => (
                        <span key={f.id} className="settings-field-chip is-custom" title={f.key}>
                          {f.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="settings-object-tabs" role="tablist" aria-label="Object type">
        {OBJECTS.map((o) => {
          const count = fieldsByObject[o.id].length;
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

      <section className="settings-field-block">
        <div className="settings-field-block-head">
          <h2 className="settings-section-title">Built-in {activeMeta.label.toLowerCase()} fields</h2>
          <span className="muted">{builtinKeys.length} on forms &amp; CSV</span>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Key</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {builtinKeys.map((key) => (
                <tr key={key}>
                  <td>{coreFieldLabel(key)}</td>
                  <td>
                    <code>{key}</code>
                  </td>
                  <td>Built-in</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="settings-field-block">
        <div className="settings-field-block-head">
          <h2 className="settings-section-title">Custom {activeMeta.label.toLowerCase()} fields</h2>
          <button type="button" className="auth-link" onClick={() => startNew(object)}>
            Add custom field
          </button>
        </div>
        <div className="data-table-wrap">
          {objectFields.length === 0 ? (
            <div className="data-empty">
              No custom fields for {activeMeta.label.toLowerCase()} yet. Built-in fields above always appear on forms;
              add a custom field to extend this object only.
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
      </section>

      {draft && (
        <div
          className="data-drawer data-drawer-fullscreen"
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && setDraft(null)}
        >
          <div className="data-drawer-panel data-drawer-panel-full" role="dialog" aria-modal="true">
            <div className="data-drawer-header">
              <h2>
                {fields.some((f) => f.id === draft.id) ? 'Edit' : 'Add'}{' '}
                {draftMeta.label.toLowerCase().replace(/s$/, '')} custom field
              </h2>
              <button type="button" className="data-drawer-close" onClick={() => setDraft(null)}>
                Close
              </button>
            </div>
            <div className="data-drawer-body">
              <form className="data-form" onSubmit={saveDraft}>
                <p className="muted" style={{ margin: 0 }}>
                  Applies only to <strong>{draftMeta.label}</strong> — not other objects.
                </p>
                <label>
                  Object
                  <select
                    value={draft.entity}
                    onChange={(e) => setDraft({ ...draft, entity: e.target.value as EntityKind })}
                    disabled={fields.some((f) => f.id === draft.id)}
                  >
                    {OBJECTS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
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
                <label className="data-form-check">
                  <input
                    type="checkbox"
                    checked={draft.required}
                    onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
                  />
                  Required
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
        </div>
      )}
    </div>
  );
}
